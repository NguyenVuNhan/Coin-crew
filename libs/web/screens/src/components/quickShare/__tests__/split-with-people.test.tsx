import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt } from '../../../test/render';
import { OutcomeSentence } from '../OutcomeSentence';
import { SplitWithPeople } from '../SplitWithPeople';
import type { QuickSplit } from '../useQuickSplit';

const ME = 'p-me';
const MINH = 'p-minh';
const LAN = 'p-lan';
const HUNG = 'p-hung';

const PEOPLE: PersonView[] = [
  { id: ME, name: 'Nhân', status: 'active', isMember: true, bank: 'none' },
  { id: MINH, name: 'Minh', status: 'active', isMember: false, bank: 'none' },
  { id: LAN, name: 'Lan', status: 'active', isMember: false, bank: 'none' },
  { id: HUNG, name: 'Hùng', status: 'active', isMember: false, bank: 'none' },
];

const NAMES = new Map(PEOPLE.map((p) => [p.id, p.name]));

function makeSplit(overrides: Partial<QuickSplit> = {}): QuickSplit {
  return {
    people: PEOPLE,
    chipIds: [LAN, MINH, HUNG],
    chosen: new Set<string>(),
    toggle: vi.fn(),
    setChosen: vi.fn(),
    flipped: false,
    setFlipped: vi.fn(),
    payerId: ME,
    setPayerId: vi.fn(),
    mode: 'equal',
    setMode: vi.fn(),
    inputs: {},
    setInput: vi.fn(),
    splitParticipants: [],
    result: null,
    outcome: null,
    canFlip: false,
    splitExtra: undefined,
    isDirty: false,
    reset: vi.fn(),
    ...overrides,
  };
}

describe('SplitWithPeople', () => {
  // Owner, 2026-11-21: the entry page picks people with the group form's "Chia cho" line, not chips.
  it('shows the group "Chia cho" line with no error when nobody is chosen', () => {
    renderAt(<SplitWithPeople split={makeSplit()} label="Chia với ai? (không bắt buộc)" me={ME} kind="shared" />);
    act(() => {
      setLang('vi');
    });

    const section = screen.getByTestId('entry-people');
    expect(section).toHaveTextContent('Chia với ai? (không bắt buộc)');
    expect(section.querySelector('.fsl-split-between')).not.toBeNull();
    expect(section).toHaveTextContent('Chưa chọn ai');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('on Chi counts you in once someone is picked, and picking from the sheet never stores you', async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [chosen, setChosen] = useState<Set<string>>(() => new Set());
      const split = makeSplit({ chosen, setChosen: (next) => setChosen(new Set(next)) });
      return (
        <>
          <SplitWithPeople split={split} label="Chia với ai?" me={ME} kind="shared" />
          <output data-testid="stored">{[...chosen].join(',')}</output>
        </>
      );
    }

    renderAt(<Controlled />);
    act(() => {
      setLang('vi');
    });

    await user.click(screen.getByRole('button', { name: /Chia cho/ }));
    await user.click(await screen.findByRole('button', { name: 'Thêm Minh' }));
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    expect(screen.getByTestId('entry-people')).toHaveTextContent('Bạn, Minh');
    expect(screen.getByTestId('stored')).toHaveTextContent(/^p-minh$/);
  });

  it('on Vay/Nợ shows only the people picked', () => {
    renderAt(
      <SplitWithPeople split={makeSplit({ chosen: new Set([MINH]) })} label="Với ai?" me={ME} kind="loan" />,
    );
    act(() => {
      setLang('vi');
    });

    const section = screen.getByTestId('entry-people');
    expect(section).toHaveTextContent('Minh');
    expect(section).not.toHaveTextContent('Bạn');
  });

  it('lists you first, then the most recently used people, in the sheet', async () => {
    const user = userEvent.setup();
    renderAt(<SplitWithPeople split={makeSplit()} label="Chia với ai?" me={ME} kind="shared" />);
    act(() => {
      setLang('vi');
    });

    await user.click(screen.getByRole('button', { name: /Chia cho/ }));
    const adds = await screen.findAllByRole('button', { name: /^Thêm / });
    expect(adds.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Thêm Nhân',
      'Thêm Lan',
      'Thêm Minh',
      'Thêm Hùng',
    ]);
  });
});

describe('OutcomeSentence', () => {
  it('reads exact Vietnamese sentence for shared 50k with Minh', () => {
    const split = makeSplit({
      chosen: new Set([MINH]),
      payerId: ME,
      canFlip: true,
      outcome: {
        myShare: 25_000,
        lines: [{ personId: MINH, amount: 25_000, direction: 'owesMe' }],
      },
    });

    renderAt(<OutcomeSentence split={split} kind="shared" names={NAMES} onFlip={vi.fn()} />);
    act(() => {
      setLang('vi');
    });

    const el = screen.getByTestId('entry-outcome');
    expect(el).toHaveClass('fsl-outcome', 'bg-success-soft');
    expect(el).toHaveAttribute('aria-live', 'polite');
    expect(el).toHaveTextContent('Phần bạn 25.000₫ · Minh nợ bạn 25.000₫');
  });

  it('reads exact Vietnamese sentence for flipped shared 50k with Minh', () => {
    const split = makeSplit({
      chosen: new Set([MINH]),
      flipped: true,
      payerId: MINH,
      canFlip: true,
      outcome: {
        myShare: 25_000,
        lines: [{ personId: MINH, amount: 25_000, direction: 'iOwe' }],
      },
    });

    renderAt(<OutcomeSentence split={split} kind="shared" names={NAMES} onFlip={vi.fn()} />);
    act(() => {
      setLang('vi');
    });

    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Minh trả · Bạn nợ Minh 25.000₫');
  });

  it('reads exact Vietnamese sentence for 100k loan with Minh and Lan and omits flip button', () => {
    const split = makeSplit({
      chosen: new Set([MINH, LAN]),
      payerId: ME,
      canFlip: false,
      outcome: {
        myShare: 0,
        lines: [
          { personId: MINH, amount: 50_000, direction: 'owesMe' },
          { personId: LAN, amount: 50_000, direction: 'owesMe' },
        ],
      },
    });

    renderAt(<OutcomeSentence split={split} kind="loan" names={NAMES} onFlip={vi.fn()} />);
    act(() => {
      setLang('vi');
    });

    const el = screen.getByTestId('entry-outcome');
    expect(el).toHaveTextContent('Minh, Lan mỗi người nợ bạn 50.000₫');
    expect(el).not.toHaveTextContent('Phần bạn');
    expect(screen.queryByTestId('entry-flip')).not.toBeInTheDocument();
  });

  it('calls onFlip when flip button is clicked', async () => {
    const user = userEvent.setup();
    const onFlip = vi.fn();
    const split = makeSplit({
      chosen: new Set([MINH]),
      payerId: ME,
      canFlip: true,
      outcome: {
        myShare: 25_000,
        lines: [{ personId: MINH, amount: 25_000, direction: 'owesMe' }],
      },
    });

    renderAt(<OutcomeSentence split={split} kind="shared" names={NAMES} onFlip={onFlip} />);

    await user.click(screen.getByTestId('entry-flip'));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });
});
