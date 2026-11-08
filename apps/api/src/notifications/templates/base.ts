import { formatVnd } from '@cc/core';

export { formatVnd };

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BaseLayoutOptions {
  title: string;
  previewText?: string;
  contentHtml: string;
  appOrigin?: string;
  lang?: 'vi' | 'en';
}

export function renderBaseHtmlLayout(options: BaseLayoutOptions): string {
  const { title, previewText, contentHtml, appOrigin = 'https://app.coincrew.io', lang = 'vi' } = options;

  const footerText =
    lang === 'vi'
      ? `Bạn nhận được email này vì đang tham gia nhóm trên Coin Crew. Để điều chỉnh thông báo, vui lòng truy cập <a href="${escapeHtml(
          appOrigin
        )}/account" style="color: #2563eb; text-decoration: underline;">cài đặt tài khoản</a>.`
      : `You received this email because you are part of a group on Coin Crew. To manage notifications, visit <a href="${escapeHtml(
          appOrigin
        )}/account" style="color: #2563eb; text-decoration: underline;">account settings</a>.`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 580px;
      margin: 24px auto;
      background-color: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }
    .header {
      background-color: #0f172a;
      padding: 20px 24px;
      text-align: left;
    }
    .brand-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    .brand-subtitle {
      margin: 4px 0 0 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .content {
      padding: 24px;
    }
    .tabular-nums {
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 600;
    }
    .footer {
      padding: 20px 24px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      line-height: 1.6;
      color: #64748b;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0;
        border-radius: 0;
        border: none;
      }
      .content {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  ${
    previewText
      ? `<div style="display: none; max-height: 0px; overflow: hidden; opacity: 0;">${escapeHtml(
          previewText
        )}</div>`
      : ''
  }
  <div class="email-container">
    <div class="header">
      <div class="brand-title">Coin Crew</div>
      <div class="brand-subtitle">${lang === 'vi' ? 'Quản lý chi tiêu nhóm & thanh toán thông minh' : 'Group expense sharing & smart settlement'}</div>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      ${footerText}
    </div>
  </div>
</body>
</html>`;
}
