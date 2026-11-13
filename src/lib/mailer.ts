import nodemailer from 'nodemailer'

// Gmail SMTP via app password (SMTP_USER / SMTP_PASS in .env).
// Lazily created so importing this module never crashes when SMTP env is
// missing — sendMail() reports the problem instead.
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter()
  if (!t) return { ok: false, error: 'SMTP is not configured (SMTP_USER / SMTP_PASS missing in .env)' }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    return { ok: true }
  } catch (err) {
    console.error('sendMail failed:', err)
    return { ok: false, error: 'Failed to send email' }
  }
}

/** Simple branded OTP email. */
export function otpEmailHTML(code: string, purpose: string): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
    <h2 style="color:#0F7A87;margin:0 0 4px;">Verification code</h2>
    <p style="color:#475569;font-size:14px;margin:0 0 16px;">${purpose}</p>
    <div style="text-align:center;background:#f0fdfa;border:1px dashed #0F7A87;border-radius:10px;padding:18px;font-size:32px;font-weight:800;letter-spacing:8px;color:#0F7A87;">${code}</div>
    <p style="color:#64748b;font-size:12px;margin:16px 0 0;">This code expires in 5 minutes. If you didn't request it, ignore this email — your account stays safe as long as your password is not shared.</p>
  </div>`
}
