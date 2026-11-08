import { escapeHtml, formatVnd, renderBaseHtmlLayout } from './base';

export type PaymentAction = 'says_paid' | 'confirmed';

export interface PaymentEmailOptions {
  tripName: string;
  groupToken: string;
  action: PaymentAction;
  amount: number;
  payerName: string;
  payeeName: string;
  note?: string;
  appOrigin?: string;
  lang?: 'vi' | 'en';
}

export function renderPaymentEmail(options: PaymentEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    tripName,
    groupToken,
    action,
    amount,
    payerName,
    payeeName,
    note,
    appOrigin = 'https://app.coincrew.io',
    lang = 'vi',
  } = options;

  const groupUrl = `${appOrigin}/g/${groupToken}`;
  const isVi = lang === 'vi';
  const formattedAmount = formatVnd(amount);

  let subject: string;
  let title: string;
  let bodyDescription: string;
  let buttonLabel: string;
  let badgeColor: string;

  if (action === 'says_paid') {
    badgeColor = '#eab308'; // yellow/amber
    if (isVi) {
      subject = `[Coin Crew] ${tripName}: ${payerName} đã chuyển ${formattedAmount} - Cần xác nhận`;
      title = 'Xác nhận thanh toán';
      bodyDescription = `${payerName} vừa đánh dấu đã chuyển ${formattedAmount} cho bạn. Vui lòng kiểm tra tài khoản và xác nhận trong nhóm.`;
      buttonLabel = 'Kiểm tra & Xác nhận';
    } else {
      subject = `[Coin Crew] ${tripName}: ${payerName} sent ${formattedAmount} - Confirmation needed`;
      title = 'Payment Confirmation Needed';
      bodyDescription = `${payerName} marked a payment of ${formattedAmount} to you. Please check your bank account and confirm in the group.`;
      buttonLabel = 'Check & Confirm';
    }
  } else {
    // confirmed
    badgeColor = '#16a34a'; // green
    if (isVi) {
      subject = `[Coin Crew] ${tripName}: Xác nhận thanh toán ${formattedAmount} từ ${payeeName}`;
      title = 'Thanh toán đã được xác nhận';
      bodyDescription = `${payeeName} đã xác nhận nhận được khoản thanh toán ${formattedAmount} của bạn.`;
      buttonLabel = 'Xem nhóm';
    } else {
      subject = `[Coin Crew] ${tripName}: Payment receipt for ${formattedAmount} confirmed by ${payeeName}`;
      title = 'Payment Receipt Confirmed';
      bodyDescription = `${payeeName} confirmed receipt of your payment of ${formattedAmount}.`;
      buttonLabel = 'View group';
    }
  }

  const contentHtml = `
    <div style="margin-bottom: 20px;">
      <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #ffffff; background-color: ${badgeColor}; border-radius: 9999px;">
        ${escapeHtml(title)}
      </span>
      <h2 style="margin: 12px 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a;">
        ${formattedAmount}
      </h2>
      <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">
        ${escapeHtml(bodyDescription)}
      </p>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Nhóm:' : 'Group:'}</td>
          <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500;">${escapeHtml(tripName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Người chuyển:' : 'Payer:'}</td>
          <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500;">${escapeHtml(payerName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Người nhận:' : 'Payee:'}</td>
          <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 500;">${escapeHtml(payeeName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Số tiền:' : 'Amount:'}</td>
          <td style="padding: 6px 0; font-size: 15px; color: #0f172a; text-align: right;" class="tabular-nums">${formattedAmount}</td>
        </tr>
        ${
          note
            ? `<tr>
                <td style="padding: 6px 0; font-size: 14px; color: #64748b;">${isVi ? 'Ghi chú:' : 'Note:'}</td>
                <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right;">${escapeHtml(note)}</td>
              </tr>`
            : ''
        }
      </table>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${escapeHtml(groupUrl)}" class="btn">
        ${escapeHtml(buttonLabel)}
      </a>
    </div>
  `;

  const html = renderBaseHtmlLayout({
    title: subject,
    previewText: `${title}: ${formattedAmount} (${tripName})`,
    contentHtml,
    appOrigin,
    lang,
  });

  const textLines = [
    `[Coin Crew] ${title}`,
    `Nhóm / Group: ${tripName}`,
    `Người chuyển / Payer: ${payerName}`,
    `Người nhận / Payee: ${payeeName}`,
    `Số tiền / Amount: ${formattedAmount}`,
  ];
  if (note) {
    textLines.push(`Ghi chú / Note: ${note}`);
  }
  textLines.push('', `${bodyDescription}`, '', `Xem chi tiết tại / Link: ${groupUrl}`);

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}
