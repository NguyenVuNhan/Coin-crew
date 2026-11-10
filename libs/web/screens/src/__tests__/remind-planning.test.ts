import { describe, it, expect } from 'vitest';
import { sportPlanningShareText } from '../lib/remind';

describe('sportPlanningShareText', () => {
  it('formats Vietnamese and English planning messages with location, map link, courts, and slots', () => {
    const input = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      location: {
        name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
        address: '158 Phú Diễn, Hà Nội',
        phone: '0345747800',
        mapUrl: 'https://maps.app.goo.gl/xyz123',
      },
      courtSlots: [
        { courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' },
        { courtName: 'Cầu Lông 5', timeRange: '05:30 - 07:00' },
      ],
      totalFemaleSlots: 7,
      totalMaleSlots: 12,
      link: 'https://coincrew.app/j/tok/e/exp-1',
    };

    const vi = sportPlanningShareText('vi', input);
    expect(vi).toContain('Sân Cầu Lông Putin - 158 Phú Diễn');
    expect(vi).toContain('https://maps.app.goo.gl/xyz123');
    expect(vi).toContain('Cầu Lông 6 (05:00 - 07:00), Cầu Lông 5 (05:30 - 07:00)');
    expect(vi).toContain('19 suất (7 Nữ, 12 Nam)');
    expect(vi).toContain('https://coincrew.app/j/tok/e/exp-1');

    const en = sportPlanningShareText('en', input);
    expect(en).toContain('19 slots (7F, 12M)');
  });
});
