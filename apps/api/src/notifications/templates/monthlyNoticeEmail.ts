import { escapeHtml, formatVnd, renderBaseHtmlLayout } from './base';

export interface MonthlyNoticeGroup {
  tripName: string;
  groupToken: string;
  totalGroupSpend: number;
  userSpend: number;
  userShare?: number;
  closingBalance: number;
}

export interface MonthlyNoticeEmailOptions {
  month: string;
  recipientName?: string;
  groups: MonthlyNoticeGroup[];
  appOrigin?: string;
  lang?: 'vi' | 'en';
}

export function renderMonthlyNoticeEmail(options: MonthlyNoticeEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    month,
    recipientName,
    groups,
    appOrigin = 'https://app.coincrew.io',
    lang = 'vi',
  } = options;

  const isVi = lang === 'vi';
  const subject = isVi
    ? `[Coin Crew] Báo cáo thu chi tháng ${month}`
    : `[Coin Crew] Monthly financial summary - ${month}`;

  const greeting = recipientName
    ? isVi
      ? `Xin chào ${escapeHtml(recipientName)},`
      : `Hi ${escapeHtml(recipientName)},`
    : isVi
    ? 'Xin chào bạn,'
    : 'Hello,';

  const introText = isVi
    ? `Dưới đây là báo cáo tổng kết tình hình thu chi và số dư trong <strong>tháng ${escapeHtml(month)}</strong> của các nhóm bạn tham gia.`
    : `Here is your monthly spending summary and closing balance across active groups for <strong>${escapeHtml(month)}</strong>.`;

  const groupsHtml = groups
    .map((g) => {
      const groupUrl = `${appOrigin}/g/${g.groupToken}`;
      const totalSpendFormatted = formatVnd(g.totalGroupSpend);
      const userSpendFormatted = formatVnd(g.userSpend);
      const userShareFormatted =
        g.userShare !== undefined ? formatVnd(g.userShare) : null;

      let balanceLabel: string;
      let balanceFormatted: string;
      let balanceColor: string;

      if (g.closingBalance < 0) {
        balanceLabel = isVi ? 'Còn nợ:' : 'Amount owed:';
        balanceFormatted = formatVnd(Math.abs(g.closingBalance));
        balanceColor = '#dc2626';
      } else if (g.closingBalance > 0) {
        balanceLabel = isVi ? 'Được nhận lại:' : 'To receive:';
        balanceFormatted = formatVnd(g.closingBalance);
        balanceColor = '#16a34a';
      } else {
        balanceLabel = isVi ? 'Trạng thái:' : 'Status:';
        balanceFormatted = isVi ? 'Đã quyết toán (0₫)' : 'Settled (0₫)';
        balanceColor = '#64748b';
      }

      return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
            <a href="${escapeHtml(groupUrl)}" style="font-size: 16px; font-weight: 700; color: #2563eb; text-decoration: none;">
              ${escapeHtml(g.tripName)} &rarr;
            </a>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; font-size: 13px; color: #64748b;">${isVi ? 'Tổng chi tiêu nhóm:' : 'Total club spend:'}</td>
              <td style="padding: 5px 0; font-size: 13px; color: #0f172a; text-align: right;" class="tabular-nums">${totalSpendFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-size: 13px; color: #64748b;">${isVi ? 'Bạn đã chi trả:' : 'You paid:'}</td>
              <td style="padding: 5px 0; font-size: 13px; color: #0f172a; text-align: right;" class="tabular-nums">${userSpendFormatted}</td>
            </tr>
            ${
              userShareFormatted
                ? `<tr>
                    <td style="padding: 5px 0; font-size: 13px; color: #64748b;">${isVi ? 'Phần của bạn:' : 'Your share:'}</td>
                    <td style="padding: 5px 0; font-size: 13px; color: #0f172a; text-align: right;" class="tabular-nums">${userShareFormatted}</td>
                  </tr>`
                : ''
            }
            <tr style="border-top: 1px dashed #cbd5e1;">
              <td style="padding: 8px 0 0 0; font-size: 14px; font-weight: 600; color: #0f172a;">${balanceLabel}</td>
              <td style="padding: 8px 0 0 0; font-size: 15px; font-weight: 700; color: ${balanceColor}; text-align: right;" class="tabular-nums">${balanceFormatted}</td>
            </tr>
          </table>
        </div>
      `;
    })
    .join('');

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #ffffff; background-color: #4f46e5; border-radius: 9999px;">
        ${isVi ? 'Báo cáo tháng' : 'Monthly Notice'}
      </span>
      <h2 style="margin: 12px 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a;">
        ${greeting}
      </h2>
      <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
        ${introText}
      </p>
    </div>

    <div style="margin-top: 16px;">
      ${groupsHtml}
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${escapeHtml(appOrigin)}" class="btn">
        ${isVi ? 'Mở Coin Crew' : 'Open Coin Crew'}
      </a>
    </div>
  `;

  const html = renderBaseHtmlLayout({
    title: subject,
    previewText: `${isVi ? 'Báo cáo thu chi tháng' : 'Monthly financial summary'} ${month}`,
    contentHtml,
    appOrigin,
    lang,
  });

  const textLines = [
    `[Coin Crew] ${isVi ? 'Báo cáo thu chi tháng' : 'Monthly financial summary'} ${month}`,
    `${greeting}`,
    '',
    introText.replace(/<[^>]+>/g, ''),
    '',
  ];

  for (const g of groups) {
    const groupUrl = `${appOrigin}/g/${g.groupToken}`;
    textLines.push(`--- ${g.tripName} ---`);
    textLines.push(`${isVi ? 'Tổng chi tiêu nhóm' : 'Total club spend'}: ${formatVnd(g.totalGroupSpend)}`);
    textLines.push(`${isVi ? 'Bạn đã chi' : 'You paid'}: ${formatVnd(g.userSpend)}`);
    if (g.userShare !== undefined) {
      textLines.push(`${isVi ? 'Phần của bạn' : 'Your share'}: ${formatVnd(g.userShare)}`);
    }
    const balanceStr =
      g.closingBalance < 0
        ? `${isVi ? 'Còn nợ' : 'Amount owed'}: ${formatVnd(Math.abs(g.closingBalance))}`
        : g.closingBalance > 0
        ? `${isVi ? 'Được nhận lại' : 'To receive'}: ${formatVnd(g.closingBalance)}`
        : `${isVi ? 'Đã quyết toán' : 'Settled'}: 0₫`;
    textLines.push(`${isVi ? 'Số dư cuối tháng' : 'Closing balance'}: ${balanceStr}`);
    textLines.push(`Link: ${groupUrl}`);
    textLines.push('');
  }

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
