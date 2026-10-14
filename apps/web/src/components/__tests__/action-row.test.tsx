import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { SwipeGroupProvider } from '../../lib/useSwipeReveal';
import { ActionRow, type RowAction } from '../ActionRow';
import { ActionSheet } from '../ActionSheet';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HINT = 'Swipe left or tap a row for options';

function actions(onEdit = vi.fn(), onDisable = vi.fn()): RowAction[] {
  return [
    { id: 'edit', label: 'Edit', icon: 'edit', onSelect: onEdit },
    { id: 'disable', label: 'Disable', icon: 'ban', tone: 'danger', onSelect: onDisable },
  ];
}

function Row({ label, ...rest }: { label: string } & Partial<Parameters<typeof ActionRow>[0]>) {
  return (
    <ActionRow label={label} actions={actions()} {...rest}>
      <span>{label} 800.000₫</span>
    </ActionRow>
  );
}

const rowButton = (label: string) => screen.getByRole('button', { name: label });
const surfaceOf = (label: string) => rowButton(label).closest<HTMLElement>('.fsl-action-row__surface')!;
const stageOf = (label: string) => rowButton(label).closest<HTMLElement>('.fsl-action-row__stage')!;
const isOpen = (label: string) => stageOf(label).dataset.open === 'true';

/** Press on `el`, move by (dx, dy) in one step and (unless told otherwise) lift the finger. */
function drag(el: Element, dx: number, dy = 0, release = true) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy });
  if (release) fireEvent.pointerUp(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy });
}

