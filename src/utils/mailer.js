import nodemailer from "nodemailer";
import logger from "./logger.js";

const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: {
    user: "resend",
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    logger.error(`[MAILER] Connection FAILED: ${err.message}`);
  } else {
    logger.info(`[MAILER] ✅ SMTP ready`);
  }
});

export const sendOtpEmail = async (to, code) => {
  logger.info(`[MAILER] Sending OTP to ${to}`);

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Your Eato Verification Code",
    text: `Your OTP is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#ff4c1b;margin-bottom:8px">Eato</h2>
        <p style="color:#555">Use the code below to verify your email address.</p>

        <div style="
          font-size:36px;
          font-weight:700;
          letter-spacing:10px;
          color:#181C2E;
          padding:24px 0;
          text-align:center;
        ">
          ${code}
        </div>

        <p style="color:#888;font-size:13px">
          Expires in <strong>10 minutes</strong>. Never share this code.
        </p>
      </div>
    `,
  });

  logger.info(
    `[MAILER] ✅ OTP sent to ${to} — messageId: ${info.messageId}`
  );

  return info;
};