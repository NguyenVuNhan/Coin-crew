import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setLang } from '@cc/web-i18n';
import { tripView } from '../../test/fixtures';
import { linkTokens } from '@cc/web-util/linkTokens';
import {
  clip,
  groupToken,
  thumbnailFor,
  inviteCard,
  remindCard,
  sportBillCard,
  requestCard,
} from '../shareCards';

describe('shareCards', () => {
  const origin = 'https://api.test';

  beforeEach(() => {
    localStorage.clear();
    setLang('en');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clips strings exceeding max length with an ellipsis', () => {
    expect(clip('hello', 10)).toBe('hello');
    expect(clip('1234567890', 10)).toBe('1234567890');
    expect(clip('12345678901', 10)).toBe('123456789…');
    expect(clip('12345678901', 10).length).toBe(10);
  });

  it('resolves groupToken from view.links, falling back to linkTokens or empty string', () => {
    const withLinks = tripView({ links: { group: 'gtok-1', view: 'vtok-1' } });
    expect(groupToken(withLinks)).toBe('gtok-1');

    const withoutLinks = tripView({ links: null });
    expect(groupToken(withoutLinks)).toBe('');

    linkTokens.set(withoutLinks.trip.id, 'lt-9');
    expect(groupToken(withoutLinks)).toBe('lt-9');
  });

  it('resolves thumbnailFor based on trip preset', () => {
    const defaultView = tripView();
    expect(thumbnailFor(defaultView, origin)).toBe('https://api.test/og/trip.png');

    const sportView = tripView({
      trip: { ...defaultView.trip, preset: 'sport' },
    });
    expect(thumbnailFor(sportView, origin)).toBe('https://api.test/og/sport.png');
  });

  it("builds inviteCard with path 'j/gtok-1', url 'https://api.test/j/gtok-1', thumbnail 'https://api.test/og/trip.png' (sport preset -> sport.png)", () => {
    const view = tripView({ links: { group: 'gtok-1', view: 'vtok-1' } });
    const card = inviteCard(view, origin);

    expect(card.path).toBe('j/gtok-1');
    expect(card.url).toBe('https://api.test/j/gtok-1');
    expect(card.thumbnailUrl).toBe('https://api.test/og/trip.png');
    expect(card.title).toBe(`Join ${view.trip.name} on CoinCrew`);
    expect(card.description).toBe('Split group costs and pay each other with VietQR.');
    expect(card.text).toBe(`Join "${view.trip.name}" to split costs:`);

    const sportView = tripView({
      trip: { ...view.trip, preset: 'sport' },
      links: { group: 'gtok-1', view: 'vtok-1' },
    });
    const sportCard = inviteCard(sportView, origin);
    expect(sportCard.thumbnailUrl).toBe('https://api.test/og/sport.png');
  });

  it('remindCard keeps the given text as text and description', () => {
    const view = tripView({ links: { group: 'gtok-1', view: 'vtok-1' } });
    const text = 'Chi owes Minh 1.245.000₫. Open link to pay.';
    const card = remindCard(view, text, origin);

    expect(card.path).toBe('j/gtok-1');
    expect(card.url).toBe('https://api.test/j/gtok-1');
    expect(card.text).toBe(text);
    expect(card.description).toBe(text);
    expect(card.title).toBe(`Payment reminder · ${view.trip.name}`);
    expect(card.thumbnailUrl).toBe('https://api.test/og/trip.png');
  });

  it("sportBillCard sets path to 'j/gtok-1/expenses/e-1'", () => {
    const view = tripView({ links: { group: 'gtok-1', view: 'vtok-1' } });
    const text = 'Court 200.000₫, each pays 50.000₫';
    const card = sportBillCard(view, 'e-1', text, origin);

    expect(card.path).toBe('j/gtok-1/expenses/e-1');
    expect(card.url).toBe('https://api.test/j/gtok-1/expenses/e-1');
    expect(card.text).toBe(text);
    expect(card.description).toBe(text);
    expect(card.title).toBe(`Bill for ${view.trip.name}`);
    expect(card.thumbnailUrl).toBe('https://api.test/og/sport.png');
  });

  it("requestCard('https://api.test/r/abc?x=1', 'T') sets path to 'r/abc?x=1'", () => {
    const url = 'https://api.test/r/abc?x=1';
    const card = requestCard(url, 'T');

    expect(card.path).toBe('r/abc?x=1');
    expect(card.url).toBe(url);
    expect(card.text).toBe(url);
    expect(card.title).toBe('T');
    expect(card.description).toBe('Open to see what you owe and pay with VietQR.');
    expect(card.thumbnailUrl).toBe('https://api.test/og/trip.png');
  });

  it("a 150-char group name gives a 100-char title ending in '…'", () => {
    const longName = 'A'.repeat(150);
    const base = tripView();
    const view = tripView({
      trip: { ...base.trip, name: longName },
      links: { group: 'gtok-1', view: 'vtok-1' },
    });

    const card = inviteCard(view, origin);
    expect(card.title.length).toBe(100);
    expect(card.title.endsWith('…')).toBe(true);

    const remind = remindCard(view, 'reminder text', origin);
    expect(remind.title.length).toBe(100);
    expect(remind.title.endsWith('…')).toBe(true);

    const sport = sportBillCard(view, 'e-1', 'sport text', origin);
    expect(sport.title.length).toBe(100);
    expect(sport.title.endsWith('…')).toBe(true);
  });

  it("without view.links, groupToken falls back to linkTokens (linkTokens.set(tripId, 'lt-9') -> path 'j/lt-9')", () => {
    const view = tripView({ links: null });
    linkTokens.set(view.trip.id, 'lt-9');

    const card = inviteCard(view, origin);
    expect(card.path).toBe('j/lt-9');
    expect(card.url).toBe('https://api.test/j/lt-9');
  });

  it('encodes token and expenseId with encodeURIComponent in path and url', () => {
    const view = tripView({ links: { group: 'special/token?a=1', view: 'vtok-1' } });
    const card = sportBillCard(view, 'expense/1?foo=bar', 'sport text', origin);

    expect(card.path).toBe('j/special%2Ftoken%3Fa%3D1/expenses/expense%2F1%3Ffoo%3Dbar');
    expect(card.url).toBe(
      'https://api.test/j/special%2Ftoken%3Fa%3D1/expenses/expense%2F1%3Ffoo%3Dbar',
    );
  });
});
