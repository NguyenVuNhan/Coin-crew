import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemePicker } from '../ThemePicker';

describe('ThemePicker keyboard and busy behaviour', () => {
  it('only the checked swatch is in the tab order', () => {
    const { unmount } = render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value="orchid"
        onChange={() => {}}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1, -1]);

    unmount();

    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Theme"
        explain="Your colours everywhere outside a group."
        value={null}
        onChange={() => {}}
      />,
    );

    const fallbackGroup = screen.getByRole('radiogroup', { name: 'Theme' });
    const fallbackRadios = within(fallbackGroup).getAllByRole('radio');
    expect(fallbackRadios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('arrow keys move focus between swatches without choosing', async () => {
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

    const jade = screen.getByRole('radio', { name: 'Jade' });
    const pink = screen.getByRole('radio', { name: 'Pink' });
    const orchid = screen.getByRole('radio', { name: 'Orchid' });
    const sky = screen.getByRole('radio', { name: 'Sky' });
    const indigo = screen.getByRole('radio', { name: 'Indigo' });

    jade.focus();
    expect(jade).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(pink).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    expect(orchid).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{End}');
    expect(indigo).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(jade).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowLeft}');
    expect(indigo).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowUp}');
    expect(sky).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{Home}');
    expect(jade).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('pink');
  });

  it('while saving, taps are ignored and nothing dims', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ThemePicker
        open
        onClose={() => {}}
        title="Group colours"
        explain="Everyone sees these colours inside this group."
        value={null}
        noneLabel="Each person's own theme"
        busy
        onChange={onChange}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Group colours' });
    const radios = within(group).getAllByRole('radio');

    for (const radio of radios) {
      expect(radio).not.toHaveAttribute('disabled');
      expect(radio).toHaveAttribute('aria-disabled', 'true');
      expect(radio.className).not.toContain('opacity-50');
    }

    await user.click(screen.getByRole('radio', { name: 'Sky' }));
    await user.click(screen.getByRole('radio', { name: "Each person's own theme" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
