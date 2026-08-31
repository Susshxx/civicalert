import nodemailer from 'nodemailer';

const mailConfigured = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every((key) => Boolean(process.env[key]));

const mailTransport = mailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure:
        String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
        Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const body = request.body || {};
  const { to, subject, text, html } = body;

  if (!to || !subject || !text) {
    return response.status(400).json({ error: 'Missing report email details.' });
  }

  if (!mailTransport) {
    return response.status(503).json({ error: 'SMTP email configuration is missing.' });
  }

  try {
    await mailTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    return response.status(200).json({ sent: true });
  } catch (error) {
    return response.status(502).json({ error: error.message || 'Failed to send authority email.' });
  }
}
