# Update Privacy Notice for Vietnam Personal Data Rules (Decree 13/2023 & PDPL 2026) — Design

Date: 2026-11-07 · Status: Ready for execution planning  
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

Success means: Replacing the draft notice with a friendly, fully compliant bilingual Privacy Notice that adheres strictly to CoinCrew's **"The Friendly Ledger"** design system (`DESIGN.md`), reassuring casual users while meeting all statutory requirements of Decree 13/2023 and PDPL 2026.

---

## 2. Goals

1. **Vietnam Regulatory Compliance:** Fully comply with Decree 13/2023/ND-CP and PDPL 2026 by explicitly distinguishing basic personal data from sensitive personal data (bank details), listing third-party processors (Cloudflare, Google, Zalo), disclosing cloud server locations, identifying unintended risks (sharing trip invite links), and detailing data subject rights under Article 9.
2. **Friendly Ledger Experience (DESIGN.md):** 
   - A 30-second "Quick Summary" Summary Card (`bg-card rounded-xl p-5 border border-border`) at the top explaining in plain language the core principles (we only split expenses, bank details are sensitive and only shown to debtors settling up, no ads/selling data, you control your data).
   - CoinCrew's signature **Grouped List** (`bg-card rounded-xl border border-border divide-y divide-border overflow-hidden`) with collapsible accordion rows for users who want the full legal details.
   - Generous **44px minimum tap targets** (`min-h-[44px]`) on every accordion row for thumb-friendly mobile ergonomics.
3. **Impeccable Token Compliance:**
   - Follow **"The One Source Rule"**: 100% theme tokens (`primary`, `secondary`, `secondary-foreground`, `card`, `border`, `muted`, `muted-foreground`, `foreground`), zero raw hex, and zero corporate blue. Fully theme-swap safe across Jade, Pink, Orchid, Sky, and Indigo.
   - Follow **"The Money Means Something Rule"**: Do not decorate legal terms with Turmeric, Leaf, or Lychee. Use Jade Mist (`bg-secondary text-secondary-foreground`) or neutral fills (`bg-muted text-muted-foreground`) for badges.
4. **Bilingual Localization:** Follow the existing app language switcher (`vi` / `en`). Vietnamese users see natural, warm Vietnamese copy; English users see English. All text managed via `libs/web/i18n/src/vi.ts` and `en.ts`.
5. **Configurable Contact Email:** Display `nguyenvunhan1999@gmail.com` as the contact address for data subject inquiries and account deletion requests, backed by a configurable environment variable (`VITE_PRIVACY_EMAIL` with default fallback).
6. **Remove Draft Warning:** Remove `<Pill tone="warning">{t('privacy.draft')}</Pill>` to mark the policy live and official.
7. **Preserve Test Coverage:** Ensure existing unit test assertions (e.g. `libs/web/screens/src/screens/__tests__/sign-in.test.tsx` verifying Zalo data disclosure) continue to pass.

---

## 3. Non-Goals

- Building an automated backend self-service data export / deletion queue (users can delete trips/bank details in-app, and full account erasure can be requested via the contact email).
- Changing database schema or consent recording mechanics (consent timestamps are already recorded in `users.consent_at` and `bank_details.consent_at`).
- Adding third-party tracking or cookie banners (CoinCrew uses no advertising cookies or tracking scripts).

---

## 4. Anti-Goals (What would make this a failure)

- Presenting an intimidating, dense wall of corporate legalese that makes casual group members afraid to enter their bank account for VietQR.
- Letting the screen look like a corporate banking app (no navy/blue-grey palette, no disconnected bordered cards, no dense forms).
- Violating `DESIGN.md` rules (no raw hex, no tap targets smaller than 44px, no Turmeric decoration).
- Hardcoding the contact email without environment variable support.

---

## 5. Decisions Made With Human Partner

