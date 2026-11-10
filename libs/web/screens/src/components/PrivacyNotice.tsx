import { useState } from 'react';
import { useT } from '@cc/web-i18n';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';
import { PRIVACY_CONTACT_EMAIL } from '../config';

/** The privacy notice itself: the /privacy screen and the in-form sheet both show it. */
export function PrivacyNotice() {
  const t = useT();

  return (
    <div className={cn('fsl-privacy flex flex-col gap-4 py-4 max-w-[65ch]')}>
      {/* Quick Summary Card */}
      <div className={cn('bg-card rounded-xl p-5 border border-border')}>
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
      <div className={cn('bg-card rounded-xl border border-border divide-y divide-border overflow-hidden')}>
        {/* Section 1: Operator */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.operator.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.operator.body')}
          </div>
        </details>

        {/* Section 2: Data Collected & Classification (Decree 13) */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.data.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
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
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.sharing.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.sharing.body')}
          </div>
        </details>

        {/* Section 4: Processors & Cross-Border Hosting */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.processors.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.processors.body')}
          </div>
        </details>

        {/* Section 5: Unintended Risks */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.risks.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.risks.body')}
          </div>
        </details>

        {/* Section 6: Retention Period */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.retention.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.retention.body')}
          </div>
        </details>

        {/* Section 7: User Rights (Article 9 Decree 13 & PDPL) */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.rights.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-3.5 pt-1 text-sm text-muted-foreground leading-relaxed">
            {t('privacy.sections.rights.body')}
          </div>
        </details>

        {/* Section 8: Contact & Deletion Requests */}
        <details className="group">
          <summary className="min-h-[44px] py-3 px-4 flex items-center justify-between cursor-pointer font-semibold text-foreground text-sm select-none hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">
            <span>{t('privacy.sections.contact.title')}</span>
            <span className="text-xs text-primary transition-transform motion-reduce:transition-none group-open:rotate-180">▾</span>
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
  );
}

/**
 * Inline "privacy notice" link for forms. Opens the notice in a sheet instead of routing to /privacy,
 * so the form underneath stays mounted and keeps what the user typed.
 */
export function PrivacyNoticeLink({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn('fsl-privacy-link cursor-pointer bg-transparent p-0', className)}
        onClick={(e) => {
          // The link sits inside the consent <Label>: don't let the click tick the checkbox.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {t('bankForm.privacyLink')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('privacy.title')} className="fsl-privacy-sheet">
        <PrivacyNotice />
      </Sheet>
    </>
  );
}
