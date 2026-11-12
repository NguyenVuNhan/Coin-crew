/**
 * Why a VALIDATION error happened, for the mistakes a person can make with ordinary input. The API sends it as
 * `error.reason` next to its English `message` (log text only); the web client shows its own words for it. A
 * VALIDATION error without a reason is one only a broken or out-of-date client can cause, and gets a generic line.
 */
export const VALIDATION_REASONS = [
  'signInExpired',
  'nameLength',
  'groupNameLength',
  'descriptionLength',
  'reasonLength',
  'amountInvalid',
  'rateSelf',
  'pickDifferentPeople',
  'mergeSelf',
  'bothSignedIn',
  'payToSelf',
  'pendingFromFund',
  'tooManyGroups',
  'bankAccountNumber',
  'bankHolderName',
  'genderRequired',
  'mapUrl',
  'imageTooLarge',
] as const;

export type ValidationReason = (typeof VALIDATION_REASONS)[number];

export function isValidationReason(value: unknown): value is ValidationReason {
  return typeof value === 'string' && (VALIDATION_REASONS as readonly string[]).includes(value);
}
