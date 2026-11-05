import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { GenderPill } from '../GenderPill';

describe('GenderPill', () => {
  it('flips Male to Female in one tap', async () => {
    const onChange = vi.fn();
    renderAt(<GenderPill name="Chi" value="M" editable onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Gender for Chi: Male' });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith('F');
  });

  it('Set gender opens the two choices', async () => {
    const onChange = vi.fn();
    renderAt(<GenderPill name="Chi" value={null} editable onChange={onChange} />);
    const setButton = screen.getByRole('button', { name: 'Set gender for Chi' });
    await userEvent.click(setButton);
    const femaleOption = screen.getByRole('button', { name: 'Female' });
    await userEvent.click(femaleOption);
    expect(onChange).toHaveBeenCalledWith('F');
  });

  it("shows plain text to people who can't change it", () => {
    renderAt(<GenderPill name="Chi" value="M" editable={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Male')).toBeInTheDocument();
  });

  it('shows nothing for an unknown gender when not editable', () => {
    const { container } = renderAt(<GenderPill name="Chi" value={null} editable={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.fsl-gender-pill')).toBeNull();
  });

  it('never uses a money colour', () => {
    const { rerender, container } = renderAt(<GenderPill name="Chi" value="M" editable />);
    const pillM = screen.getByRole('button', { name: 'Gender for Chi: Male' });
    expect(pillM.className).toContain('bg-muted');
    expect(pillM.className).not.toMatch(/success|danger|warning/);

    rerender(<GenderPill name="Chi" value="F" editable />);
    const pillF = screen.getByRole('button', { name: 'Gender for Chi: Female' });
    expect(pillF.className).toContain('bg-muted');
    expect(pillF.className).not.toMatch(/success|danger|warning/);

    rerender(<GenderPill name="Chi" value={null} editable />);
    const pillUnset = screen.getByRole('button', { name: 'Set gender for Chi' });
    expect(pillUnset.className).toContain('bg-muted');
    expect(pillUnset.className).not.toMatch(/success|danger|warning/);

    rerender(<GenderPill name="Chi" value="M" editable={false} />);
    const plainText = container.querySelector('.fsl-gender-pill');
    expect(plainText?.className).not.toMatch(/success|danger|warning/);
  });
});
