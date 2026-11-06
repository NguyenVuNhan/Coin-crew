import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RoundTransfersSwitch } from '../RoundTransfersSwitch';
import { tripView } from '../../test/fixtures';

const mockRun = vi.fn();
vi.mock('../../lib/useTripAction', () => ({
  useTripAction: () => ({
    busy: false,
    error: null,
    run: mockRun,
  }),
}));

describe('RoundTransfersSwitch', () => {
  it('renders unchecked when roundTransfers is false and triggers PATCH on click', async () => {
    mockRun.mockClear();
    const view = { ...tripView(), trip: { ...tripView().trip, roundTransfers: false } };
    render(<RoundTransfersSwitch view={view} />);
    const toggle = screen.getByRole('switch', { name: /Round transfer amounts/i });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(mockRun).toHaveBeenCalledWith('', { roundTransfers: true }, 'PATCH');
  });

  it('renders checked when roundTransfers is true and toggles to false on click', async () => {
    mockRun.mockClear();
    const view = { ...tripView(), trip: { ...tripView().trip, roundTransfers: true } };
    render(<RoundTransfersSwitch view={view} />);
    const toggle = screen.getByRole('switch', { name: /Round transfer amounts/i });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    expect(mockRun).toHaveBeenCalledWith('', { roundTransfers: false }, 'PATCH');
  });
});
