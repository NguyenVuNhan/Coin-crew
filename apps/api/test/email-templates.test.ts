import { describe, it, expect } from 'vitest';
import { renderTransactionEmail } from '../src/notifications/templates/transactionEmail';
import { renderPaymentEmail } from '../src/notifications/templates/paymentEmail';
import { renderLoanReminderEmail } from '../src/notifications/templates/loanReminderEmail';
import { renderMonthlyNoticeEmail } from '../src/notifications/templates/monthlyNoticeEmail';

describe('Email Templates', () => {
  const APP_ORIGIN = 'https://app.coincrew.io';

  describe('renderTransactionEmail', () => {
    it('renders expense created email in Vietnamese (default)', () => {
      const email = renderTransactionEmail({
        tripName: 'Cầu Lông Thứ 7',
        groupToken: 'badminton-sat',
        action: 'created',
        description: 'Tiền sân & cầu',
        totalAmount: 360000,
        userShare: 90000,
        payerName: 'Nam',
        appOrigin: APP_ORIGIN,
      });

      expect(email.subject).toBe('[Coin Crew] Cầu Lông Thứ 7: Khoản chi mới "Tiền sân & cầu"');
      expect(email.html).toContain('Cầu Lông Thứ 7');
      expect(email.html).toContain('Tiền sân &amp; cầu');
      expect(email.html).toContain('360.000');
      expect(email.html).toContain('90.000');
      expect(email.html).toContain('₫');
      expect(email.html).toContain('tabular-nums');
      expect(email.html).toContain('Nam');
      expect(email.html).toContain(`${APP_ORIGIN}/g/badminton-sat`);
      expect(email.text).toContain('Cầu Lông Thứ 7');
      expect(email.text).toContain('Tiền sân & cầu');
      expect(email.text).toContain('360.000');
      expect(email.text).toContain('90.000');
      expect(email.text).toContain(`${APP_ORIGIN}/g/badminton-sat`);
    });

    it('renders expense updated and deleted emails in English', () => {
      const updated = renderTransactionEmail({
        tripName: 'Dalat Trip',
        groupToken: 'dalat-2026',
        action: 'updated',
        description: 'Dinner BBQ',
        totalAmount: 500000,
        userShare: 125000,
        appOrigin: APP_ORIGIN,
        lang: 'en',
      });

      expect(updated.subject).toBe('[Coin Crew] Dalat Trip: Updated expense "Dinner BBQ"');
      expect(updated.html).toContain('Updated expense');
      expect(updated.text).toContain('Updated expense');

      const deleted = renderTransactionEmail({
        tripName: 'Dalat Trip',
        groupToken: 'dalat-2026',
        action: 'deleted',
        description: 'Dinner BBQ',
        totalAmount: 500000,
        userShare: 125000,
        appOrigin: APP_ORIGIN,
        lang: 'en',
      });

      expect(deleted.subject).toBe('[Coin Crew] Dalat Trip: Deleted expense "Dinner BBQ"');
      expect(deleted.html).toContain('Deleted expense');
      expect(deleted.text).toContain('Deleted expense');
    });
  });

  describe('renderPaymentEmail', () => {
    it('renders payment recorded (says_paid) email prompting confirmation', () => {
      const email = renderPaymentEmail({
        tripName: 'Pickleball Pro Club',
        groupToken: 'pickleball-pro',
        action: 'says_paid',
        amount: 150000,
        payerName: 'Hoàng',
        payeeName: 'Tuấn',
        note: 'Tiền áo đấu',
        appOrigin: APP_ORIGIN,
        lang: 'vi',
      });

      expect(email.subject).toBe('[Coin Crew] Pickleball Pro Club: Hoàng đã chuyển 150.000₫ - Cần xác nhận');
      expect(email.html).toContain('Pickleball Pro Club');
      expect(email.html).toContain('Hoàng');
      expect(email.html).toContain('Tuấn');
      expect(email.html).toContain('150.000');
      expect(email.html).toContain('Tiền áo đấu');
      expect(email.html).toContain(`${APP_ORIGIN}/g/pickleball-pro`);
      expect(email.text).toContain('Hoàng');
      expect(email.text).toContain('150.000');
      expect(email.text).toContain(`${APP_ORIGIN}/g/pickleball-pro`);
    });

    it('renders payment confirmed receipt email to payer in English', () => {
      const email = renderPaymentEmail({
        tripName: 'Weekend Football',
        groupToken: 'football-club',
        action: 'confirmed',
        amount: 200000,
        payerName: 'Alex',
        payeeName: 'David',
        appOrigin: APP_ORIGIN,
        lang: 'en',
      });

      expect(email.subject).toBe('[Coin Crew] Weekend Football: Payment receipt for 200.000₫ confirmed by David');
      expect(email.html).toContain('David');
      expect(email.html).toContain('Alex');
      expect(email.html).toContain('200.000');
      expect(email.html).toContain(`${APP_ORIGIN}/g/football-club`);
      expect(email.text).toContain('confirmed');
    });
  });

  describe('renderLoanReminderEmail', () => {
    it('renders single group loan reminder with "Pay via VietQR" link #settle and creditor breakdown', () => {
      const email = renderLoanReminderEmail({
        recipientName: 'Minh',
        groups: [
          {
            tripName: 'CLB Tennis Sài Gòn',
            groupToken: 'tennis-sg',
            totalDebt: 250000,
            debts: [
              { creditorName: 'Bảo', amount: 150000 },
              { creditorName: 'Châu', amount: 100000 },
            ],
          },
        ],
        appOrigin: APP_ORIGIN,
        lang: 'vi',
      });

      expect(email.subject).toContain('CLB Tennis Sài Gòn');
      expect(email.subject).toContain('Nhắc nhở số dư còn nợ');
      expect(email.html).toContain('CLB Tennis Sài Gòn');
      expect(email.html).toContain('250.000');
      expect(email.html).toContain('Bảo');
      expect(email.html).toContain('150.000');
      expect(email.html).toContain('Châu');
      expect(email.html).toContain('100.000');
      expect(email.html).toContain('Thanh toán qua VietQR');
      expect(email.html).toContain(`${APP_ORIGIN}/g/tennis-sg#settle`);
      expect(email.text).toContain(`${APP_ORIGIN}/g/tennis-sg#settle`);
      expect(email.text).toContain('250.000');
    });

    it('renders consolidated multi-group loan reminder with distinct #settle links', () => {
      const email = renderLoanReminderEmail({
        recipientName: 'Minh',
        groups: [
          {
            tripName: 'Nhóm Leo Núi Fansipan',
            groupToken: 'fansipan-climb',
            totalDebt: 450000,
            debts: [{ creditorName: 'Trưởng đoàn', amount: 450000 }],
          },
          {
            tripName: 'Hội Bạn Cấp 3',
            groupToken: 'high-school-buddies',
            totalDebt: 120000,
            debts: [{ creditorName: 'Hải', amount: 120000 }],
          },
        ],
        appOrigin: APP_ORIGIN,
        lang: 'en',
      });

      expect(email.subject).toContain('Consolidated outstanding balances');
      expect(email.subject).toContain('2 groups');
      expect(email.html).toContain('Fansipan');
      expect(email.html).toContain('450.000');
      expect(email.html).toContain(`${APP_ORIGIN}/g/fansipan-climb#settle`);
      expect(email.html).toContain('Hội Bạn Cấp 3');
      expect(email.html).toContain('120.000');
      expect(email.html).toContain(`${APP_ORIGIN}/g/high-school-buddies#settle`);
      expect(email.html).toContain('Pay via VietQR');
      expect(email.text).toContain(`${APP_ORIGIN}/g/fansipan-climb#settle`);
      expect(email.text).toContain(`${APP_ORIGIN}/g/high-school-buddies#settle`);
    });
  });

  describe('renderMonthlyNoticeEmail', () => {
    it('renders multi-group monthly digest with spend stats and closing balances', () => {
      const email = renderMonthlyNoticeEmail({
        month: '10/2026',
        recipientName: 'Khánh',
        groups: [
          {
            tripName: 'CLB Bóng Bàn Quận 1',
            groupToken: 'pingpong-q1',
            totalGroupSpend: 5200000,
            userSpend: 800000,
            userShare: 650000,
            closingBalance: 150000, // positive: owed to user
          },
          {
            tripName: 'Gia Đình Đi Đà Lạt',
            groupToken: 'family-dalat',
            totalGroupSpend: 12000000,
            userSpend: 1000000,
            userShare: 3000000,
            closingBalance: -2000000, // negative: user owes
          },
        ],
        appOrigin: APP_ORIGIN,
        lang: 'vi',
      });

      expect(email.subject).toBe('[Coin Crew] Báo cáo thu chi tháng 10/2026');
      expect(email.html).toContain('10/2026');
      expect(email.html).toContain('CLB Bóng Bàn Quận 1');
      expect(email.html).toContain('5.200.000');
      expect(email.html).toContain('800.000');
      expect(email.html).toContain('150.000');
      expect(email.html).toContain(`${APP_ORIGIN}/g/pingpong-q1`);
      expect(email.html).toContain('Gia Đình Đi Đà Lạt');
      expect(email.html).toContain('12.000.000');
      expect(email.html).toContain('2.000.000');
      expect(email.html).toContain(`${APP_ORIGIN}/g/family-dalat`);

      expect(email.text).toContain('10/2026');
      expect(email.text).toContain('CLB Bóng Bàn Quận 1');
      expect(email.text).toContain('Gia Đình Đi Đà Lạt');
    });

    it('renders monthly digest in English', () => {
      const email = renderMonthlyNoticeEmail({
        month: 'October 2026',
        groups: [
          {
            tripName: 'Badminton Club',
            groupToken: 'badminton-club',
            totalGroupSpend: 3000000,
            userSpend: 500000,
            closingBalance: 0,
          },
        ],
        appOrigin: APP_ORIGIN,
        lang: 'en',
      });

      expect(email.subject).toBe('[Coin Crew] Monthly financial summary - October 2026');
      expect(email.html).toContain('Badminton Club');
      expect(email.html).toContain('3.000.000');
      expect(email.text).toContain('Badminton Club');
    });
  });
});
