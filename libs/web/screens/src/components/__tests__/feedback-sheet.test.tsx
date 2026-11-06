import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderAt, mockApi } from '../../test/render';
import { FeedbackSheet } from '../FeedbackSheet';

function stubMatchMedia(matches = false) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width:\s*640px/.test(query) ? matches : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', 'test-1.0.0');
  stubMatchMedia(false);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('FeedbackSheet', () => {
  it('focuses textarea on open', async () => {
    renderAt(<FeedbackSheet open={true} onClose={vi.fn()} signedIn={true} />, {
      route: '/t/abc/expenses',
    });
    await waitFor(() => {
      expect(screen.getByTestId('feedback-message')).toHaveFocus();
    });
  });

  it('send disabled for whitespace', async () => {
    renderAt(<FeedbackSheet open={true} onClose={vi.fn()} signedIn={true} />, {
      route: '/t/abc/expenses',
    });
    const sendButton = screen.getByTestId('feedback-send');
    const messageInput = screen.getByTestId('feedback-message');

    expect(sendButton).toBeDisabled();

    await userEvent.type(messageInput, '   \t\n  ');
    expect(sendButton).toBeDisabled();

    await userEvent.type(messageInput, 'hello');
    expect(sendButton).toBeEnabled();

    await userEvent.clear(messageInput);
    expect(sendButton).toBeDisabled();
  });

  it('chips optional and toggle', async () => {
    renderAt(<FeedbackSheet open={true} onClose={vi.fn()} signedIn={true} />, {
      route: '/t/abc/expenses',
    });
    const bugChip = screen.getByTestId('feedback-type-bug');
    const ideaChip = screen.getByTestId('feedback-type-idea');
    const otherChip = screen.getByTestId('feedback-type-other');

    expect(bugChip).toHaveAttribute('aria-pressed', 'false');
    expect(ideaChip).toHaveAttribute('aria-pressed', 'false');
    expect(otherChip).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(bugChip);
    expect(bugChip).toHaveAttribute('aria-pressed', 'true');
    expect(ideaChip).toHaveAttribute('aria-pressed', 'false');
    expect(otherChip).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(bugChip);
    expect(bugChip).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(ideaChip);
    expect(ideaChip).toHaveAttribute('aria-pressed', 'true');
    expect(bugChip).toHaveAttribute('aria-pressed', 'false');
    expect(otherChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends payload', async () => {
    const { calls } = mockApi({ 'POST /api/feedback': null });
    const onClose = vi.fn();

    renderAt(<FeedbackSheet open={true} onClose={onClose} signedIn={true} />, {
      route: '/t/abc/expenses',
    });

    await userEvent.type(screen.getByTestId('feedback-message'), 'Hello');
    await userEvent.click(screen.getByTestId('feedback-type-idea'));
    await userEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/feedback',
      body: {
        message: 'Hello',
        type: 'idea',
        screen: 'trip-expenses',
        device: 'phone',
        lang: 'en',
        appVersion: expect.any(String),
        contactMe: false,
      },
    });
    expect(calls[0]!.body).not.toHaveProperty('contactText');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Thanks — we read every message.')).toBeInTheDocument();
  });

  it('guest contact field', async () => {
    const { calls } = mockApi({ 'POST /api/feedback': null });

    // Guest: signedIn = false
    const { unmount } = renderAt(
      <FeedbackSheet open={true} onClose={vi.fn()} signedIn={false} />,
      { route: '/t/abc/expenses' },
    );

    expect(screen.queryByTestId('feedback-contact-text')).toBeNull();

    await userEvent.click(screen.getByTestId('feedback-contact'));
    const contactInput = await screen.findByTestId('feedback-contact-text');
    expect(contactInput).toBeInTheDocument();

    await userEvent.type(contactInput, 'Alice zalo 0123');
    await userEvent.type(screen.getByTestId('feedback-message'), 'Guest feedback');
    await userEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]!.body).toMatchObject({
      message: 'Guest feedback',
      contactMe: true,
      contactText: 'Alice zalo 0123',
    });

    unmount();

    // Signed in: signedIn = true
    renderAt(
      <FeedbackSheet open={true} onClose={vi.fn()} signedIn={true} />,
      { route: '/t/abc/expenses' },
    );

    expect(screen.queryByTestId('feedback-contact-text')).toBeNull();
    await userEvent.click(screen.getByTestId('feedback-contact'));
    expect(screen.queryByTestId('feedback-contact-text')).toBeNull();

    await userEvent.type(screen.getByTestId('feedback-message'), 'Member feedback');
    await userEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => {
      expect(calls).toHaveLength(2);
    });
    expect(calls[1]!.body).toMatchObject({
      message: 'Member feedback',
      contactMe: true,
    });
    expect(calls[1]!.body).not.toHaveProperty('contactText');
  });

  it('error keeps text', async () => {
    const onClose = vi.fn();
    let status = 500;
    let responseData: unknown = { error: { code: 'INTERNAL', message: 'Internal error' } };

    mockApi({
      'POST /api/feedback': () => Response.json(responseData, { status }),
    });

    renderAt(<FeedbackSheet open={true} onClose={onClose} signedIn={true} />, {
      route: '/t/abc/expenses',
    });

    const textarea = screen.getByTestId('feedback-message');
    await userEvent.type(textarea, 'Bug report text');
    await userEvent.click(screen.getByTestId('feedback-send'));

    const errorElement = await screen.findByTestId('feedback-error');
    expect(errorElement).toHaveTextContent("Couldn't send. Please try again.");
    expect(textarea).toHaveValue('Bug report text');
    expect(onClose).not.toHaveBeenCalled();

    // 429 RATE_LIMITED
    status = 429;
    responseData = { error: { code: 'RATE_LIMITED', message: 'x' } };

    await userEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-error')).toHaveTextContent("You've sent a lot just now — try again later.");
    });
    expect(textarea).toHaveValue('Bug report text');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores draft', async () => {
    mockApi({ 'POST /api/feedback': null });
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <FeedbackSheet open={open} onClose={() => { onClose(); setOpen(false); }} signedIn={true} />
        </>
      );
    }
    renderAt(<Harness />, { route: '/t/abc/expenses' });

    await userEvent.type(screen.getByTestId('feedback-message'), 'Draft in progress');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('feedback-message')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'reopen' }));
    expect(await screen.findByTestId('feedback-message')).toHaveValue('Draft in progress');

    await userEvent.click(screen.getByTestId('feedback-send'));
    await waitFor(() => expect(screen.queryByTestId('feedback-message')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'reopen' }));
    expect(await screen.findByTestId('feedback-message')).toHaveValue('');
  });

  it('works when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    const { calls } = mockApi({ 'POST /api/feedback': null });
    const onClose = vi.fn();

    renderAt(<FeedbackSheet open={true} onClose={onClose} signedIn={true} />, {
      route: '/t/abc/expenses',
    });

    const textarea = screen.getByTestId('feedback-message');
    await userEvent.type(textarea, 'Message without localStorage');
    await userEvent.click(screen.getByTestId('feedback-type-other'));
    await userEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]!.body).toMatchObject({
      message: 'Message without localStorage',
      type: 'other',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
