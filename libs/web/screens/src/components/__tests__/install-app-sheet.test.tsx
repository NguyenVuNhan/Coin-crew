import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import type { InstallContext } from '@cc/web-platform/install';

const state = vi.hoisted(() => ({
  context: 'prompt' as string,
  prompt: vi.fn(),
}));

vi.mock('@cc/web-platform/install', async (orig) => {
  const actual = await orig<typeof import('@cc/web-platform/install')>();
  return {
    ...actual,
    useInstallPrompt: () => ({
      context: state.context as InstallContext,
      mobile: true,
      installed: false,
      prompt: state.prompt,
    }),
  };
});

import { InstallAppSheet } from '../InstallAppSheet';

const IOS26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
const IOS18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ZALO = 'Mozilla/5.0 (Linux; Android 13) Zalo';
const FB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) [FBAN/FBIOS;FBAV/400]';

function stubNav(props: { userAgent: string; clipboard?: unknown }) {
  vi.stubGlobal('navigator', { ...props, maxTouchPoints: 0 });
}

function setup(context: InstallContext, ua?: string) {
  state.context = context;
  if (ua) stubNav({ userAgent: ua });
  const onClose = vi.fn();
  const onInstalled = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <InstallAppSheet
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onInstalled={onInstalled}
      />
    );
  }
  renderAt(<Host />);
  return { onClose, onInstalled, sheet: screen.getByTestId('install-sheet') };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  state.prompt = vi.fn();
});

describe('InstallAppSheet', () => {
  it('prompt: Install now is the only primary and accepted closes with a status', async () => {
    state.prompt = vi.fn().mockResolvedValue('accepted');
    const { onClose, onInstalled, sheet } = setup('prompt');
    expect(sheet).toHaveClass('fsl-install-sheet--prompt');
    const btn = screen.getByRole('button', { name: 'Install now' });
    expect(sheet.querySelectorAll('.fsl-button--primary')).toHaveLength(1);
    await userEvent.click(btn);
    expect(state.prompt).toHaveBeenCalled();
    await waitFor(() => expect(onInstalled).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Added to your home screen');
  });

  it('prompt dismissed: falls back to the android steps', async () => {
    state.prompt = vi.fn().mockResolvedValue('dismissed');
    setup('prompt');
    await userEvent.click(screen.getByRole('button', { name: 'Install now' }));
    expect(await screen.findByText(/Install app/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install now' })).toBeNull();
  });

  it('android-manual: two steps and Got it', async () => {
    const { onClose, sheet } = setup('android-manual');
    expect(within(sheet).getAllByTestId('install-step')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('ios-safari 26: three steps and sign-in note', () => {
    const { sheet } = setup('ios-safari', IOS26);
    expect(within(sheet).getAllByTestId('install-step')).toHaveLength(3);
    expect(screen.getByText(/sign in once/)).toBeInTheDocument();
  });

  it('ios-safari 18: two steps, first mentions the bottom bar', () => {
    const { sheet } = setup('ios-safari', IOS18);
    const rows = within(sheet).getAllByTestId('install-step');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('bottom bar');
  });

  it('ios-chrome and ios-other', () => {
    const a = setup('ios-chrome');
    expect(within(a.sheet).getAllByTestId('install-step')).toHaveLength(2);
    expect(screen.getByText(/sign in once/)).toBeInTheDocument();
  });

  it('ios-other: one step', () => {
    const { sheet } = setup('ios-other');
    expect(within(sheet).getAllByTestId('install-step')).toHaveLength(1);
    expect(screen.getByText(/sign in once/)).toBeInTheDocument();
  });

  it('in-app Zalo: copy link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNav({ userAgent: ZALO, clipboard: { writeText } });
    state.context = 'in-app';
    renderAt(<InstallAppSheet open onClose={vi.fn()} />);
    expect(screen.getByText('Open in your browser to install')).toBeInTheDocument();
    expect(screen.getByText(/inside Zalo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('in-app other app', () => {
    setup('in-app', FB);
    expect(screen.getByText(/inside this app/)).toBeInTheDocument();
  });

  it('desktop', () => {
    setup('desktop');
    expect(screen.getByText('Click the install icon in the address bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });
});
