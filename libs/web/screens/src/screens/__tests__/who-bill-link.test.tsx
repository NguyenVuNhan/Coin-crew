import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { picker } from '../../test/fixtures';
import { TripBaseProvider } from '../../lib/tripBase';
import { WhoAreYou } from '../WhoAreYou';

afterEach(() => {
  vi.unstubAllGlobals();
});

const nextUrl = '/j/gtok-1/expenses/e-1/pay';

const billRoute = {
  route: `/j/gtok-1/who?expense=e-1&next=${encodeURIComponent(nextUrl)}`,
  path: '/j/:token/who',
};

const groupRoute = {
  route: '/j/gtok-1/who',
  path: '/j/:token/who',
};

function renderWho(route = billRoute) {
  return renderAt(
    <TripBaseProvider tripId="t-1" token="gtok-1">
      <WhoAreYou />
    </TripBaseProvider>,
    route,
  );
}

describe('WhoAreYou bill link and guest behavior', () => {
  it('bill link: no guest box, just the list', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker({ account: null, myPick: null }),
    });

    renderWho(billRoute);

    expect(await screen.findByRole('radiogroup')).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/Joining as a guest/i)).toBeNull();
  });

  it('group link: the guest explanation is one quiet line under the list', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker({ account: null, myPick: null }),
    });

    renderWho(groupRoute);

    const radioGroup = await screen.findByRole('radiogroup');
    const guestLine = screen.getByText("Joining as a guest: what you add waits for a member's approval.");
    expect(guestLine).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
    expect(radioGroup.compareDocumentPosition(guestLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: /Google/i })).toBeInTheDocument();
  });

  it('bill link: a signed-in newcomer can join', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': picker({
        myPick: null,
        account: { name: 'Hoa', needsGender: false },
        myLeftName: null,
      }),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': { participantId: 'p-hoa', rejoined: false },
    });

    renderWho(billRoute);

    const joinBtn = await screen.findByRole('button', { name: 'Not on the list? Join as Hoa' });
    expect(joinBtn).toBeInTheDocument();

    await userEvent.click(joinBtn);

    const confirmBtn = screen.queryByRole('button', { name: 'Join as Hoa' });
    if (confirmBtn) {
      await userEvent.click(confirmBtn);
    }

    await waitFor(() => {
      expect(calls.some((c) => c.path === '/api/trips/t-1/join')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1/expenses/e-1/pay');
    });
  });

  it('bill link, sport group: joining asks the gender first', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': picker({
        myPick: null,
        account: { name: 'Hoa', needsGender: true },
        myLeftName: null,
      }),
      'POST /api/trips/t-1/people/check-name': { matches: [] },
      'POST /api/trips/t-1/join': { participantId: 'p-hoa', rejoined: false },
    });

    renderWho(billRoute);

    const joinBtn = await screen.findByRole('button', { name: 'Not on the list? Join as Hoa' });
    await userEvent.click(joinBtn);

    expect(document.querySelector('.fsl-who__join-gender')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/trips/t-1/join')).toBe(false);
  });
});
