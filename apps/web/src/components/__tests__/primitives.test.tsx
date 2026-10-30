import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderAt } from '../../test/render';
import { Button } from '../Button';
import { Snackbar } from '../Snackbar';
import { Avatar } from '../Avatar';
import { Sheet } from '../Sheet';
import { Pill } from '../Pill';

describe('shared primitives on shadcn', () => {
  it('Button primary renders the teal pill and keeps its test hooks', () => {
    render(<Button>Settle up</Button>);
    expect(screen.getByRole('button', { name: 'Settle up' })).toHaveClass(
      'fsl-button',
      'fsl-button--primary',
      'bg-primary',
      'rounded-full',
    );
  });

  it('Button secondary is the soft teal pill', () => {
    render(<Button variant="secondary">Invite</Button>);
    expect(screen.getByRole('button', { name: 'Invite' })).toHaveClass('fsl-button--secondary', 'bg-secondary');
  });

  it('Button block fills the width', () => {
    render(<Button block>Add expense</Button>);
    expect(screen.getByRole('button', { name: 'Add expense' })).toHaveClass('fsl-button--block', 'w-full');
  });

  it('Button loading is disabled and aria-busy', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('Button with an in-app href routes', async () => {
    renderAt(<Button href="/t/abc">Open trip</Button>);
    await userEvent.click(screen.getByRole('link', { name: 'Open trip' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/t/abc');
  });

  it('Snackbar is an announced status with the Friendly dark pill and runs its action', async () => {
    const onAction = vi.fn();
    render(<Snackbar message="Marked as paid" actionLabel="Undo" onAction={onAction} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Marked as paid');
    expect(status.querySelector('.fsl-snackbar__inner')).toHaveClass('bg-foreground', 'rounded-2xl');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('Avatar fallback colour is stable for a name', () => {
    const tone = (el: Element) => [...el.classList].find((c) => /^bg-avatar-\d$/.test(c));
    const { container: a } = render(<Avatar name="Trần Lan" />);
    const { container: b } = render(<Avatar name="Trần Lan" />);
    const first = tone(a.querySelector('.fsl-avatar')!);
    expect(first).toMatch(/^bg-avatar-[1-6]$/);
    expect(tone(b.querySelector('.fsl-avatar')!)).toBe(first);
    expect(a.querySelector('.fsl-avatar')).toHaveTextContent('L');
  });

  it('Pill success uses the soft success colours', () => {
    render(<Pill tone="success">Paid</Pill>);
    expect(screen.getByText('Paid')).toHaveClass('fsl-pill', 'fsl-pill--success', 'bg-success-soft', 'text-success');
  });

  it('Sheet keeps fsl-sheet and is labelled by its title', async () => {
    render(
      <Sheet open title="Invite people" onClose={() => {}}>
        <p>Share this link</p>
      </Sheet>,
    );
    expect(await screen.findByRole('dialog', { name: 'Invite people' })).toHaveClass('fsl-sheet');
  });
});
