import { and, eq } from 'drizzle-orm';
import type { ExpenseView } from '@fsl/core';
import { buildVietQrPayload, equalBillShare, isFundPaid, toTransferNote } from '@fsl/core';
import type { Db } from '../db/client';
import { bankDetails, participants } from '../db/schema';
import type { TripSnapshot } from '../trips/snapshot';

/**
 * The VietQR payload of the person who paid a sport bill, for the link preview. It asks for the amount when everyone
 * owes the same, and for no amount when the shares differ. Null when it is not a sport bill, the fund paid it, or the
 * payer has no approved bank details.
 */
export async function billQrPayload(db: Db, snapshot: TripSnapshot, expense: ExpenseView): Promise<string | null> {
  if (!expense.meta?.sport || isFundPaid(expense)) return null;

  const payer = await db
    .select({ id: participants.id, userId: participants.userId })
    .from(participants)
    .where(and(eq(participants.id, expense.payerId), eq(participants.tripId, snapshot.trip.id)))
    .get();
  if (!payer) return null;

  const bank = await db
    .select({ bin: bankDetails.bin, accountNumber: bankDetails.accountNumber })
    .from(bankDetails)
    .where(
      and(
        payer.userId !== null ? eq(bankDetails.userId, payer.userId) : eq(bankDetails.participantId, payer.id),
        eq(bankDetails.status, 'approved'),
      ),
    )
    .get();
  if (!bank) return null;

  return buildVietQrPayload({
    bin: bank.bin,
    accountNumber: bank.accountNumber,
    amount: equalBillShare(expense) ?? 0,
    note: toTransferNote(snapshot.trip.name, 25),
  });
}
