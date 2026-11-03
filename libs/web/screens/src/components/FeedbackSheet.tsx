import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import type { FeedbackRequest, FeedbackType } from '@cc/core';
import { sendFeedback } from '../api/feedback';
import { screenName } from '../lib/screenName';
import { useT, useLang } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';
import { Snackbar } from './Snackbar';
import { Button } from './Button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const DRAFT_KEY = 'fsl_feedback_draft';

interface FeedbackDraft {
  message?: string;
  type?: FeedbackType | null;
}

function loadDraft(): FeedbackDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as FeedbackDraft;
    }
    return null;
  } catch {
    return null;
  }
}

function saveDraft(draft: FeedbackDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage errors
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore storage errors
  }
}

const TYPE_OPTIONS: { type: FeedbackType; labelKey: MessageKey; testId: string }[] = [
  { type: 'bug', labelKey: 'feedback.bug', testId: 'feedback-type-bug' },
  { type: 'idea', labelKey: 'feedback.idea', testId: 'feedback-type-idea' },
  { type: 'other', labelKey: 'feedback.other', testId: 'feedback-type-other' },
];

export function FeedbackSheet({
  open,
  onClose,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
}) {
  const t = useT();
  const [lang] = useLang();
  const location = useLocation();

  const [message, setMessage] = useState('');
  const [type, setType] = useState<FeedbackType | null>(null);
  const [contactMe, setContactMe] = useState(false);
  const [contactText, setContactText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorType, setErrorType] = useState<'rateLimited' | 'generic' | null>(null);

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!prevOpenRef.current) {
        const draft = loadDraft();
        if (draft) {
          setMessage(typeof draft.message === 'string' ? draft.message : '');
          setType(
            draft.type === 'bug' || draft.type === 'idea' || draft.type === 'other'
              ? draft.type
              : null,
          );
        } else {
          setMessage('');
          setType(null);
        }
        setErrorType(null);
      }
      prevOpenRef.current = true;

      textareaRef.current?.focus();
      const frameId = requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      return () => {
        cancelAnimationFrame(frameId);
      };
    } else {
      prevOpenRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current);
      }
    };
  }, []);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setMessage(next);
    saveDraft({ message: next, type });
  };

  const handleTypeClick = (clickedType: FeedbackType) => {
    const next = type === clickedType ? null : clickedType;
    setType(next);
    saveDraft({ message, type: next });
  };

  const triggerSnackbar = () => {
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current);
    }
    setSnackbarVisible(true);
    snackbarTimerRef.current = setTimeout(() => {
      setSnackbarVisible(false);
      snackbarTimerRef.current = null;
    }, 4000);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setErrorType(null);

    let device: 'phone' | 'desktop' = 'phone';
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        device = window.matchMedia('(min-width: 640px)').matches ? 'desktop' : 'phone';
      }
    } catch {
      device = 'phone';
    }

    const appVersion = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';

    const body: FeedbackRequest = {
      message: trimmed,
      type,
      screen: screenName(location.pathname),
      device,
      lang,
      appVersion,
      contactMe,
      ...(!signedIn && contactMe ? { contactText: contactText.trim() } : {}),
    };

    try {
      await sendFeedback(body);
      clearDraft();
      setMessage('');
      setType(null);
      setContactMe(false);
      setContactText('');
      setErrorType(null);
      onClose();
      triggerSnackbar();
    } catch (err: unknown) {
      let code: string | undefined;
      if (err && typeof err === 'object' && 'code' in err) {
        code = String((err as { code: unknown }).code);
      }
      if (code === 'RATE_LIMITED') {
        setErrorType('rateLimited');
      } else {
        setErrorType('generic');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t('feedback.title')}>
        <div className="fsl-feedback flex flex-col gap-4">
          <p className="fsl-feedback__hint m-0 text-sm text-muted-foreground">
            {t('feedback.hint')}
          </p>

          <div className="fsl-feedback__types flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((chip) => {
              const isSelected = type === chip.type;
              return (
                <button
                  key={chip.type}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={chip.testId}
                  onClick={() => handleTypeClick(chip.type)}
                  className={cn(
                    'fsl-feedback__type-chip min-h-11 rounded-full border px-4 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'fsl-feedback__type-chip--selected bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  {t(chip.labelKey)}
                </button>
              );
            })}
          </div>

          <Textarea
            ref={textareaRef}
            autoFocus
            maxLength={2000}
            value={message}
            onChange={handleMessageChange}
            placeholder={t('feedback.placeholder')}
            aria-label={t('feedback.title')}
            data-testid="feedback-message"
            className="fsl-feedback__message min-h-28 text-base"
          />

          <div className="fsl-feedback__contact flex flex-col gap-2">
            <div className="fsl-feedback__contact-row flex min-h-11 items-center gap-2">
              <Checkbox
                id="feedback-contact-checkbox"
                checked={contactMe}
                onCheckedChange={(checked) => setContactMe(checked === true)}
                data-testid="feedback-contact"
                className="fsl-feedback__contact-checkbox"
              />
              <Label
                htmlFor="feedback-contact-checkbox"
                className="fsl-feedback__contact-label cursor-pointer text-sm font-normal text-foreground leading-normal"
              >
                {t('feedback.contactMe')}
              </Label>
            </div>

            {!signedIn && contactMe && (
              <Input
                type="text"
                maxLength={100}
                value={contactText}
                onChange={(e) => setContactText(e.target.value)}
                placeholder={t('feedback.contactField')}
                aria-label={t('feedback.contactField')}
                data-testid="feedback-contact-text"
                className="fsl-feedback__contact-text text-base"
              />
            )}
          </div>

          {errorType && (
            <p
              role="alert"
              className="fsl-feedback__error m-0 text-sm text-danger"
              data-testid="feedback-error"
            >
              {errorType === 'rateLimited' ? t('feedback.rateLimited') : t('feedback.error')}
            </p>
          )}

          <Button
            variant="primary"
            block
            loading={sending}
            disabled={!message.trim() || sending}
            onClick={handleSend}
            data-testid="feedback-send"
            className="fsl-feedback__send"
          >
            {t('feedback.send')}
          </Button>
        </div>
      </Sheet>

      {snackbarVisible && <Snackbar message={t('feedback.thanks')} />}
    </>
  );
}
