import { useState, useRef, useCallback, type JSX } from 'react';
import { useT } from '../i18n';
import { Sheet } from './Sheet';
import { Skeleton } from './Skeleton';
import { Button } from './Button';
import { copyText } from '../lib/clipboard';
import { blobToDataUrl } from '../lib/qr';
import './SaveImageSheet.css';

export interface SaveImageSheetProps {
  open: boolean;
  onClose: () => void;
  dataUrl: string | null;
  loading: boolean;
  message?: string;
  copied: boolean | null;
  onCopy: () => void;
}

export function SaveImageSheet({
  open,
  onClose,
  dataUrl,
  loading,
  message,
  copied,
  onCopy,
}: SaveImageSheetProps) {
  const t = useT();

  return (
    <Sheet open={open} onClose={onClose} title={t('share.imageTitle')}>
      <div className="fsl-save-image">
        {loading ? (
          <Skeleton width="100%" height={280} radius="md" />
        ) : dataUrl ? (
          <img
            className="fsl-save-image__img"
            src={dataUrl}
            alt={t('share.imageTitle')}
          />
        ) : (
          <p className="fsl-save-image__error" role="alert">
            {t('share.imageFailed')}
          </p>
        )}

        {(loading || Boolean(dataUrl)) && (
          <p className="fsl-save-image__instruction">{t('share.longPress')}</p>
        )}

        {message !== undefined && (
          <>
            <p className="fsl-save-image__status" aria-live="polite">
              {copied === true ? t('share.messageCopied') : ''}
            </p>
            <Button
              variant="secondary"
              block
              onClick={onCopy}
              className="fsl-save-image__copy"
            >
              {t('share.copyMessage')}
            </Button>
          </>
        )}

        <p className="fsl-save-image__hint">{t('share.openInBrowser')}</p>
      </div>
    </Sheet>
  );
}

export function useImageSheet(): {
  sheet: JSX.Element;
  show(render: () => Promise<Blob | null>, message?: string): void;
} {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<boolean | null>(null);

  const requestIdRef = useRef(0);
  const messageRef = useRef<string | undefined>(undefined);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCopy = useCallback(() => {
    if (messageRef.current === undefined) return;
    const targetId = requestIdRef.current;
    try {
      copyText(messageRef.current)
        .then((result) => {
          if (requestIdRef.current === targetId) {
            setCopied(result);
          }
        })
        .catch(() => {
          if (requestIdRef.current === targetId) {
            setCopied(false);
          }
        });
    } catch {
      if (requestIdRef.current === targetId) {
        setCopied(false);
      }
    }
  }, []);

  const show = useCallback(
    (render: () => Promise<Blob | null>, messageText?: string) => {
      requestIdRef.current += 1;
      const id = requestIdRef.current;
      messageRef.current = messageText;

      setOpen(true);
      setLoading(true);
      setDataUrl(null);
      setMessage(messageText);
      setCopied(null);

      if (messageText !== undefined) {
        try {
          copyText(messageText)
            .then((res) => {
              if (requestIdRef.current === id) {
                setCopied(res);
              }
            })
            .catch(() => {
              if (requestIdRef.current === id) {
                setCopied(false);
              }
            });
        } catch {
          if (requestIdRef.current === id) {
            setCopied(false);
          }
        }
      }

      (async () => {
        let nextDataUrl: string | null = null;
        try {
          const blob = await render();
          if (blob) {
            try {
              nextDataUrl = await blobToDataUrl(blob);
            } catch {
              nextDataUrl = null;
            }
          }
        } catch {
          nextDataUrl = null;
        }

        if (requestIdRef.current === id) {
          setDataUrl(nextDataUrl);
          setLoading(false);
        }
      })();
    },
    [],
  );

  const sheet = (
    <SaveImageSheet
      open={open}
      onClose={handleClose}
      dataUrl={dataUrl}
      loading={loading}
      message={message}
      copied={copied}
      onCopy={handleCopy}
    />
  );

  return { sheet, show };
}
