import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/attendance/notify-parent") {
        try {
          const body = (await request.json()) as any;
          const { studentName, parentEmail, flaggedSubjects } = body || {};

          if (!parentEmail || typeof parentEmail !== "string" || !parentEmail.includes("@")) {
            return new Response(
              JSON.stringify({ success: false, message: "Valid parent email is required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          if (!studentName || typeof studentName !== "string") {
            return new Response(
              JSON.stringify({ success: false, message: "Student name is required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          if (!Array.isArray(flaggedSubjects)) {
            return new Response(
              JSON.stringify({ success: false, message: "Flagged subjects must be an array" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const recipient =
            process.env.TEST_MODE === "true" && process.env.TEST_NOTIFICATION_EMAIL
              ? process.env.TEST_NOTIFICATION_EMAIL
              : parentEmail.trim();

          const { sendAttendanceEmail } = await import("../backend/emailService.js");
          await sendAttendanceEmail({
            to: recipient,
            studentName: studentName.trim(),
            subjects: flaggedSubjects,
          });

          return new Response(
            JSON.stringify({ success: true, message: "Attendance email sent successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error: any) {
          console.error("[EMAIL API ERROR]", error);
          return new Response(
            JSON.stringify({ success: false, message: error?.message || "Failed to send email" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
