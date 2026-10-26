import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Approval, PersonView, TripView } from '@fsl/core';
import { computeBalances, findBank, findSimilarNames, maskAccountNumber } from '@fsl/core';
import type { Db } from '../db/client';
import type { ResolvedActor } from '../access/actor';
import type { TripSnapshot } from './snapshot';
import { toLedger } from './snapshot';
import {
  bankDetails,
  membershipRequests,
  participants,
  users,
} from '../db/schema';

export async function toTripView(
  db: Db,
  snapshot: TripSnapshot,
  actor: ResolvedActor,
): Promise<TripView> {
  const isAdmin = Boolean(actor.isAdmin) || actor.isOrganiser;
  const me: TripView['me'] = {
    kind: actor.kind,
    participantId: actor.participantId,
    participantPending: actor.participantPending,
    isOrganiser: actor.isOrganiser,
    isAdmin,
  };

  let myBalance: TripView['myBalance'] = null;
  if (
    actor.participantId !== null &&
    Object.prototype.hasOwnProperty.call(snapshot.balances, actor.participantId)
  ) {
    const pid = actor.participantId;
    const ledger = toLedger(snapshot);
    const now = snapshot.balances[pid] ?? 0;
    const beforePayments =
      computeBalances(ledger.order, ledger.expenses, ledger.payments, {
        ignorePayments: true,
      })[pid] ?? 0;
    const hasPendingExpense = ledger.expenses.some(
      (e) => e.status === 'pending' && e.createdById === pid,
    );
    const ifPendingApproved =
      actor.kind === 'guest' && hasPendingExpense
        ? (computeBalances(ledger.order, ledger.expenses, ledger.payments, {
            includePendingCreatedBy: pid,
          })[pid] ?? 0)
        : null;
    const waitingConfirm = snapshot.payments
      .filter((p) => p.status === 'says_paid' && p.fromId === pid)
      .reduce((sum, p) => sum + p.amountClaimed, 0);

    myBalance = {
      now,
      beforePayments,
      ifPendingApproved,
      waitingConfirm,
    };
  }

  let approvals: Approval[] = [];
  if (actor.kind === 'member') {
    const isGroupAdmin = isAdmin;

    const pendingExpenses = snapshot.expenses.filter((e) => {
      if (e.status !== 'pending') return false;
      if (isGroupAdmin) return true;
      if (actor.participantId === null) return false;
      return (
        e.payerId === actor.participantId ||
        e.shares.some((s) => s.participantId === actor.participantId)
      );
    });

    const expenseApprovals: Approval[] = pendingExpenses.map((e) => ({
      kind: 'expense',
      expenseId: e.id,
    }));

    const paymentApprovals: Approval[] = snapshot.payments
      .filter((p) => p.status === 'says_paid' && p.toId === actor.participantId)
      .map((p) => ({
        kind: 'payment',
        paymentId: p.id,
      }));

    const notArrivedApprovals: Approval[] = snapshot.payments
      .filter((p) => {
        if (p.status !== 'confirmed' || !p.notArrived) return false;
        if (isGroupAdmin) return true;
        return p.toId === actor.participantId;
      })
      .map((p) => ({
        kind: 'not_arrived',
        paymentId: p.id,
      }));

    let nameApprovals: Approval[] = [];
    let bankApprovals: Approval[] = [];
    let membershipApprovals: Approval[] = [];

    if (isGroupAdmin) {
      const activePeople = snapshot.people
        .filter((p) => p.status === 'active')
        .map((p) => ({ id: p.id, name: p.name }));
      nameApprovals = snapshot.people
        .filter((p) => p.status === 'pending')
        .map((p) => ({
          kind: 'name',
          participantId: p.id,
          matches: findSimilarNames(p.name, activePeople),
        }));

      const pendingBankRows = await db
        .select({
          id: bankDetails.id,
          participantId: bankDetails.participantId,
          bin: bankDetails.bin,
          accountNumber: bankDetails.accountNumber,
          holderName: bankDetails.holderName,
        })
        .from(bankDetails)
        .innerJoin(participants, eq(bankDetails.participantId, participants.id))
        .where(
          and(
            eq(participants.tripId, actor.trip.id),
            eq(bankDetails.status, 'pending'),
          ),
        );
      bankApprovals = pendingBankRows.map((b) => ({
        kind: 'bank',
        bankId: b.id,
        participantId: b.participantId!,
        bankName: findBank(b.bin)?.shortName ?? b.bin,
        accountNumber: b.accountNumber,
        holderName: b.holderName,
      }));

      const pendingMembershipRows = await db
        .select({
          id: membershipRequests.id,
          participantId: membershipRequests.participantId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(membershipRequests)
        .innerJoin(users, eq(membershipRequests.userId, users.id))
        .where(
          and(
            eq(membershipRequests.tripId, actor.trip.id),
            eq(membershipRequests.status, 'pending'),
          ),
        );
      membershipApprovals = pendingMembershipRows.map((r) => ({
        kind: 'membership',
        requestId: r.id,
        participantId: r.participantId,
        userName: r.userName,
        userEmail: r.userEmail,
      }));
    }

    approvals = [
      ...expenseApprovals,
      ...nameApprovals,
      ...bankApprovals,
      ...paymentApprovals,
      ...notArrivedApprovals,
      ...membershipApprovals,
    ];
  }

  const people = await withGuestBankAccounts(db, snapshot, actor);

  const links: TripView['links'] =
    actor.kind === 'member'
      ? { group: actor.trip.groupToken, view: actor.trip.viewToken }
      : null;

  return {
    trip: snapshot.trip,
    me,
    people,
    balances: snapshot.balances,
    suggestions: snapshot.suggestions,
    expenses: snapshot.expenses,
    payments: snapshot.payments,
    fund: snapshot.fund,
    myBalance,
    approvals,
    links,
  };
}

/**
 * Adds each guest's masked bank account for the people allowed to see it: members see every guest's,
 * a guest sees only their own. The cached snapshot stays the same for everyone.
 */
async function withGuestBankAccounts(
  db: Db,
  snapshot: TripSnapshot,
  actor: ResolvedActor,
): Promise<PersonView[]> {
  const onlyMine = actor.kind === 'guest' && actor.participantId !== null;
  if (actor.kind !== 'member' && !onlyMine) {
    return snapshot.people;
  }

  const rows = await db
    .select({
      participantId: bankDetails.participantId,
      bin: bankDetails.bin,
      accountNumber: bankDetails.accountNumber,
      holderName: bankDetails.holderName,
      status: bankDetails.status,
    })
    .from(bankDetails)
    .innerJoin(participants, eq(bankDetails.participantId, participants.id))
    .where(
      and(
        eq(participants.tripId, actor.trip.id),
        isNull(participants.userId),
        inArray(bankDetails.status, ['approved', 'pending']),
        onlyMine ? eq(participants.id, actor.participantId!) : undefined,
      ),
    );

  const accounts = new Map<string, NonNullable<PersonView['bankAccount']>>();
  for (const row of rows) {
    if (!row.participantId || (accounts.has(row.participantId) && row.status !== 'approved')) continue;
    accounts.set(row.participantId, {
      bankName: findBank(row.bin)?.shortName ?? row.bin,
      accountNumberMasked: maskAccountNumber(row.accountNumber),
      holderName: row.holderName,
    });
  }

  return snapshot.people.map((p) => {
    const bankAccount = accounts.get(p.id);
    return bankAccount ? { ...p, bankAccount } : p;
  });
}
