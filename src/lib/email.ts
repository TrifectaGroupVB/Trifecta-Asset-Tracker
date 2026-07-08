import { Resend } from "resend";

type EmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

// Sends via Resend when RESEND_API_KEY is set; otherwise logs to the console.
// Missing email config must never break a request.
export async function sendEmail({ to, subject, text, html }: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "Trifecta Asset Tracker <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `[email] RESEND_API_KEY not set — logging instead of sending\n` +
        `  to: ${Array.isArray(to) ? to.join(", ") : to}\n` +
        `  subject: ${subject}\n` +
        `--- body ---\n${text}\n------------`
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, text, ...(html ? { html } : {}) });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}
