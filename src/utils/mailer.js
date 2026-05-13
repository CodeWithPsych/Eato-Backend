import nodemailer from "nodemailer";
import logger from "./logger.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a 6-digit OTP email to the owner.
 * @param {string} to    - recipient email
 * @param {string} code  - 6-digit OTP
 */
export const sendOtpEmail = async (to, code) => {
  const info = await transporter.sendMail({
    from: `"Eato" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: "Your Eato Verification Code",
    text: `Your OTP is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#ff4c1b;margin-bottom:8px">Eato</h2>
        <p style="color:#555">Use the code below to verify your email address.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#181C2E;padding:24px 0">
          ${code}
        </div>
        <p style="color:#888;font-size:13px">Expires in <strong>10 minutes</strong>. Never share this code.</p>
      </div>
    `,
  });

  logger.info(`[MAILER] OTP sent to ${to} — messageId: ${info.messageId}`);
};