describe('swipe on a phone', () => {
  it('pulling past 40% opens the row, less springs back', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />); // two actions of 80px: 160px behind the row
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');

    drag(rowButton('Homestay'), -50);
    expect(isOpen('Homestay')).toBe(false);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');

    drag(rowButton('Homestay'), -70);
    expect(isOpen('Homestay')).toBe(true);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(-160px)');
  });

  it('the row follows the finger while it is down', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    drag(rowButton('Homestay'), -70, 0, false);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(-70px)');
    drag(rowButton('Homestay'), -400, 0, false); // never further than the actions
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(-160px)');
  });

  it('a mostly vertical drag never opens the row', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    drag(rowButton('Homestay'), -40, 60, false);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
    fireEvent.pointerUp(rowButton('Homestay'), { pointerId: 1, clientX: 260, clientY: 160 });
    expect(isOpen('Homestay')).toBe(false);
    // And a short wobble under 8px is not a swipe either.
    drag(rowButton('Homestay'), -8);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
  });

  it('a drag that turns vertical stays a scroll even if it later drifts sideways', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    const el = rowButton('Homestay');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 298, clientY: 140 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200, clientY: 145 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 200, clientY: 145 });
    expect(isOpen('Homestay')).toBe(false);
  });

  it('opening one row closes the other', () => {
    mockMedia({ coarse: true });
    renderAt(
      <SwipeGroupProvider>
        <Row label="Homestay" />
        <Row label="Motorbike" />
      </SwipeGroupProvider>,
    );
    drag(rowButton('Homestay'), -100);
    expect(isOpen('Homestay')).toBe(true);
    drag(rowButton('Motorbike'), -100);
    expect(isOpen('Motorbike')).toBe(true);
    expect(isOpen('Homestay')).toBe(false);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
  });

  it('a press elsewhere or a scroll closes the open row, a press on it does not', () => {
    mockMedia({ coarse: true });
    renderAt(
      <SwipeGroupProvider>
        <div data-testid="scroller">
          <Row label="Homestay" />
        </div>
        <p>elsewhere</p>
      </SwipeGroupProvider>,
    );
    drag(rowButton('Homestay'), -100);
    fireEvent.pointerDown(rowButton('Homestay'), { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(rowButton('Homestay'), { pointerId: 2, clientX: 300, clientY: 100 });
    expect(isOpen('Homestay')).toBe(true);
    fireEvent.pointerDown(screen.getByText('elsewhere'), { pointerId: 3 });
    expect(isOpen('Homestay')).toBe(false);

    drag(rowButton('Homestay'), -100);
    expect(isOpen('Homestay')).toBe(true);
    fireEvent.scroll(screen.getByTestId('scroller'));
    expect(isOpen('Homestay')).toBe(false);
  });

  it('dragging an open row back past 40% closes it, a nudge keeps it open', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    drag(rowButton('Homestay'), -100);
    expect(isOpen('Homestay')).toBe(true);
    drag(rowButton('Homestay'), 20);
    expect(isOpen('Homestay')).toBe(true);
    drag(rowButton('Homestay'), 70);
    expect(isOpen('Homestay')).toBe(false);
  });

  it('a cancelled gesture puts the row back where it was', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    drag(rowButton('Homestay'), -100, 0, false);
    fireEvent.pointerCancel(rowButton('Homestay'), { pointerId: 1 });
    expect(isOpen('Homestay')).toBe(false);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
  });

  it('a revealed action runs and the row closes', async () => {
    mockMedia({ coarse: true });
    const onDisable = vi.fn();
    renderAt(<ActionRow label="Homestay" actions={actions(vi.fn(), onDisable)}><span>Homestay</span></ActionRow>);
    drag(rowButton('Homestay'), -100);
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(isOpen('Homestay')).toBe(false);
  });

  it('lifting the finger after a swipe does not also open the row', async () => {
    mockMedia({ coarse: true });
    const onOpen = vi.fn();
    renderAt(<Row label="Homestay" onOpen={onOpen} />);
    drag(rowButton('Homestay'), -100);
    fireEvent.click(rowButton('Homestay')); // the click some browsers fire after a drag
    expect(onOpen).not.toHaveBeenCalled();
    expect(isOpen('Homestay')).toBe(true);
    // A later, real tap on the open row only closes it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await userEvent.click(rowButton('Homestay'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(isOpen('Homestay')).toBe(false);
    // Tapping a closed row opens it.
    await userEvent.click(rowButton('Homestay'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('hover on the web', () => {
  it('with a mouse the actions show as labelled buttons and run', async () => {
    mockMedia({ coarse: false });
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    renderAt(<ActionRow label="Homestay" actions={actions(onEdit, onDisable)}><span>Homestay</span></ActionRow>);
    const disable = screen.getByRole('button', { name: 'Disable' });
    expect(disable).toHaveAttribute('title', 'Disable');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('title', 'Edit');
    await userEvent.click(disable);
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('the actions are siblings of the row button, never inside it', () => {
    mockMedia({ coarse: false });
    renderAt(<Row label="Homestay" />);
    expect(rowButton('Homestay').querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' }).closest('button')).toBe(screen.getByRole('button', { name: 'Edit' }));
    expect(rowButton('Homestay').contains(screen.getByRole('button', { name: 'Edit' }))).toBe(false);
  });

  it('dragging with a mouse does not slide the row', () => {
    mockMedia({ coarse: false });
    renderAt(<Row label="Homestay" />);
    drag(rowButton('Homestay'), -100);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
  });
});

describe('the row itself', () => {
  it('Enter on the row opens it', async () => {
    mockMedia({ coarse: false });
    const onOpen = vi.fn();
    renderAt(<Row label="Homestay" onOpen={onOpen} />);
    rowButton('Homestay').focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('marks the selected row for assistive tech', () => {
    mockMedia({ coarse: false });
    renderAt(
      <>
        <Row label="Homestay" selected />
        <Row label="Motorbike" />
      </>,
    );
    expect(rowButton('Homestay')).toHaveAttribute('aria-current', 'true');
    expect(rowButton('Motorbike')).not.toHaveAttribute('aria-current');
  });

  it('shows the leading element outside the row button', () => {
    mockMedia({ coarse: false });
    renderAt(<Row label="Homestay" leading={<button type="button">Tick</button>} />);
    expect(screen.getByRole('button', { name: 'Tick' })).toBeInTheDocument();
    expect(rowButton('Homestay').contains(screen.getByRole('button', { name: 'Tick' }))).toBe(false);
  });

  it('a row without actions is just a button', () => {
    mockMedia({ coarse: true });
    renderAt(<ActionRow label="Homestay" actions={[]}><span>Homestay</span></ActionRow>);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    drag(rowButton('Homestay'), -100);
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(0px)');
  });
});

describe('the swipe hint', () => {
  it('the swipe hint shows once per device', () => {
    mockMedia({ coarse: true });
    const first = renderAt(<Row label="Homestay" hintable />);
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(localStorage.getItem('fsl.swipeHintSeen')).not.toBeNull();
    first.unmount();

    renderAt(<Row label="Homestay" hintable />);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('is for phones and for rows that ask for it', () => {
    mockMedia({ coarse: true });
    const plain = renderAt(<Row label="Homestay" />);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(localStorage.getItem('fsl.swipeHintSeen')).toBeNull();
    plain.unmount();

    mockMedia({ coarse: false });
    renderAt(<Row label="Homestay" hintable />);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(localStorage.getItem('fsl.swipeHintSeen')).toBeNull();
  });

  it('still works when storage is blocked', () => {
    mockMedia({ coarse: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt(<Row label="Homestay" hintable />);
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(rowButton('Homestay')).toBeInTheDocument();
  });

  it('goes away once the person touches the row', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" hintable />);
    fireEvent.pointerDown(rowButton('Homestay'), { pointerId: 1, clientX: 300, clientY: 100 });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});

describe('motion', () => {
  it('reduce motion: no slide transition', () => {
    mockMedia({ coarse: true, reducedMotion: true });
    renderAt(<Row label="Homestay" hintable />);
    expect(surfaceOf('Homestay').style.transition).toBe('');
    drag(rowButton('Homestay'), -100);
    expect(isOpen('Homestay')).toBe(true);
    expect(surfaceOf('Homestay').style.transition).toBe('');
    expect(surfaceOf('Homestay').style.transform).toBe('translateX(-160px)');
  });

  it('otherwise the row slides, and follows the finger without lag', () => {
    mockMedia({ coarse: true });
    renderAt(<Row label="Homestay" />);
    expect(surfaceOf('Homestay').style.transition).toContain('transform');
    drag(rowButton('Homestay'), -70, 0, false);
    expect(surfaceOf('Homestay').style.transition).toBe('none');
  });
});

describe('ActionSheet', () => {
  it('lists every action as a full-width button; choosing one closes the sheet and runs it', async () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();
    const onDisable = vi.fn();
    renderAt(<ActionSheet open onClose={onClose} title="Bình" actions={actions(onEdit, onDisable)} />);
    expect(screen.getByRole('dialog', { name: 'Bình' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onDisable).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderAt(<ActionSheet open={false} onClose={() => {}} title="Bình" actions={actions()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
