# Update Privacy Notice for Vietnam Personal Data Rules (Decree 13/2023 & PDPL 2026) — Design

Date: 2026-11-07 · Status: Draft for review  
Issue: [NguyenVuNhan/Coin-crew#66](https://github.com/NguyenVuNhan/Coin-crew/issues/66)  
Parent Epic: [NguyenVuNhan/Coin-crew#53](https://github.com/NguyenVuNhan/Coin-crew/issues/53) (*Phase 1: Group Split & VietQR Hardening*)  

---

## 1. Why

CoinCrew (Tiền Đâu) is an expense-splitting web app for friends, trips, and sports groups in Vietnam. To settle expenses via VietQR, CoinCrew stores user/guest names and Vietnamese bank account numbers (bank code/BIN, account number, account holder name). 

Under Vietnam's **Decree No. 13/2023/ND-CP** and the **Personal Data Protection Law (PDPL 2026)**:
- Bank account details are legally classified as **Sensitive Personal Data** (*Dữ liệu cá nhân nhạy cảm* - Art. 2.4).
- Data subjects must be explicitly notified prior to processing sensitive data (Art. 13.3).
- The privacy notice must disclose specific statutory items: purpose, types of data (distinguishing basic vs sensitive), third-party processors, server locations, unintended risks, retention duration, and the full catalog of data subject rights (Art. 9).

Currently, `Privacy.tsx` shows an unlocalized English draft with a warning pill (`t('privacy.draft')`) and a placeholder email (`privacy@example.com`). This fails compliance checks before going live (Spec §14).

Success means: Replacing the draft notice with a friendly, fully compliant bilingual Privacy Notice that reassures casual users while meeting all statutory requirements of Decree 13/2023 and PDPL 2026.

---

## 2. Goals

1. **Vietnam Regulatory Compliance:** Fully comply with Decree 13/2023/ND-CP and PDPL 2026 by explicitly distinguishing basic personal data from sensitive personal data (bank details), listing third-party processors (Cloudflare, Google, Zalo), disclosing cloud server locations, identifying unintended risks (sharing trip invite links), and detailing data subject rights under Article 9.
2. **Friendly & Approachable Experience:** Structure the notice using **Option A (Quick Summary + Collapsible Accordion)**:
   - A 30-second "Quick Summary" callout card at the top explaining in plain language the core principles (we only split expenses, bank details are sensitive and only shown to debtors settling up, no ads/selling data, you control your data).
   - Clean, collapsible accordion sections for users who want the full legal details.
3. **Bilingual Localization:** Follow the existing app language switcher (`vi` / `en`). Vietnamese users see natural, warm Vietnamese copy; English users see English. All text managed via `libs/web/i18n/src/vi.ts` and `en.ts`.
4. **Configurable Contact Email:** Display `nguyenvunhan1999@gmail.com` as the contact address for data subject inquiries and account deletion requests, backed by a configurable environment variable (`VITE_PRIVACY_EMAIL` with default fallback).
5. **Remove Draft Warning:** Remove `<Pill tone="warning">{t('privacy.draft')}</Pill>` to mark the policy live and official.
6. **Preserve Test Coverage:** Ensure existing unit test assertions (e.g. `libs/web/screens/src/screens/__tests__/sign-in.test.tsx` verifying Zalo data disclosure) continue to pass.

---

## 3. Non-Goals

- Building an automated backend self-service data export / deletion queue (users can delete trips/bank details in-app, and full account erasure can be requested via the contact email).
- Changing database schema or consent recording mechanics (consent timestamps are already recorded in `users.consent_at` and `bank_details.consent_at`).
- Adding third-party tracking or cookie banners (CoinCrew uses no advertising cookies or tracking scripts).

---

## 4. Anti-Goals (What would make this a failure)

- Presenting an intimidating, dense wall of corporate legalese that makes casual group members afraid to enter their bank account for VietQR.
- Omitting or glossing over the explicit statutory designation of bank accounts as "Sensitive Personal Data" under Decree 13.
- Hardcoding the contact email without environment variable support.
- Breaking responsive layout on mobile screens (must respect 44px touch targets and `DESIGN.md` guidelines).

---

## 5. Decisions Made With Human Partner

1. **Tone & Feel:** Friendly and transparent vibe, avoiding stern corporate legalese.
2. **Visual Structure:** Option A: 30-second Quick Summary card at top + Collapsible accordion sections below.
3. **Language Selection:** Follow the existing app language switcher in the header (`vi` / `en`) via `@cc/web-i18n`.
4. **Contact Point:** Use `nguyenvunhan1999@gmail.com`, driven by environment configuration (`VITE_PRIVACY_EMAIL`) with fallback.

---

## 6. Detailed Design

### 6.1 Screen Structure (`Privacy.tsx`)
The screen layout in `libs/web/screens/src/screens/Privacy.tsx`:
```tsx
<Screen title={t('privacy.title')} back="/" right={<LanguageButton />}>
  <div className="flex flex-col gap-4 py-4 max-w-[65ch]">
    {/* Quick Summary Card */}
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 ...">
      <h3>{t('privacy.summary.title')}</h3>
      <ul>
        <li>{t('privacy.summary.purpose')}</li>
        <li>{t('privacy.summary.banking')}</li>
        <li>{t('privacy.summary.noAds')}</li>
        <li>{t('privacy.summary.control')}</li>
      </ul>
    </div>

    {/* Accordion Sections */}
    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.operator.title')}</summary>
      <p>{t('privacy.sections.operator.body')}</p>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.data.title')}</summary>
      <div>
        <p><strong>{t('privacy.sections.data.basicTitle')}:</strong> {t('privacy.sections.data.basicBody')}</p>
        <p><strong>{t('privacy.sections.data.sensitiveTitle')}:</strong> {t('privacy.sections.data.sensitiveBody')}</p>
      </div>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.sharing.title')}</summary>
      <p>{t('privacy.sections.sharing.body')}</p>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.processors.title')}</summary>
      <p>{t('privacy.sections.processors.body')}</p>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.retention.title')}</summary>
      <p>{t('privacy.sections.retention.body')}</p>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.rights.title')}</summary>
      <p>{t('privacy.sections.rights.body')}</p>
    </details>

    <details className="rounded-lg border border-border p-3 ...">
      <summary>{t('privacy.sections.contact.title')}</summary>
      <p>{t('privacy.sections.contact.body', { email: PRIVACY_CONTACT_EMAIL })}</p>
    </details>
  </div>
</Screen>
```

### 6.2 Accordion Content Mapping (Decree 13 / PDPL Statutory Clauses)

| Section | Content & Compliance Focus |
|---|---|
| **Quick Summary** | Plain-language highlights: split expenses, VietQR payment only, bank details are sensitive, no data sold, delete anytime. |
| **1. Đơn vị vận hành / Who runs the service** | CoinCrew is operated independently as a group expense and settlement utility. |
| **2. Dữ liệu thu thập / Data collected** | **Basic:** Display names, Google email, Zalo user ID, display name and profile picture, trip names, expenses, settlement history.<br>**Sensitive (Decree 13 Art 2.4):** Bank name/BIN, bank account number, account holder name. Explicit third-party disclosure for guests entered by friends. |
| **3. Ai nhìn thấy dữ liệu / Who sees your data** | Trip members see expenses and roster names. **Bank account numbers are strictly shown only to members who owe money to you** during VietQR payment generation. |
| **4. Hạ tầng & Bên thứ ba / Processors & Hosting** | Cloudflare Workers & D1 storage; Google OAuth; VNG Zalo OAuth. Server infrastructure may reside outside Vietnam (cross-border hosting disclosure). |
| **5. Rủi ro không mong muốn / Unintended risks** | Sharing private trip invite links (`/j/<token>`) allows recipients to view trip expense history. Accuracy of bank numbers depends on user input. |
| **6. Thời gian lưu trữ / Retention** | Stored until trip deletion, bank info update/removal, or account deletion request. |
| **7. Quyền của bạn / Your rights** | Full statutory rights under Decree 13 Art 9 & PDPL: right to know, consent, access, correct, delete, withdraw consent, restrict processing, file complaints. |
| **8. Liên hệ / Contact** | Contact email for privacy inquiries and account/data deletion requests (`nguyenvunhan1999@gmail.com`). |

### 6.3 Configuration & Environment
In `libs/web/screens/src/config.ts`:
```ts
export const PRIVACY_CONTACT_EMAIL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRIVACY_EMAIL) ||
  'nguyenvunhan1999@gmail.com';
```

### 6.4 Translation Files (`libs/web/i18n/src/`)
- `vi.ts`: Comprehensive, warm, and natural Vietnamese phrasing adhering to legal definitions without sounding rigid.
- `en.ts`: Clear English matching the Vietnamese notice, including exact string: `"Zalo user ID, display name and profile picture"` for test compatibility.

---

## 7. What's Left to the Builder

- Choosing HTML5 native `<details>`/`<summary>` styling vs custom state toggle for maximum accessibility and seamless mobile touch response.
- Exact styling tokens matching `DESIGN.md` (warm rice paper background, primary teal accents, 44px min tap height on accordion summaries).
- Verification via Vitest: running `libs/web/screens/src/screens/__tests__/sign-in.test.tsx` and full suite.
