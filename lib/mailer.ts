import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Outgoing email over SMTP (works with Gmail app passwords, Zoho, Brevo, cPanel mail, etc.).
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com  SMTP_PASS=app-password
 *   MAIL_FROM="Xynex Vision <you@gmail.com>"
 * If SMTP isn't configured, in development the email is printed to the terminal instead.
 */
export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendMail(to: string, subject: string, text: string): Promise<'sent' | 'logged' | 'unconfigured' | 'failed'> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n──────── EMAIL (SMTP not configured — printed here instead) ────────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n────────────────────────────────────────────────────────────────────\n`);
      return 'logged';
    }
    console.error('[mail] SMTP is not configured; could not send:', subject);
    return 'unconfigured';
  }
  const port = Number(process.env.SMTP_PORT || 465);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return 'sent';
  } catch (e) {
    console.error('[mail] send failed', e);
    return 'failed';
  }
}
