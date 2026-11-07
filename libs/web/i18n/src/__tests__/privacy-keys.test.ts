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
    expect(vi['privacy.sections.data.sensitiveLabel' as keyof typeof vi]).toMatch(/Dữ liệu.*nhạy cảm/i);
    expect(en['privacy.sections.data.sensitiveLabel' as keyof typeof en]).toMatch(/Sensitive.*data/i);
  });
});
