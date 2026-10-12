// English copy. Strings marked SPEC are fixed by the design spec — do not reword them.
// Every key here must also exist in vi.ts. Later screens add their own keys to both files.
export const en = {
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.loading': 'Loading…',

  'error.generic': 'Something went wrong. Try again.',
  'error.dailyLimit': "We're over today's free limit. Try again after 07:00.", // SPEC
  'error.linkDead': 'This link no longer works. Ask the organiser for a new one.', // SPEC

  'lang.vi': 'Tiếng Việt',
  'lang.en': 'English',

  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} h ago',
  'time.daysAgo': '{n} d ago',

  'fewest.title': 'Fewest transfers', // SPEC
  'fewest.explain': "We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same.", // SPEC

  'who.lastUsedHere': 'You picked this on this phone last time', // SPEC
  'who.activeElsewhere': 'Active on another phone · {ago}', // SPEC
  'who.someoneNew': "I'm someone new", // SPEC
  'who.areYou': 'Are you {name}?', // SPEC
  'who.yesIm': "Yes, I'm {name}", // SPEC
  'who.noAddMe': 'No, add me', // SPEC

  'expenses.empty': 'No expenses yet. Add the first one.', // SPEC
  'expenses.disabledBy': 'Disabled by {name}', // SPEC
  'expense.sendForApproval': 'Send for approval', // SPEC

  'approvals.saysPaid': "{name} says it's paid. Did it arrive?", // SPEC

  'pay.payWithVietQr': 'Pay with VietQR', // SPEC
  'pay.keepNote': 'Keep this note unchanged so the payment can be matched.', // SPEC
  'pay.bankPending': "{name}'s bank details are waiting for approval", // SPEC
  'pay.bankNone': "{name} hasn't added bank details yet", // SPEC
  'pay.waiting': 'Waiting for the money to reach {name}. This page updates by itself.', // SPEC
  'pay.alreadyPaid': "I've already paid", // SPEC
  'pay.openBankApp': 'Open my bank app', // SPEC
  'pay.saveQr': 'Save QR', // SPEC

  'landing.tagline': 'Split trip costs with friends and settle up with VietQR. Friends join with a link — no account needed.',
  'landing.signIn': 'Sign in with Google',

  'trips.title': 'My trips',
  'trips.new': 'New trip',
  'trips.empty': 'No trips yet. Create your first trip.',
  'trips.youreOwed': "You're owed",
  'trips.youOwe': 'You owe',
  'trips.settled': 'All settled',
  'trips.archived': 'Archived',

  'create.title': 'New trip',
  'create.tripName': 'Trip name',
  'create.tripNamePlaceholder': 'Đà Lạt · Oct 2026',
  'create.myName': 'Your name',
  'create.others': 'Who else is coming?',
  'create.otherPlaceholder': 'Name',
  'create.addPerson': 'Add person',
  'create.removePerson': 'Remove {name}',
  'create.bankTitle': 'Your bank details (optional)',
  'create.bankHint': 'So friends can pay you back with VietQR. You can add them later.',
  'create.submit': 'Create trip',

  'bank.bank': 'Bank',
  'bank.popular': 'Popular',
  'bank.allBanks': 'All banks',
  'bank.choose': 'Choose your bank',
  'bank.accountNumber': 'Account number',
  'bank.holderName': 'Account holder name',
  'bank.holderHint': 'As your bank shows it, without accents.',

  'consent.title': 'Before you start',
  'consent.body': 'We store your name, email, the trips you join and any bank details you add, so your group can split costs and pay each other.',
  'consent.agree': 'I agree to the privacy notice',
  'consent.readNotice': 'Read the privacy notice',

  'privacy.title': 'Privacy notice',
  'privacy.draft': 'Draft — pending legal review',
} as const;

export type MessageKey = keyof typeof en;
