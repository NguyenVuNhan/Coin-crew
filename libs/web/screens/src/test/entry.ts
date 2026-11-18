import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/** Enters `digits` on the amount keypad and clicks `key-done` to fold the amount. */
export async function finishAmount(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
): Promise<void> {
  await screen.findByTestId('amount-keypad');
  for (const ch of digits) {
    const testId = ch === ',' ? 'key-comma' : `key-${ch}`;
    await user.click(screen.getByTestId(testId));
  }
  await user.click(screen.getByTestId('key-done'));
}

/** Expands the details fold to reveal wallet, date, note, and extra details rows. */
export async function openDetails(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const toggle = await screen.findByTestId('entry-fold-details');
  await user.click(toggle);
}
