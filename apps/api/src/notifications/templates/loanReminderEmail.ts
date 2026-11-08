import { escapeHtml, formatVnd, renderBaseHtmlLayout } from './base';

export interface CreditorDebt {
  creditorName: string;
  amount: number;
}

export interface LoanReminderGroup {
  tripName: string;
  groupToken: string;
  totalDebt: number;
  debts?: CreditorDebt[];
}

export interface LoanReminderEmailOptions {
  recipientName?: string;
  groups: LoanReminderGroup[];
  appOrigin?: string;
  lang?: 'vi' | 'en';
}

export function renderLoanReminderEmail(options: LoanReminderEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    groups,
    appOrigin = 'https://app.coincrew.io',
    lang = 'vi',
  } = options;

  const isVi = lang === 'vi';
  const groupCount = groups.length;
  const firstGroup = groups[0];
  const firstGroupName = firstGroup?.tripName ?? '';
  const firstGroupDebt = firstGroup ? Math.abs(firstGroup.totalDebt) : 0;

  let subject: string;
  if (isVi) {
    subject =
      groupCount === 1
        ? `[Coin Crew] Nhắc nhở số dư còn nợ tại ${firstGroupName}`
        : `[Coin Crew] Tổng hợp nhắc nhở số dư còn nợ (${groupCount} nhóm)`;
  } else {
    subject =
      groupCount === 1
        ? `[Coin Crew] Loan reminder: Outstanding balance in ${firstGroupName}`
        : `[Coin Crew] Loan reminder: Consolidated outstanding balances (${groupCount} groups)`;
  }

  const grandTotalDebt = groups.reduce((acc, g) => acc + Math.abs(g.totalDebt), 0);
  const grandTotalFormatted = formatVnd(grandTotalDebt);

  const greeting = recipientName
    ? isVi
      ? `Xin chào ${escapeHtml(recipientName)},`
      : `Hi ${escapeHtml(recipientName)},`
    : isVi
    ? 'Xin chào bạn,'
    : 'Hello,';

  const introText = isVi
    ? groupCount === 1
      ? `Bạn hiện có số dư chưa quyết toán trong nhóm <strong>${escapeHtml(
          firstGroupName
        )}</strong> với tổng số tiền là <span class="tabular-nums" style="font-weight: 700; color: #dc2626;">${formatVnd(
          firstGroupDebt
        )}</span>.`
      : `Dưới đây là tổng hợp các khoản chưa quyết toán của bạn trên <strong>${groupCount} nhóm</strong> với tổng số tiền cần thanh toán là <span class="tabular-nums" style="font-weight: 700; color: #dc2626;">${grandTotalFormatted}</span>.`
    : groupCount === 1
    ? `You have an outstanding balance in <strong>${escapeHtml(
        firstGroupName
      )}</strong> of <span class="tabular-nums" style="font-weight: 700; color: #dc2626;">${formatVnd(
        firstGroupDebt
      )}</span>.`
    : `Here is a consolidated summary of your outstanding balances across <strong>${groupCount} groups</strong> totaling <span class="tabular-nums" style="font-weight: 700; color: #dc2626;">${grandTotalFormatted}</span>.`;

  const groupsHtml = groups
    .map((g) => {
      const settleUrl = `${appOrigin}/g/${g.groupToken}#settle`;
      const groupDebtFormatted = formatVnd(Math.abs(g.totalDebt));
      const payButtonText = isVi ? 'Thanh toán qua VietQR' : 'Pay via VietQR';

      const debtsRows = (g.debts || [])
        .map(
          (d) => `
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #475569;">${escapeHtml(d.creditorName)}</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right;" class="tabular-nums">${formatVnd(
              Math.abs(d.amount)
            )}</td>
          </tr>
        `
        )
        .join('');

      return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(g.tripName)}</h3>
            <span class="tabular-nums" style="font-size: 16px; font-weight: 700; color: #dc2626;">${groupDebtFormatted}</span>
          </div>

          ${
            debtsRows
              ? `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                ${isVi ? 'Chi tiết cần trả:' : 'Who to pay:'}
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                ${debtsRows}
              </table>
            </div>
          `
              : ''
          }

          <div style="text-align: center; margin-top: 16px;">
            <a href="${escapeHtml(settleUrl)}" class="btn" style="background-color: #059669; display: block; width: auto;">
              💳 ${payButtonText}
            </a>
          </div>
        </div>
      `;
    })
    .join('');

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #ffffff; background-color: #dc2626; border-radius: 9999px;">
        ${isVi ? 'Nhắc nhở số dư' : 'Loan Reminder'}
      </span>
      <h2 style="margin: 12px 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a;">
        ${greeting}
      </h2>
      <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
        ${introText}
      </p>
    </div>

    <div style="margin-top: 20px;">
      ${groupsHtml}
    </div>
  `;

  const html = renderBaseHtmlLayout({
    title: subject,
    previewText: `${isVi ? 'Số dư cần thanh toán:' : 'Outstanding balance:'} ${grandTotalFormatted}`,
    contentHtml,
    appOrigin,
    lang,
  });

  const textLines = [
    `[Coin Crew] ${isVi ? 'Nhắc nhở số dư còn nợ' : 'Loan Reminder'}`,
    `${greeting}`,
    '',
    introText.replace(/<[^>]+>/g, ''),
    '',
  ];

  for (const g of groups) {
    const settleUrl = `${appOrigin}/g/${g.groupToken}#settle`;
    const groupDebtFormatted = formatVnd(Math.abs(g.totalDebt));
    textLines.push(`--- ${g.tripName} ---`);
    textLines.push(`${isVi ? 'Cần trả' : 'Amount owed'}: ${groupDebtFormatted}`);
    if (g.debts && g.debts.length > 0) {
      for (const d of g.debts) {
        textLines.push(`  - ${d.creditorName}: ${formatVnd(Math.abs(d.amount))}`);
      }
    }
    textLines.push(`${isVi ? 'Thanh toán qua VietQR tại' : 'Pay via VietQR at'}: ${settleUrl}`);
    textLines.push('');
  }

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
