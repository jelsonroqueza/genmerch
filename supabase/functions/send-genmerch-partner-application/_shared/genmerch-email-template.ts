export type GenmerchEmailTone = "success" | "info" | "warning" | "danger" | "brand";

export interface GenmerchEmailOptions {
  preheader?: unknown;
  headline: unknown;
  icon?: unknown;
  tone?: GenmerchEmailTone;
  greeting?: unknown;
  intro?: unknown;
  bodyHtml?: string;
  progressHtml?: string;
  noticeTitle?: unknown;
  notice?: unknown;
  noticeTone?: GenmerchEmailTone;
  actionLabel?: unknown;
  actionUrl?: unknown;
  actionNote?: unknown;
  footerNote?: unknown;
}

function emailEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function safeEmailUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url) || /^mailto:[^\s"'<>]+$/i.test(url)) return emailEscape(url);
  return "https://shopgenmerch.com/";
}

const emailToneStyles: Record<GenmerchEmailTone, { background: string; foreground: string; border: string }> = {
  success: { background: "#e7f8ef", foreground: "#08784c", border: "#b9e9d0" },
  info: { background: "#edf6ff", foreground: "#225e91", border: "#cfe5fa" },
  warning: { background: "#fff6e6", foreground: "#805400", border: "#f1dfb3" },
  danger: { background: "#fff0f0", foreground: "#a32029", border: "#f0caca" },
  brand: { background: "#fff5f3", foreground: "#b51c25", border: "#f3d5d0" },
};

