import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt } from '../../../test/render';
import { OutcomeSentence } from '../OutcomeSentence';
import { PeopleChips } from '../PeopleChips';
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

describe('PeopleChips', () => {
  it('renders chips in chipIds order', () => {
    const split = makeSplit({ chipIds: [LAN, MINH, HUNG] });

    renderAt(<PeopleChips split={split} label="Split with?" me={ME} testId="entry-people" />);

    const container = screen.getByTestId('entry-people');
    const chipButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid^="entry-person-"]'),
    );
    expect(chipButtons.map((b) => b.dataset.testid)).toEqual([
      `entry-person-${LAN}`,
      `entry-person-${MINH}`,
      `entry-person-${HUNG}`,
    ]);
  });

  it('tapping a chip toggles aria-pressed', async () => {
    const user = userEvent.setup();

    function ControlledChips() {
      const [chosen, setChosen] = useState<Set<string>>(() => new Set());
      const split = makeSplit({
        chosen,
        toggle: (id) => {
          setChosen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        },
        setChosen: (next) => setChosen(new Set(next)),
      });
      return <PeopleChips split={split} label="Split with?" me={ME} />;
    }

    renderAt(<ControlledChips />);

    const minhChip = screen.getByTestId(`entry-person-${MINH}`);
    expect(minhChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(minhChip);
    expect(minhChip).toHaveAttribute('aria-pressed', 'true');

    await user.click(minhChip);
    expect(minhChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing me from the sheet shows the Bạn chip', async () => {
    const user = userEvent.setup();

    function ControlledChips() {
      const [chosen, setChosen] = useState<Set<string>>(() => new Set());
      const split = makeSplit({
        chosen,
        toggle: (id) => {
          setChosen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        },
        setChosen: (next) => setChosen(new Set(next)),
      });
      return <PeopleChips split={split} label="Chia với ai?" me={ME} />;
    }

    renderAt(<ControlledChips />);
    act(() => {
      setLang('vi');
    });

    expect(screen.queryByTestId(`entry-person-${ME}`)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('entry-people-more'));
    await user.click(await screen.findByRole('button', { name: 'Thêm Nhân' }));
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    const meChip = screen.getByTestId(`entry-person-${ME}`);
    expect(meChip).toHaveTextContent('Bạn');
    expect(meChip).toHaveAttribute('aria-pressed', 'true');
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
