import { Resend } from "resend";
import logger from "./logger.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOtpEmail = async (to, code) => {
  logger.info(`[MAILER] Sending OTP to ${to}`);

  const { data, error } = await resend.emails.send({
    from: "Eato <onboarding@resend.dev>",
    to: [to],
    subject: "Your Eato Verification Code",
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#ff4c1b;margin-bottom:8px">Eato</h2>
        <p style="color:#555">Use the code below to verify your email address.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#181C2E;padding:24px 0;text-align:center;">
          ${code}
        </div>
        <p style="color:#888;font-size:13px">Expires in <strong>10 minutes</strong>. Never share this code.</p>
      </div>
    `,
  });

  if (error) {
    logger.error(`[MAILER] Failed: ${JSON.stringify(error)}`);
    throw new Error(error.message);
  }

  logger.info(`[MAILER] ✅ Sent — id: ${data.id}`);
  return data;
};