import { describe, expect, it } from 'vitest';
import { setLang, t } from '@cc/web-i18n';
import { errorText, ownError } from '../InlineError';

/** The shape `ApiClientError` has: the whole error body sits in `details`. */
function serverError(code: string, message: string, body: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { code, status: 422, details: { code, message, ...body } });
}

describe('errorText for validation errors', () => {
  it('a known reason gets its own words, never the server sentence', () => {
    const err = serverError('VALIDATION', 'Description must be 1 to 80 characters', { reason: 'descriptionLength' });
    expect(errorText(err, t)).toBe('Enter a description of up to 80 characters.');
    setLang('vi', false);
    expect(errorText(err, t)).toBe('Hãy nhập nội dung, tối đa 80 ký tự.');
  });

  it('no reason, or one we do not know, gets the generic validation line', () => {
    const generic = "Something here isn't right. Check it and try again.";
    expect(errorText(serverError('VALIDATION', 'Sport shares mismatch with expense shares'), t)).toBe(generic);
    expect(errorText(serverError('VALIDATION', 'Invalid request', { reason: 'fromTheFuture' }), t)).toBe(generic);
    expect(errorText({ code: 'VALIDATION', message: 'Invalid request' }, t)).toBe(generic);
  });

  it('a screen-made ownError keeps its own words', () => {
    expect(errorText(ownError('Choose at least one person.'), t)).toBe('Choose at least one person.');
  });

  it('other codes keep their copy', () => {
    expect(errorText(serverError('FUND_SHORT', 'Not enough'), t)).toBe(t('error.fundShort'));
    expect(errorText(serverError('INTERNAL', 'boom'), t)).toBe(t('error.generic'));
  });
});
