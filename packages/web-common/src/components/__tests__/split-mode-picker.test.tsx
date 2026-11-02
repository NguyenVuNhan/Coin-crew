import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SplitMode } from '@fsl/core';
import { setLang } from '../../i18n';
import { SplitModePicker } from '../SplitModePicker';

function Controlled({ start = 'equal', onChange }: { start?: SplitMode; onChange?: (m: SplitMode) => void }) {
  const [mode, setMode] = useState<SplitMode>(start);
  return (
    <SplitModePicker
      value={mode}
      onChange={(m) => {
        setMode(m);
        onChange?.(m);
      }}
    />
  );
}

describe('SplitModePicker', () => {
  it('is one radio group with the picked mode checked and the others out of the tab order', () => {
    setLang('en');
    render(<Controlled start="percent" />);
    expect(screen.getByRole('radiogroup', { name: 'Split' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Percent' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Percent' })).toHaveAttribute('tabindex', '0');
    for (const name of ['Equally', 'Exact amounts', 'Shares', 'Adjust']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked();
      expect(screen.getByRole('radio', { name })).toHaveAttribute('tabindex', '-1');
    }
  });

  it('picks a mode on click', async () => {
    setLang('en');
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Shares' }));
    expect(onChange).toHaveBeenCalledWith('shares');
    expect(screen.getByRole('radio', { name: 'Shares' })).toBeChecked();
  });

  it('arrow keys move between the modes, wrap around and take focus along', async () => {
    setLang('en');
    render(<Controlled />);
    screen.getByRole('radio', { name: 'Equally' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Exact amounts' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Exact amounts' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Percent' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Equally' })).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Adjust' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Adjust' })).toHaveFocus();
  });
});
