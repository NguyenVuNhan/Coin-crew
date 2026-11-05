import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Gender, PersonView, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, guestChiView, PIDS } from '../../test/fixtures';
import { People } from '../People';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

afterEach(() => {
  act(() => hideUndo());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const renderPeople = () =>
  renderAt(
    <>
      <People />
      <UndoSnackbarHost />
    </>,
    at,
  );

type Call = { method: string; path: string; body?: unknown };
const addCalls = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people');
const deleteCalls = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE').map((c) => c.path);

const sport = (view: TripView): TripView => ({ ...view, trip: { ...view.trip, preset: 'sport' } });

/** The trip API: each POST adds a person with the next id (p-new-1, p-new-2, …), which the next GET returns. */
function group(base: TripView, opts: { failAdd?: boolean; delayMs?: number } = {}) {
  let people: PersonView[] = [...base.people];
  let n = 0;
  return {
    'GET /api/trips/t-1': () => Response.json({ ...base, people }),
    'POST /api/trips/t-1/people': async (init: RequestInit | undefined) => {
      if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      if (opts.failAdd) {
        return Response.json({ error: { code: 'VALIDATION', message: 'Invalid request' } }, { status: 422 });
      }
      const body = JSON.parse(String(init?.body)) as { name: string; gender?: Gender };
      const id = `p-new-${++n}`;
      const person: PersonView = { id, name: body.name, status: 'active', isMember: false, bank: 'none', gender: body.gender ?? null };
      people = [...people, person];
      return Response.json({ participantId: id }, { status: 201 });
    },
    'DELETE /api/trips/t-1/people/p-new-1': null,
    'DELETE /api/trips/t-1/people/p-new-2': null,
    'DELETE /api/trips/t-1/people/p-new-3': null,
  };
}

/** A sport group where every player has a gender. */
function sportWithGenders(base: TripView): TripView {
  const genders: Record<string, Gender> = { [PIDS.M]: 'M', [PIDS.A]: 'M', [PIDS.B]: 'F', [PIDS.C]: 'F' };
  const view = sport(base);
  return { ...view, people: view.people.map((p) => ({ ...p, gender: genders[p.id] ?? null })) };
}

const row = (id: string) => document.querySelector(`[data-person-id="${id}"]`) as HTMLElement;

describe('People: the docked add bar', () => {
  it("admins get the add bar; members and guests don't", async () => {
    const admin = tripView({
      me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    });
    mockApi(group(admin));
    const first = renderPeople();
    expect(await screen.findByLabelText('Name to add')).toBeInTheDocument();
    first.unmount();

    const member = tripView({
      me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false },
    });
    mockApi(group(member));
    const second = renderPeople();
    await screen.findByText('Bình');
    expect(screen.queryByLabelText('Name to add')).not.toBeInTheDocument();
    second.unmount();

    mockApi(group(guestChiView()));
    renderPeople();
    await screen.findByText('Bình');
    expect(screen.queryByLabelText('Name to add')).not.toBeInTheDocument();
  });

  it('sport group shows + Male and + Female; trip group shows + Add', async () => {
    mockApi(group(sport(tripView())));
    const first = renderPeople();
    expect(await screen.findByRole('button', { name: '+ Male' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Female' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
    first.unmount();

    mockApi(group(tripView()));
    renderPeople();
    expect(await screen.findByRole('button', { name: '+ Add' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Male' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Female' })).not.toBeInTheDocument();
  });

  it('adds names typed back-to-back in order without disabling the field', async () => {
    const { calls } = mockApi(group(sport(tripView()), { delayMs: 30 }));
    renderPeople();
    const field = await screen.findByLabelText('Name to add');
    await userEvent.type(field, 'An{Enter}');
    expect(field).not.toBeDisabled();
    await userEvent.type(field, 'Bình{Enter}');
    expect(field).not.toBeDisabled();
    await waitFor(() =>
      expect(addCalls(calls).map((c) => c.body)).toEqual([
        { name: 'An', gender: 'M' },
        { name: 'Bình', gender: 'M' },
      ]),
    );
    expect(field).not.toBeDisabled();
  });

  it('a failed add puts the name back and says why', async () => {
    mockApi(group(tripView(), { failAdd: true }));
    renderPeople();
    const field = await screen.findByLabelText('Name to add');
    await userEvent.type(field, 'An{Enter}');
    await waitFor(() => expect(field).toHaveValue('An'));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add An.");
  });

  it('Undo removes only the latest add, and all of a pasted list', async () => {
    const { calls } = mockApi(group(tripView()));
    renderPeople();
    const field = await screen.findByLabelText('Name to add');
    await userEvent.type(field, 'An{Enter}');
    await screen.findByText('Added An');
    await userEvent.click(field);
    await userEvent.paste('Bảo\nCúc');
    await screen.findByText('Added 2 people');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(deleteCalls(calls)).toEqual(['/api/trips/t-1/people/p-new-2', '/api/trips/t-1/people/p-new-3']),
    );
  });

  it('the snackbar names the person and gender', async () => {
    mockApi(group(sport(tripView())));
    renderPeople();
    const field = await screen.findByLabelText('Name to add');
    await userEvent.type(field, 'Lan');
    await userEvent.click(screen.getByRole('button', { name: '+ Female' }));
    expect(await screen.findByText('Added Lan · Female')).toBeInTheDocument();
  });

  it('members change only their own gender; guests change none', async () => {
    const memberAn = sportWithGenders(
      tripView({ me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false } }),
    );
    mockApi(group(memberAn));
    const first = renderPeople();
    expect(await screen.findByRole('button', { name: 'Gender for An: Male' })).toBeInTheDocument();
    const binh = row(PIDS.B);
    expect(within(binh).getByText('Female')).toBeInTheDocument();
    expect(within(binh).queryByRole('button', { name: /^Gender for / })).not.toBeInTheDocument();
    first.unmount();

    mockApi(group(sportWithGenders(guestChiView())));
    renderPeople();
    await screen.findByText('Bình');
    expect(screen.queryAllByRole('button', { name: /^Gender for / })).toHaveLength(0);
  });

  it('scrolls the new row into view', async () => {
    const scrolled: (string | null)[] = [];
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(function (this: Element) {
        scrolled.push(this.getAttribute('data-person-id'));
      });
    mockApi(group(tripView()));
    renderPeople();
    const field = await screen.findByLabelText('Name to add');
    await userEvent.type(field, 'Lan{Enter}');
    await waitFor(() => expect(scrolled).toContain('p-new-1'));
    expect(row('p-new-1')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('a failed gender change shows why and offers no Undo', async () => {
    mockApi({
      ...group(sportWithGenders(tripView())),
      [`PATCH /api/trips/t-1/people/${PIDS.C}`]: () =>
        Response.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 }),
    });
    renderPeople();
    await userEvent.click(await screen.findByRole('button', { name: 'Gender for Chi: Female' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