export function renderGenmerchEmail(options: GenmerchEmailOptions): string {
  const tone = emailToneStyles[options.tone || "brand"];
  const noticeTone = emailToneStyles[options.noticeTone || "info"];
  const preheader = emailEscape(options.preheader || "A GENMERCH update for you.");
  const headline = emailEscape(options.headline);
  const icon = emailEscape(options.icon || "•");
  const greeting = options.greeting
    ? '<p style="margin:20px 0 8px;text-align:center;font-size:16px;line-height:1.6;color:#202328;font-weight:700">' + emailEscape(options.greeting) + '</p>'
    : "";
  const intro = options.intro
    ? '<p style="margin:0 auto 4px;max-width:500px;text-align:center;font-size:14px;line-height:1.75;color:#505762">' + emailEscape(options.intro) + '</p>'
    : "";
  const bodyHtml = options.bodyHtml || "";
  const progressHtml = options.progressHtml || "";
  const notice = options.notice
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;border-collapse:separate;border-spacing:0"><tr><td style="padding:14px 16px;background:' + noticeTone.background + ';border:1px solid ' + noticeTone.border + ';border-radius:9px;color:' + noticeTone.foreground + ';font-size:13px;line-height:1.7"><strong style="display:block;margin-bottom:4px;font-size:13px">' + emailEscape(options.noticeTitle || "Important information") + '</strong>' + emailEscape(options.notice) + '</td></tr></table>'
    : "";
  let action = "";
  if (options.actionLabel && options.actionUrl) {
    action = '<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:24px auto 0;border-collapse:separate"><tr><td align="center" bgcolor="#d10c22" style="border-radius:9px;background:#d10c22"><a href="' + safeEmailUrl(options.actionUrl) + '" style="display:inline-block;padding:14px 28px;min-width:190px;text-align:center;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.25;font-weight:800;text-decoration:none;border-radius:9px">' + emailEscape(options.actionLabel) + '</a></td></tr></table>';
  }
  const actionNote = options.actionNote
    ? '<p style="margin:10px 0 0;text-align:center;color:#6e737c;font-size:12px;line-height:1.6">' + emailEscape(options.actionNote) + '</p>'
    : "";
  const footerNote = options.footerNote
    ? '<div style="margin-top:10px;color:#aab1ba;font-size:11px;line-height:1.6">' + emailEscape(options.footerNote) + '</div>'
    : "";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>' +
    '<body style="margin:0;padding:0;background:#edf0f2;font-family:Arial,Helvetica,sans-serif;color:#202328;-webkit-text-size-adjust:100%">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + preheader + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#edf0f2" style="width:100%;background:#edf0f2;border-collapse:collapse"><tr><td align="center" style="padding:24px 10px 30px">' +
    '<table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #e3e7eb;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0">' +
    '<tr><td align="center" bgcolor="#c80d21" style="padding:26px 22px 22px;background:#c80d21;color:#ffffff;text-align:center">' +
    '<div style="margin:0;color:#ffffff;font-size:29px;line-height:1.2;font-weight:900;letter-spacing:5px">GENMERCH</div>' +
    '<div style="margin-top:7px;color:#ffffff;font-size:10px;line-height:1.5;font-weight:700;letter-spacing:3px">QUALITY MERCH FOR EVERY FAN</div>' +
    '</td></tr><tr><td height="7" bgcolor="#9f0818" style="height:7px;background:#9f0818;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:24px 24px 26px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;background:#fff7f6;border:1px solid #f4dedb;border-radius:10px"><tr><td align="center" style="padding:24px 18px 22px">' +
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0"><tr><td align="center" valign="middle" bgcolor="' + tone.background + '" style="width:62px;height:62px;border-radius:50%;background:' + tone.background + ';border:1px solid ' + tone.border + ';color:' + tone.foreground + ';font-size:30px;line-height:62px;font-weight:800;text-align:center">' + icon + '</td></tr></table>' +
    '<h1 style="margin:14px 0 0;color:#111418;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:1.25;font-weight:900;text-align:center">' + headline + '</h1>' +
    greeting + intro + '</td></tr></table>' +
    bodyHtml + progressHtml + notice + action + actionNote +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:separate;border-spacing:0;background:#fff7f5;border:1px solid #f2dfdb;border-radius:10px"><tr><td align="center" style="padding:17px 18px;text-align:center">' +
    '<div style="font-size:15px;line-height:1.4;font-weight:800;color:#24282d">Need Help?</div>' +
    '<p style="margin:5px 0 13px;font-size:12px;line-height:1.65;color:#59616c">Our support team is here for you. Please include your order or reference number when contacting us.</p>' +
    '<a href="mailto:negosyonipinoy@yahoo.com.ph" style="display:inline-block;padding:10px 18px;border:1px solid #d10c22;border-radius:7px;color:#c80d21;font-size:13px;line-height:1.2;font-weight:800;text-decoration:none">Contact Support</a>' +
    '</td></tr></table>' +
    '</td></tr><tr><td align="center" bgcolor="#11191e" style="padding:22px 20px;background:#11191e;color:#ffffff;text-align:center">' +
    '<div style="font-size:22px;line-height:1.3;font-weight:900;letter-spacing:3px;color:#ffffff">GEN<span style="color:#f12637">MERCH</span></div>' +
    '<div style="margin-top:4px;font-size:9px;line-height:1.6;letter-spacing:2px;color:#d7dce0">QUALITY MERCH FOR EVERY FAN</div>' +
    '<div style="margin-top:15px;font-size:12px;line-height:1.7">' +
    '<a href="https://www.facebook.com/nnp2012.genmerch/" style="color:#ffffff;text-decoration:none">Facebook</a>' +
    '<span style="color:#7d8991"> &nbsp; | &nbsp; </span>' +
    '<a href="https://www.instagram.com/nnp2012.productsservices" style="color:#ffffff;text-decoration:none">Instagram</a>' +
    '<span style="color:#7d8991"> &nbsp; | &nbsp; </span>' +
    '<a href="https://shopgenmerch.com/" style="color:#ffffff;text-decoration:none">Visit GENMERCH</a></div>' +
    '<div style="margin-top:15px;color:#aab1ba;font-size:11px;line-height:1.7">© ' + new Date().getFullYear() + ' GENMERCH. All rights reserved.<br>This is an automated email. Please do not share passwords or verification codes by email.</div>' +
    footerNote + '</td></tr></table></td></tr></table></body></html>';
}
