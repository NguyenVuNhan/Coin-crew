# Privacy Notice Vietnam Compliance (Decree 13 & PDPL 2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unlocalized draft privacy notice with a fully compliant, bilingual (VI/EN), Impeccable-styled Privacy Notice meeting Vietnam's Decree 13/2023/ND-CP and PDPL 2026 rules.

**Architecture:** A friendly 30-second summary card + structured grouped ledger accordion on Rice Paper, powered by `@cc/web-i18n` dictionary keys (`vi.ts` and `en.ts`), with configurable privacy email (`VITE_PRIVACY_EMAIL` with default `nguyenvunhan1999@gmail.com`) and complete Article 13 & 9 statutory disclosures.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui theme tokens, `@cc/web-i18n`, Vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-11-07-privacy-notice-vietnam-compliance-design.md`

## Global Constraints

- **Styling (`DESIGN.md`):** Follow "The Friendly Ledger" strictly: no raw hex, no corporate blue, use theme tokens (`bg-card`, `bg-secondary`, `text-secondary-foreground`, `border-border`, `divide-border`, `text-primary`, `text-muted-foreground`), and enforce 44px min-height tap targets on all `<summary>` elements.
- **Copy & Compliance:** Explicitly classify bank accounts as Sensitive Personal Data (Decree 13 Art 2.4). Disclose Cloudflare, Google, Zalo processors and cross-border hosting.
- **Test Integrity:** The English string must match regex `/Zalo user ID, display name and profile picture/` to satisfy `sign-in.test.tsx`.
- **Environment:** Privacy contact email must default to `nguyenvunhan1999@gmail.com` when `VITE_PRIVACY_EMAIL` is unset.
- **Draft Notice:** `<Pill tone="warning">{t('privacy.draft')}</Pill>` must be removed.

## Review Focus

1. **Locale Switching:** When switching from `vi` to `en` via `LanguageButton`, all sections (summary, labels, headers, and body paragraphs) must re-render in English without lingering Vietnamese text or missing key warnings.
2. **Accordion Interaction on Mobile:** Touching anywhere on a 44px `<summary>` row must smoothly toggle open/close and rotate the chevron without causing horizontal scroll or text clipping on a 320px viewport.
3. **Sensitive Data Classification:** Both language versions must explicitly label bank account numbers as "Sensitive Personal Data" / "Dữ liệu cá nhân nhạy cảm".
4. **Email mailto link:** When clicking or tapping the privacy contact email link, it must format correctly as `mailto:nguyenvunhan1999@gmail.com` (or the configured `VITE_PRIVACY_EMAIL`).
5. **Back Navigation & Route Transition:** Navigating back from `/privacy` via the header back button must cleanly return to the referrer or `/` as tested in `back-navigation.test.tsx`.

---

### Task 1: Privacy Contact Email Configuration

**Files:**
- Modify: `libs/web/screens/src/config.ts`
- Test: `libs/web/screens/src/screens/__tests__/config.test.ts`

**Interfaces:**
- Produces: `export const PRIVACY_CONTACT_EMAIL: string;` in `libs/web/screens/src/config.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web/screens/src/screens/__tests__/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PRIVACY_CONTACT_EMAIL } from '../../config';