1. **Tone & Feel:** Friendly and transparent vibe, avoiding stern corporate legalese.
2. **Visual Structure:** Option A: 30-second Quick Summary card at top + Grouped List accordion sections below.
3. **Impeccable Design System Alignment:** Strictly follows `DESIGN.md`:
   - Warm Rice Paper background (`bg-background`).
   - Summary Card (`bg-card rounded-xl p-5 border border-border`) with Jade Mist chip (`bg-secondary text-secondary-foreground`).
   - Grouped Ledger Accordion (`bg-card rounded-xl border border-border divide-y divide-border overflow-hidden`).
   - 44px minimum tap targets (`min-h-[44px]`) on all summary rows.
   - Theme tokens only (Jade default, theme-swap compatible).
4. **Language Selection:** Follow the existing app language switcher in the header (`vi` / `en`) via `@cc/web-i18n`.
5. **Contact Point:** Use `nguyenvunhan1999@gmail.com`, driven by environment configuration (`VITE_PRIVACY_EMAIL`) with fallback.

---

## 6. Detailed Design

### 6.1 Screen Structure (`Privacy.tsx`)
The screen layout in `libs/web/screens/src/screens/Privacy.tsx`:
```tsx
import { useT } from '@cc/web-i18n';
import { Screen } from '../components/Screen';
import { LanguageButton } from '@cc/web-ui/components/LanguageButton';
import { PRIVACY_CONTACT_EMAIL } from '../config';

export function Privacy() {
  const t = useT();

  return (
    <Screen title={t('privacy.title')} back="/" right={<LanguageButton />}>
      <div className="flex flex-col gap-4 py-4 max-w-[65ch]">
        {/* Quick Summary Card */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-secondary text-secondary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {t('privacy.summary.badge')}
            </span>
            <span className="text-xs text-muted-foreground">{t('privacy.summary.readTime')}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed m-0">
            {t('privacy.summary.lead')}
          </p>
        </div>

        {/* Section Label */}
        <div className="text-sm font-semibold text-muted-foreground px-1 mt-2">
          {t('privacy.sectionLabel')}
        </div>

        {/* Grouped Ledger Accordion */}
        <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
          {/* Section 1: Operator */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.operator.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.operator.body')}
            </div>
          </details>

          {/* Section 2: Data Collected & Classification (Decree 13) */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.data.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed space-y-2">
              <p className="m-0">
                <strong className="text-foreground">{t('privacy.sections.data.basicLabel')}:</strong>{' '}
                {t('privacy.sections.data.basicBody')}
              </p>
              <p className="m-0">
                <strong className="text-foreground">{t('privacy.sections.data.sensitiveLabel')}:</strong>{' '}
                {t('privacy.sections.data.sensitiveBody')}
              </p>
            </div>
          </details>

          {/* Section 3: Visibility & Who Sees Bank Details */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.sharing.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.sharing.body')}
            </div>
          </details>

          {/* Section 4: Processors & Cross-Border Hosting */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.processors.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.processors.body')}
            </div>
          </details>

          {/* Section 5: Unintended Risks (Invite Links & Input Accuracy) */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.risks.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.risks.body')}
            </div>
          </details>

          {/* Section 6: Retention Period */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.retention.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.retention.body')}
            </div>
          </details>

          {/* Section 7: User Rights (Article 9 Decree 13 & PDPL) */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.rights.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              {t('privacy.sections.rights.body')}
            </div>
          </details>

          {/* Section 8: Contact & Deletion Requests */}
          <details className="group">
            <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors">
              <span>{t('privacy.sections.contact.title')}</span>
              <span className="text-xs text-primary transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
              <p className="m-0">
                {t('privacy.sections.contact.body')}{' '}
                <a
                  href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                  {PRIVACY_CONTACT_EMAIL}
                </a>
                .
              </p>
            </div>
          </details>
        </div>
      </div>
    </Screen>
  );
}
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

- Styling refinement ensuring `globals.css` theme classes work identically across all light themes (Jade, Pink, Orchid, Sky, Indigo).
- Verification via Vitest:
  - `libs/web/screens/src/screens/__tests__/sign-in.test.tsx` (passes Zalo text check).
  - `libs/web/screens/src/screens/__tests__/back-navigation.test.tsx` (passes `/privacy` route tests).
  - Full suite `npm test` and `npm run typecheck`.
