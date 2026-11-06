import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_IDS } from '@cc/core';
import { ThemePicker } from '../ThemePicker';

describe('ThemePicker', () => {
  it('five themes, in order', () => {
    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value="jade"
        onChange={() => {}}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('data-theme-option'))).toEqual([...THEME_IDS]);
    expect(radios.map((r) => r.textContent)).toEqual(['Jade', 'Pink', 'Orchid', 'Sky', 'Indigo']);
  });

  it('the none option comes first when given', () => {
    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Group colours"
        explain="Everyone sees these colours inside this group."
        value={null}
        noneLabel="Each person's own theme"
        onChange={() => {}}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Group colours' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('data-theme-option'))).toEqual([
      'none',
      ...THEME_IDS,
    ]);
    expect(radios[0]).toHaveAccessibleName("Each person's own theme");
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('each preview carries its own data-theme', () => {
    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value="jade"
        onChange={() => {}}
      />,
    );

    for (const id of THEME_IDS) {
      const option = document.querySelector(`[data-theme-option="${id}"]`);
      expect(option).not.toBeNull();
      const preview = option?.querySelector(`[data-theme="${id}"]`);
      expect(preview).not.toBeNull();
      expect(preview).toHaveAttribute('aria-hidden', 'true');
      expect(preview).toHaveClass('bg-background');
    }
  });

  it('the chosen one is checked', () => {
    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value="orchid"
        onChange={() => {}}
      />,
    );

    const orchid = screen.getByRole('radio', { name: 'Orchid' });
    expect(orchid).toHaveAttribute('aria-checked', 'true');
    expect(orchid).toHaveClass('ring-2', 'ring-primary');

    expect(screen.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Sky' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Indigo' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a tap calls onChange at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value="jade"
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Sky' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('sky');
  });
});