describe('PRIVACY_CONTACT_EMAIL config', () => {
  it('defaults to nguyenvunhan1999@gmail.com when VITE_PRIVACY_EMAIL is unset', () => {
    expect(PRIVACY_CONTACT_EMAIL).toBe('nguyenvunhan1999@gmail.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/config.test.ts`
Expected: FAIL with "PRIVACY_CONTACT_EMAIL is not exported from ../../config"

- [ ] **Step 3: Implement `PRIVACY_CONTACT_EMAIL` in `libs/web/screens/src/config.ts`**

Add to `libs/web/screens/src/config.ts`:
```ts
export const PRIVACY_CONTACT_EMAIL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRIVACY_EMAIL) ||
  'nguyenvunhan1999@gmail.com';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/config.ts libs/web/screens/src/screens/__tests__/config.test.ts
git commit -m "feat(screens): export PRIVACY_CONTACT_EMAIL config with default"
```

---

### Task 2: Localization Dictionary Entries (`vi.ts` and `en.ts`)

**Files:**
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`
- Test: `libs/web/i18n/src/__tests__/privacy-keys.test.ts`

**Interfaces:**
- Consumes: `@cc/web-i18n`
- Produces: Translation keys:
  - `privacy.summary.badge`
  - `privacy.summary.readTime`
  - `privacy.summary.lead`
  - `privacy.sectionLabel`
  - `privacy.sections.operator.title` & `privacy.sections.operator.body`
  - `privacy.sections.data.title`, `privacy.sections.data.basicLabel`, `privacy.sections.data.basicBody`, `privacy.sections.data.sensitiveLabel`, `privacy.sections.data.sensitiveBody`
  - `privacy.sections.sharing.title` & `privacy.sections.sharing.body`
  - `privacy.sections.processors.title` & `privacy.sections.processors.body`
  - `privacy.sections.risks.title` & `privacy.sections.risks.body`
  - `privacy.sections.retention.title` & `privacy.sections.retention.body`
  - `privacy.sections.rights.title` & `privacy.sections.rights.body`
  - `privacy.sections.contact.title` & `privacy.sections.contact.body`

- [ ] **Step 1: Write the failing test**

Create `libs/web/i18n/src/__tests__/privacy-keys.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { vi } from '../vi';

describe('Privacy i18n keys', () => {
  const requiredKeys = [
    'privacy.title',
    'privacy.summary.badge',
    'privacy.summary.readTime',
    'privacy.summary.lead',
    'privacy.sectionLabel',
    'privacy.sections.operator.title',
    'privacy.sections.operator.body',
    'privacy.sections.data.title',
    'privacy.sections.data.basicLabel',
    'privacy.sections.data.basicBody',
    'privacy.sections.data.sensitiveLabel',
    'privacy.sections.data.sensitiveBody',
    'privacy.sections.sharing.title',
    'privacy.sections.sharing.body',
    'privacy.sections.processors.title',
    'privacy.sections.processors.body',
    'privacy.sections.risks.title',
    'privacy.sections.risks.body',
    'privacy.sections.retention.title',
    'privacy.sections.retention.body',
    'privacy.sections.rights.title',
    'privacy.sections.rights.body',
    'privacy.sections.contact.title',
    'privacy.sections.contact.body',
  ];

  it('both vi and en have all privacy keys', () => {
    for (const key of requiredKeys) {
      expect(vi[key as keyof typeof vi]).toBeDefined();
      expect(en[key as keyof typeof en]).toBeDefined();
    }
  });

  it('en translation preserves exact Zalo user ID phrase for tests', () => {
    expect(en['privacy.sections.data.basicBody' as keyof typeof en]).toContain(
      'Zalo user ID, display name and profile picture'
    );
  });

  it('both vi and en explicitly distinguish sensitive bank data', () => {
    expect(vi['privacy.sections.data.sensitiveLabel' as keyof typeof vi]).toMatch(/Dữ liệu nhạy cảm/i);
    expect(en['privacy.sections.data.sensitiveLabel' as keyof typeof en]).toMatch(/Sensitive data/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cc/web-i18n -- src/__tests__/privacy-keys.test.ts`
Expected: FAIL with missing translation keys

- [ ] **Step 3: Add translation keys to `vi.ts` and `en.ts`**

Add the structured privacy dictionary entries to `libs/web/i18n/src/vi.ts`:
```ts
  'privacy.summary.badge': '🌱 Tóm tắt nhanh',
  'privacy.summary.readTime': 'Đọc trong 30 giây',
  'privacy.summary.lead': 'CoinCrew chỉ lưu tên và số tài khoản ngân hàng để giúp bạn bè chia tiền và tạo mã VietQR thanh toán. Chúng tôi không bao giờ bán dữ liệu, không chạy quảng cáo và bạn có toàn quyền xóa dữ liệu của mình bất cứ lúc nào.',
  'privacy.sectionLabel': 'Chi tiết quy định (Nghị định 13/2023 & PDPL 2026)',
  'privacy.sections.operator.title': '1. Đơn vị vận hành',
  'privacy.sections.operator.body': 'CoinCrew (Tiền Đâu) được vận hành độc lập như một công cụ hỗ trợ chia sẻ chi phí nhóm và tạo mã thanh toán VietQR trực tiếp giữa các thành viên.',
  'privacy.sections.data.title': '2. Dữ liệu thu thập & Phân loại',
  'privacy.sections.data.basicLabel': 'Dữ liệu cá nhân cơ bản',
  'privacy.sections.data.basicBody': 'Tên hiển thị, địa chỉ email từ Google, Zalo user ID, tên hiển thị và ảnh đại diện từ Zalo (Zalo không cung cấp số điện thoại); tên nhóm, người tham gia, lịch sử chi tiêu và thanh toán.',
  'privacy.sections.data.sensitiveLabel': 'Dữ liệu cá nhân nhạy cảm (Điều 2.4 NĐ 13/2023/NĐ-CP)',
  'privacy.sections.data.sensitiveBody': 'Tên ngân hàng (hoặc mã BIN), số tài khoản ngân hàng và tên chủ tài khoản phục vụ tạo mã chuyển khoản VietQR. Người nhập thông tin cho người khác có nghĩa vụ đảm bảo đã nhận được sự đồng ý của họ.',
  'privacy.sections.sharing.title': '3. Ai nhìn thấy thông tin của bạn?',
  'privacy.sections.sharing.body': 'Thành viên cùng nhóm có thể xem tên và các khoản chi. Số tài khoản ngân hàng chỉ hiển thị cho người có nghĩa vụ chuyển khoản trả nợ cho bạn khi họ mở màn hình thanh toán VietQR.',
  'privacy.sections.processors.title': '4. Hạ tầng lưu trữ & Bên thứ ba',
  'privacy.sections.processors.body': 'Dữ liệu được lưu trữ trên hạ tầng điện toán đám mây của Cloudflare (Workers & D1 Database). Dịch vụ xác thực do Google và VNG Zalo cung cấp. Máy chủ lưu trữ có thể đặt ngoài lãnh thổ Việt Nam.',
  'privacy.sections.risks.title': '5. Rủi ro không mong muốn',
  'privacy.sections.risks.body': 'Bất kỳ ai có đường liên kết tham gia nhóm (/j/...) đều có thể xem lịch sử chi tiêu nhóm. Độ chính xác của việc chuyển khoản phụ thuộc vào số tài khoản do người dùng nhập.',
  'privacy.sections.retention.title': '6. Thời gian lưu trữ dữ liệu',
  'privacy.sections.retention.body': 'Dữ liệu được lưu trữ cho đến khi bạn xóa nhóm, xóa thông tin ngân hàng hoặc gửi yêu cầu xóa tài khoản.',
  'privacy.sections.rights.title': '7. Quyền của bạn theo quy định pháp luật',
  'privacy.sections.rights.body': 'Bạn có đầy đủ 11 quyền theo Điều 9 Nghị định 13/2023 và Luật Bảo vệ dữ liệu cá nhân 2026: quyền được biết, đồng ý, truy cập, chỉnh sửa, xóa dữ liệu, rút lại sự đồng ý, hạn chế xử lý, cung cấp dữ liệu, phản đối xử lý, khiếu nại tố cáo và yêu cầu bồi thường thiệt hại.',
  'privacy.sections.contact.title': '8. Liên hệ & Yêu cầu xóa dữ liệu',
  'privacy.sections.contact.body': 'Để thực hiện các quyền của chủ thể dữ liệu hoặc yêu cầu xóa hoàn toàn tài khoản, vui lòng liên hệ qua email:',
```

Add the matching English entries to `libs/web/i18n/src/en.ts`:
```ts
  'privacy.summary.badge': '🌱 Quick summary',
  'privacy.summary.readTime': '30-second read',
  'privacy.summary.lead': 'CoinCrew only stores names and bank account numbers to help groups split costs and generate VietQR payment codes. We never sell data, run no ads, and you have full control to delete your data at any time.',
  'privacy.sectionLabel': 'Regulatory details (Decree 13/2023 & PDPL 2026)',
  'privacy.sections.operator.title': '1. Who runs the service',
  'privacy.sections.operator.body': 'CoinCrew is operated as an independent group expense splitting and direct VietQR settlement utility.',
  'privacy.sections.data.title': '2. Data collected & classification',
  'privacy.sections.data.basicLabel': 'Basic personal data',
  'privacy.sections.data.basicBody': 'Name and email address from Google sign-in, or your Zalo user ID, display name and profile picture from Zalo sign-in (Zalo does not share your phone number); trip names, participant names, expense records, and payment records.',
  'privacy.sections.data.sensitiveLabel': 'Sensitive personal data (Decree 13/2023 Art. 2.4)',
  'privacy.sections.data.sensitiveBody': 'Bank name, account number, and account holder name entered for VietQR settlements. Users entering bank details on behalf of others must obtain their consent.',
  'privacy.sections.sharing.title': '3. Who sees your information',
  'privacy.sections.sharing.body': 'Trip information is visible to other members of the same trip. Your bank account details are only displayed to members who owe you money when they open the VietQR payment screen.',
  'privacy.sections.processors.title': '4. Infrastructure & third parties',
  'privacy.sections.processors.body': 'Data is hosted on Cloudflare infrastructure (Workers & D1 Database). Authentication is provided by Google and VNG Zalo. Servers and storage may be located outside Vietnam.',
  'privacy.sections.risks.title': '5. Unintended risks',
  'privacy.sections.risks.body': 'Anyone with a trip invite link (/j/...) can view the trip expense history. Accuracy of payment routing depends on the bank account details entered by users.',
  'privacy.sections.retention.title': '6. How long data is kept',
  'privacy.sections.retention.body': 'Your data is retained until you delete the trip, remove your bank account, or request the deletion of your account.',
  'privacy.sections.rights.title': '7. Your legal rights',
  'privacy.sections.rights.body': 'You have full rights under Article 9 of Decree 13/2023 and the 2026 Personal Data Protection Law: rights to know, consent, access, correct, delete, withdraw consent, restrict processing, obtain data, object to processing, file complaints, and claim damages.',
  'privacy.sections.contact.title': '8. Contact & data deletion requests',
  'privacy.sections.contact.body': 'For privacy inquiries, exercising data rights, or requesting complete account deletion, contact:',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cc/web-i18n -- src/__tests__/privacy-keys.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/i18n/src/vi.ts libs/web/i18n/src/en.ts libs/web/i18n/src/__tests__/privacy-keys.test.ts
git commit -m "feat(i18n): add Decree 13 and PDPL compliant bilingual privacy notice keys"
```

---

### Task 3: Refactor `Privacy.tsx` to Impeccable Friendly Ledger UI

**Files:**
- Modify: `libs/web/screens/src/screens/Privacy.tsx`
- Test: `libs/web/screens/src/screens/__tests__/privacy-screen.test.tsx`

**Interfaces:**
- Consumes: `@cc/web-i18n`, `Screen`, `LanguageButton`, `PRIVACY_CONTACT_EMAIL`
- Produces: Updated `<Privacy />` component

- [ ] **Step 1: Write the failing test**

Create `libs/web/screens/src/screens/__tests__/privacy-screen.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from '../../test/render';
import { Privacy } from '../Privacy';

describe('Privacy screen', () => {
  it('does not display draft warning pill', () => {
    renderAt(<Privacy />);
    expect(screen.queryByText(/Draft — pending legal review/i)).toBeNull();
    expect(screen.queryByText(/Bản nháp/i)).toBeNull();
  });

  it('renders 30-second quick summary card with badge', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/Quick summary/i)).toBeInTheDocument();
    expect(screen.getByText(/30-second read/i)).toBeInTheDocument();
  });

  it('renders all 8 regulatory accordion sections inside a grouped ledger container', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/1\. Who runs the service/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Data collected & classification/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Who sees your information/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Infrastructure & third parties/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Unintended risks/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. How long data is kept/i)).toBeInTheDocument();
    expect(screen.getByText(/7\. Your legal rights/i)).toBeInTheDocument();
    expect(screen.getByText(/8\. Contact & data deletion requests/i)).toBeInTheDocument();
  });

  it('displays contact email with mailto link', () => {
    renderAt(<Privacy />);
    const link = screen.getByRole('link', { name: /nguyenvunhan1999@gmail\.com/i });
    expect(link).toHaveAttribute('href', 'mailto:nguyenvunhan1999@gmail.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/privacy-screen.test.tsx`
Expected: FAIL (draft pill still present, new sections not found)

- [ ] **Step 3: Implement Impeccable Privacy screen in `libs/web/screens/src/screens/Privacy.tsx`**

Replace `libs/web/screens/src/screens/Privacy.tsx` with the structure from §6.1 of the design document:
- Remove `<Pill tone="warning">{t('privacy.draft')}</Pill>`.
- Render Summary Card with Jade Mist badge (`bg-secondary text-secondary-foreground`).
- Render Section Label (`text-sm font-semibold text-muted-foreground px-1 mt-2`).
- Render Grouped Ledger container (`bg-card rounded-xl border border-border divide-y divide-border overflow-hidden`).
- Style all `<summary>` elements with `min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors`.
- Connect all copy to `t(...)` keys and render mailto link to `PRIVACY_CONTACT_EMAIL`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/privacy-screen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/screens/Privacy.tsx libs/web/screens/src/screens/__tests__/privacy-screen.test.tsx
git commit -m "feat(screens): rewrite Privacy notice to Impeccable grouped ledger with Decree 13 compliance"
```

---

### Task 4: Verify Existing Test Suites & Coverage

**Files:**
- Modify: `libs/web/screens/src/screens/__tests__/sign-in.test.tsx` (if needed, ensure all 18 tests pass)
- Test: `libs/web/screens/src/screens/__tests__/sign-in.test.tsx`
- Test: `libs/web/screens/src/screens/__tests__/back-navigation.test.tsx`

- [ ] **Step 1: Run `sign-in.test.tsx`**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/sign-in.test.tsx`
Expected: PASS (18 tests passing, including `it('the privacy notice mentions Zalo')`)

- [ ] **Step 2: Run `back-navigation.test.tsx`**

Run: `npm test -w @cc/web-screens -- src/screens/__tests__/back-navigation.test.tsx`
Expected: PASS (all back-navigation routes including `/privacy` pass)

- [ ] **Step 3: Run full `@cc/web-screens` test suite**

Run: `npm test -w @cc/web-screens`
Expected: PASS (all 140+ test files pass)

- [ ] **Step 4: Commit test updates**

```bash
git commit --allow-empty -m "test: verify sign-in and navigation test suites with updated privacy notice"
```

---

### Task 5: Typecheck & Pre-Live Verification

**Files:**
- None (verification across workspace)

- [ ] **Step 1: Run workspace typecheck**

Run: `npm run typecheck`
Expected: PASS with 0 TypeScript errors

- [ ] **Step 2: Run full workspace test suite**

Run: `npm test`
Expected: PASS with all tests green

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: clean working directory
