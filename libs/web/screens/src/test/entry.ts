import { screen, within } from '@testing-library/react';
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

/**
 * Expands the details fold to reveal wallet, date, note, and extra details rows.
 * Vay/Nợ shows payer, date and wallet in an always-open card (#140), so there is nothing to open.
 */
export async function openDetails(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  if (screen.queryByTestId('shared-details-card')) return;
  const toggle = await screen.findByTestId('entry-fold-details');
  await user.click(toggle);
}

/**
 * Picks people the way the entry page now does it, like a group expense: open the "Chia cho" line under
 * "Chia với ai?" / "Với ai?", add each name in the people sheet, then close it.
 */
export async function pickPeople(
  user: ReturnType<typeof userEvent.setup>,
  names: readonly string[],
): Promise<void> {
  const section = await screen.findByTestId('entry-people');
  await user.click(within(section).getAllByRole('button')[0]!);
  for (const name of names) {
    await user.click(await screen.findByRole('button', { name: new RegExp(`^(Thêm|Add) ${name}$`) }));
  }
  await user.click(screen.getByRole('button', { name: /^(Xong|Done)$/ }));
}
