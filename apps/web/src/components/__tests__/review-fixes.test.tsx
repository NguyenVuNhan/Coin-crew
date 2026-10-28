import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { AvatarCropModal } from '../AvatarCropModal';
import { Button } from '../Button';
import { Pill } from '../Pill';
import { PayQr } from '../PayQr';
import type { PayInfo } from '@fsl/core';
import { renderAt } from '../../test/render';

/** Answers `(min-width: 640px)` as given; every other query is false. */
function setWide(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width:\s*640px/.test(query) ? wide : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Account">
        <button type="button">Sign out</button>
      </ResponsiveSheet>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('final review fixes', () => {
  it('a tall sheet in dialog mode scrolls inside a capped height', async () => {
    setWide(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    expect(dialog).toHaveClass('max-h-[85dvh]', 'flex', 'flex-col');
    expect(screen.getByRole('button', { name: 'Sign out' }).parentElement).toHaveClass('min-h-0', 'overflow-y-auto');
  });

  it('on phones, focus moves into the drawer on open and back to the opener on Escape', async () => {
    setWide(false);
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('dragging the photo in the crop never drags the sheet', async () => {
    setWide(false);
    render(<AvatarCropModal open imageSrc="data:image/png;base64,AA==" onSave={() => {}} onCancel={() => {}} />);
    await screen.findByRole('dialog');
    expect(document.querySelector('.fsl-crop__viewport')).toHaveAttribute('data-vaul-no-drag');
    expect(screen.getByRole('slider')).toHaveAttribute('data-vaul-no-drag');
  });

  it('a full-width button wraps a long label instead of spilling out', () => {
    render(<Button block>Add bank details for Nguyễn Thị Phương Thảo</Button>);
    expect(screen.getByRole('button')).toHaveClass('whitespace-normal', 'h-auto', 'min-h-11');
  });

  it('Pill passes extra attributes through, so live regions keep announcing', () => {
    render(<Pill aria-live="polite">2 of 5</Pill>);
    expect(screen.getByText('2 of 5')).toHaveAttribute('aria-live', 'polite');
  });

  it('the QR summary is the old one restyled: amount, bank · holder, and the note, with no new copy rows', () => {
    const info: PayInfo = {
      to: { id: 'p-minh', name: 'Minh' }, amount: 1245000, bankState: 'ok',
      bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
      refCode: '', payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572', inFlight: [],
    };
    renderAt(<PayQr variant="pay" info={info} />);
    expect(screen.getByText('Techcombank · NGUYEN VAN MINH')).toBeInTheDocument();
    expect(screen.queryByText('Techcombank')).toBeNull();
    expect(screen.queryByText('1903 •••• 5678')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(document.querySelector('.fsl-pay-qr__note')).not.toBeNull();
  });
});
