import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { copyText } from '../../lib/clipboard';
import { useImageSheet } from '../SaveImageSheet';

vi.mock('../../lib/clipboard', () => ({
  copyText: vi.fn(),
}));

interface HarnessProps {
  render?: () => Promise<Blob | null>;
  renderFn?: () => Promise<Blob | null>;
  message?: string;
  renderSecond?: () => Promise<Blob | null>;
  messageSecond?: string;
}

function Harness({
  render = () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
  renderFn,
  message,
  renderSecond,
  messageSecond,
}: HarnessProps) {
  const { sheet, show } = useImageSheet();
  const primaryRender = renderFn ?? render;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          show(primaryRender, message);
        }}
      >
        open
      </button>
      {renderSecond && (
        <button
          type="button"
          onClick={() => {
            show(renderSecond, messageSecond);
          }}
        >
          open second
        </button>
      )}
      {sheet}
    </div>
  );
}

describe('useImageSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyText).mockResolvedValue(true);
  });

  it('copies the message before the picture is ready, then shows both', async () => {
    let resolveRender!: (blob: Blob | null) => void;
    const render = () =>
      new Promise<Blob | null>((resolve) => {
        resolveRender = resolve;
      });

    renderAt(<Harness render={render} message="msg" />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    expect(copyText).toHaveBeenCalledWith('msg');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await act(async () => {
      resolveRender(new Blob(['x'], { type: 'image/png' }));
    });

    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(
      screen.getByText(
        'Press and hold the picture (2 seconds) to save it or share it straight to your Zalo group',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Message copied — paste it in the Zalo group'),
    ).toBeInTheDocument();
  });

  it('shows no copy controls without a message', async () => {
    const render = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }));

    renderAt(<Harness render={render} />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    await screen.findByRole('img');

    expect(copyText).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Message copied — paste it in the Zalo group'),
    ).not.toBeInTheDocument();
  });

  it('still shows the picture when the copy never settles', async () => {
    vi.mocked(copyText).mockReturnValue(new Promise(() => {}));
    const render = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }));

    renderAt(<Harness render={render} message="msg" />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    const img = await screen.findByRole('img');
    expect(img).toBeInTheDocument();
    expect(
      screen.queryByText('Message copied — paste it in the Zalo group'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
  });

  it('says so when the picture cannot be made', async () => {
    const render = () => Promise.resolve(null);

    renderAt(<Harness render={render} message="msg" />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't make the picture.")).toBeInTheDocument();
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    expect(screen.getByText("Can't save? Tap ⋯ → Open in browser")).toBeInTheDocument();
  });

  it('the copy button copies again and updates the status', async () => {
    vi.mocked(copyText).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const render = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }));

    renderAt(<Harness render={render} message="msg" />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    await screen.findByRole('img');
    expect(
      screen.queryByText('Message copied — paste it in the Zalo group'),
    ).not.toBeInTheDocument();

    const copyButton = screen.getByRole('button', { name: 'Copy message' });
    await userEvent.click(copyButton);

    expect(copyText).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText('Message copied — paste it in the Zalo group'),
    ).toBeInTheDocument();
  });

  it('ends on the latest picture after two quick shows', async () => {
    let resolveFirst!: (blob: Blob | null) => void;
    const renderFirst = () =>
      new Promise<Blob | null>((resolve) => {
        resolveFirst = resolve;
      });

    let resolveSecond!: (blob: Blob | null) => void;
    const renderSecond = () =>
      new Promise<Blob | null>((resolve) => {
        resolveSecond = resolve;
      });

    renderAt(<Harness render={renderFirst} renderSecond={renderSecond} />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    await userEvent.click(screen.getByRole('button', { name: 'open second' }));

    await act(async () => {
      resolveSecond(new Blob(['second'], { type: 'image/png' }));
    });

    const expectedSecondUrl = `data:image/png;base64,${btoa('second')}`;
    const img = await screen.findByRole('img');
    await waitFor(() => {
      expect(img).toHaveAttribute('src', expectedSecondUrl);
    });

    await act(async () => {
      resolveFirst(new Blob(['first'], { type: 'image/png' }));
    });

    await waitFor(() => {
      expect(img).toHaveAttribute('src', expectedSecondUrl);
    });
  });
});
