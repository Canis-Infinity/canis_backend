const env = require('../config/env');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createContactEmail(contact) {
  const sentAt = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(contact.createdAt || new Date());
  const replyLabel = contact.replyPreference === 'email' ? '希望透過 Email 回覆' : '不需要回覆';
  const subject = `[Canis Den｜${contact.category}] ${contact.subject}`;
  const safeMessage = escapeHtml(contact.message).replaceAll('\n', '<br />');
  const html = `<!doctype html><html lang="zh-TW"><body style="margin:0;background:#f5f5f5;color:#171717;font-family:Arial,sans-serif"><div style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px"><tr><td style="padding:24px 28px;background:#171717;color:#fff"><div style="font-size:12px;opacity:.7">CANIS DEN</div><h1 style="margin:8px 0 0;font-size:22px">${escapeHtml(contact.subject)}</h1></td></tr><tr><td style="padding:28px"><p><strong>姓名：</strong>${escapeHtml(contact.name)}</p><p><strong>Email：</strong><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></p><p><strong>類型：</strong>${escapeHtml(contact.category)}</p><p><strong>回覆：</strong>${escapeHtml(replyLabel)}</p><p><strong>送出時間：</strong>${escapeHtml(sentAt)}</p><hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0"><div style="padding:18px;background:#fafafa;border-radius:8px;line-height:1.8">${safeMessage}</div></td></tr></table></div></body></html>`;
  const text = [subject, '', `姓名：${contact.name}`, `Email：${contact.email}`, `類型：${contact.category}`, `回覆：${replyLabel}`, `送出時間：${sentAt}`, '', contact.message].join('\n');
  return { subject, html, text };
}

async function sendContactNotification(contact) {
  if (!env.resendApiKey || !env.contactFromEmail || !env.contactToEmail) {
    return { status: 'skipped', error: 'Resend 尚未設定' };
  }

  const email = createContactEmail(contact);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `contact-${contact._id}`,
    },
    body: JSON.stringify({
      from: env.contactFromEmail,
      to: [env.contactToEmail],
      reply_to: contact.email,
      ...email,
    }),
  });

  if (!response.ok) throw new Error(`Resend API 回應 ${response.status}`);
  const result = await response.json();
  return { status: 'sent', messageId: result.id || '' };
}

module.exports = { sendContactNotification };
