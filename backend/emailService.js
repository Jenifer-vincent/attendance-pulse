import "dotenv/config";
import nodemailer from "nodemailer";

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
                `<li><strong>${item.subject}</strong>: ${item.attendance}%</li>`
        )
        .join("");

    const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>Attendance Warning</h2>

      <p>Dear Parent/Guardian,</p>

      <p>
        This is to inform you that your ward
        <strong>${studentName}</strong>
        has attendance below 75% in the following subject(s):
      </p>

      <ul>
        ${subjectRows}
      </ul>

      <p>
        Kindly ensure that your ward attends classes regularly.
      </p>

      <p>
        Regards,<br>
        Attendance Alert System
      </p>
    </div>
  `;

    const info = await transporter.sendMail({
        from: `"${process.env.BREVO_FROM_NAME}" <${process.env.BREVO_FROM_EMAIL}>`,
        to,
        subject,
        html,
    });

    console.log("[EMAIL] Sent successfully:", info.messageId);

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