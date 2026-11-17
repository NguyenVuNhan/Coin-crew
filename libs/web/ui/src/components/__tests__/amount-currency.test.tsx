import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatVnd } from '@cc/core';
import { Amount } from '../Amount';

describe('Amount currency support', () => {
  it('renders 1,234.56 USD as "1.234,56 $" in tabular-nums', () => {
    render(<Amount value={123456} currency="USD" />);
    const el = screen.getByText('1.234,56 $');
    expect(el).toHaveClass('tabular-nums');
  });

  it('renders USDT with 2 decimals', () => {
    render(<Amount value={123456} currency="USDT" />);
    expect(screen.getByText('1.234,56 USDT')).toHaveClass('tabular-nums');
  });

  it('adds ≈ prefix when approximate is true', () => {
    render(<Amount value={123456} currency="USD" approximate />);
    expect(screen.getByText('≈ 1.234,56 $')).toBeInTheDocument();
  });

  it('renders without currency prop exactly like before (formatVnd)', () => {
    const { container } = render(<Amount value={1250000} />);
    expect(container.textContent).toBe(formatVnd(1250000));

    const neg = render(<Amount value={-50000} />);
    expect(neg.container.textContent).toBe(formatVnd(-50000));
  });
});
