import "dotenv/config";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.resolve(__dirname, "../public/logo.jpg");

const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_KEY,
    },
});

export async function sendAttendanceEmail({
    to,
    studentName,
    subjects,
}) {
    const subject = "Attendance Warning – Below 75%";

    const subjectRows = subjects
        .map(
            (item) =>
                `<li style="margin-bottom: 6px;"><strong>${item.subject}</strong>: <span style="color: #dc2626; font-weight: bold;">${item.attendance}%</span></li>`
        )
        .join("");

    const hasLogo = fs.existsSync(logoPath);

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background-color: #0b3b60; padding: 24px; text-align: center;">
        ${hasLogo ? `<img src="cid:attendpulse_logo@app" alt="AttendPulse Logo" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid #f59e0b; margin-bottom: 8px;" />` : ""}
        <h2 style="color: #ffffff; margin: 4px 0 0 0; font-size: 22px;">AttendPulse</h2>
        <p style="color: #f59e0b; margin: 4px 0 0 0; font-size: 11px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Attend Today • Brighter Tomorrows</p>
      </div>
      <div style="padding: 24px; background-color: #ffffff; color: #1e293b; line-height: 1.6;">
        <h3 style="color: #dc2626; margin-top: 0; font-size: 18px;">Attendance Warning – Below 75%</h3>
        <p style="font-size: 14px;">Dear Parent/Guardian,</p>

        <p style="font-size: 14px;">
          This is an official notice to inform you that your ward
          <strong style="color: #0b3b60;">${studentName}</strong>
          has attendance below the required 75% threshold in the following subject(s):
        </p>

        <ul style="background-color: #f8fafc; padding: 16px 24px 16px 36px; border-radius: 8px; border-left: 4px solid #dc2626; font-size: 14px;">
          ${subjectRows}
        </ul>

        <p style="font-size: 14px;">
          Kindly ensure that your ward attends all upcoming classes regularly to maintain the mandatory attendance criteria.
        </p>

        <p style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; color: #64748b; font-size: 13px;">
          Regards,<br>
          <strong style="color: #0b3b60;">AttendPulse Monitoring Team</strong>
        </p>
      </div>
    </div>
  `;

    const mailOptions = {
        from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
        to,
        subject,
        html,
        attachments: hasLogo ? [
            {
                filename: "logo.jpg",
                path: logoPath,
                cid: "attendpulse_logo@app"
            }
        ] : []
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("[EMAIL] Sent successfully with logo attachment:", info.messageId);

    return info;
}

// Test email
if (process.argv[1]?.endsWith("emailService.js")) {
    sendAttendanceEmail({
        to: "vincentjenifer16629@gmail.com",
        studentName: "Test Student",
        subjects: [
            {
                subject: "Mathematics",
                attendance: 68,
            },
            {
                subject: "Computer Science",
                attendance: 72,
            },
        ],
    })
        .then(() => {
            console.log("[EMAIL] Test completed");
            process.exit(0);
        })
        .catch((error) => {
            console.error("[EMAIL] Test failed:", error);
            process.exit(1);
        });
}