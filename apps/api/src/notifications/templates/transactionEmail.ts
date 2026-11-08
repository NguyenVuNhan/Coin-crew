import { escapeHtml, formatVnd, renderBaseHtmlLayout } from './base';

export type TransactionAction = 'created' | 'approved' | 'updated' | 'deleted';

export interface TransactionEmailOptions {
  tripName: string;
  groupToken: string;
  action: TransactionAction;
  description: string;
  totalAmount: number;
  userShare: number;
  payerName?: string;
  currency?: string;
  appOrigin?: string;
  lang?: 'vi' | 'en';
}

export function renderTransactionEmail(options: TransactionEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    tripName,
    groupToken,
    action,
    description,
    totalAmount,
    userShare,
    payerName,
    appOrigin = 'https://app.coincrew.io',
    lang = 'vi',
  } = options;

  const groupUrl = `${appOrigin}/g/${groupToken}`;
  const isVi = lang === 'vi';

  let actionTitleVi = 'Khoản chi mới';
  let actionTitleEn = 'New expense';
  let badgeColor = '#16a34a'; // green

  if (action === 'updated') {
    actionTitleVi = 'Khoản chi đã cập nhật';
    actionTitleEn = 'Updated expense';
    badgeColor = '#2563eb'; // blue
  } else if (action === 'deleted') {
    actionTitleVi = 'Khoản chi đã xoá';
    actionTitleEn = 'Deleted expense';
    badgeColor = '#dc2626'; // red
  }

  const subject = isVi
    ? `[Coin Crew] ${tripName}: ${actionTitleVi} "${description}"`
    : `[Coin Crew] ${tripName}: ${actionTitleEn} "${description}"`;

  const heading = isVi ? actionTitleVi : actionTitleEn;
  const totalFormatted = formatVnd(totalAmount);
  const userShareFormatted = formatVnd(userShare);

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #ffffff; background-color: ${badgeColor}; border-radius: 9999px;">
        ${escapeHtml(heading)}
      </span>
      <h2 style="margin: 12px 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a;">
        ${escapeHtml(description)}
      </h2>
      <p style="margin: 0; font-size: 14px; color: #64748b;">
        ${isVi ? 'Nhóm:' : 'Group:'} <strong>${escapeHtml(tripName)}</strong>
      </p>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${
          payerName
            ? `<tr>
                <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Người chi:' : 'Paid by:'}</td>
                <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500;">${escapeHtml(payerName)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Tổng số tiền:' : 'Total amount:'}</td>
          <td style="padding: 6px 0; font-size: 15px; color: #0f172a; text-align: right;" class="tabular-nums">${totalFormatted}</td>
        </tr>
        <tr style="border-top: 1px dashed #cbd5e1;">
          <td style="padding: 8px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${isVi ? 'Phần của bạn:' : 'Your share:'}</td>
          <td style="padding: 8px 0 0 0; font-size: 16px; font-weight: 700; color: #2563eb; text-align: right;" class="tabular-nums">${userShareFormatted}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${escapeHtml(groupUrl)}" class="btn">
        ${isVi ? 'Xem chi tiết nhóm' : 'View group details'}
      </a>
    </div>
  `;

  const html = renderBaseHtmlLayout({
    title: subject,
    previewText: `${heading}: ${description} (${userShareFormatted})`,
    contentHtml,
    appOrigin,
    lang,
  });

  const textLines = [
    `[Coin Crew] ${heading}`,
    `Nhóm / Group: ${tripName}`,
    `Khoản chi / Expense: ${description}`,
  ];
  if (payerName) {
    textLines.push(`Người chi / Paid by: ${payerName}`);
  }
  textLines.push(
    `Tổng số tiền / Total: ${totalFormatted}`,
    `Phần của bạn / Your share: ${userShareFormatted}`,
    '',
    `Xem chi tiết tại / View details at: ${groupUrl}`
  );

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
