import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { foldForSearch, type TagView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@cc/web-ui/components/ui/input-group';
import { cn } from '@cc/web-ui/lib/utils';

export interface TransactionSearchBarProps {
  q: string | undefined;
  tagId: string | undefined;
  tags: TagView[];
  advancedCount: number;
  onSubmit(next: { q?: string; tagId?: string }): void;
  onOpenAdvanced(): void;
  draftRef?: RefObject<{ text: string } | null>;
}

interface HashToken {
  start: number;
  end: number;
  query: string;
}

function getHashTokenAtCaret(text: string, caret: number): HashToken | null {
  const clamped = Math.max(0, Math.min(caret, text.length));
  let start = clamped;
  while (start > 0 && !/\s/.test(text[start - 1]!)) {
    start -= 1;
  }
  let end = clamped;
  while (end < text.length && !/\s/.test(text[end]!)) {
    end += 1;
  }
  const word = text.slice(start, end);
  if (!word.startsWith('#')) return null;
  return { start, end, query: word.slice(1) };
}

function removeToken(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const joined =
    before.endsWith(' ') && after.startsWith(' ')
      ? before + after.slice(1)
      : before + after;
  return joined.trim();
}

/** Search bar for transactions with inline #tag chip, #tag suggestions, and advanced-filter trigger. */
export function TransactionSearchBar({
  q,
  tagId,
  tags,
  advancedCount,
  onSubmit,
  onOpenAdvanced,
  draftRef,
}: TransactionSearchBarProps): JSX.Element {
  const t = useT();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(q ?? '');
  const [caret, setCaret] = useState((q ?? '').length);
  const [dismissed, setDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const next = q ?? '';
    setText(next);
    setCaret(next.length);
    setDismissed(false);
  }, [q]);

  useEffect(() => {
    if (draftRef) {
      draftRef.current = { text };
    }
  }, [draftRef, text]);

  const updateText = (next: string, nextCaret: number) => {
    setText(next);
    setCaret(nextCaret);
    setDismissed(false);
    if (draftRef) {
      draftRef.current = { text: next };
    }
  };

  const hashToken = useMemo(
    () => (tags.length > 0 ? getHashTokenAtCaret(text, caret) : null),
    [tags.length, text, caret],
  );

  const filteredTags = useMemo(() => {
    if (!hashToken) return [];
    const foldedQuery = foldForSearch(hashToken.query);
    if (!foldedQuery) return tags;
    return tags.filter((tag) => foldForSearch(tag.name).includes(foldedQuery));
  }, [hashToken, tags]);

  const listOpen = Boolean(hashToken) && tags.length > 0 && !dismissed;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [hashToken?.query, listOpen]);

  const activeTag =
    listOpen && filteredTags.length > 0
      ? filteredTags[Math.min(highlightedIndex, filteredTags.length - 1)]
      : undefined;

  const selectedTagName = useMemo(() => {
    if (!tagId) return undefined;
    return tags.find((tag) => tag.id === tagId)?.name ?? tagId;
  }, [tagId, tags]);

  const commitSearch = () => {
    const trimmed = text.trim();
    setDismissed(true);
    onSubmit({ q: trimmed || undefined, tagId });
  };

  const pickTag = (tag: TagView) => {
    const remaining = hashToken
      ? removeToken(text, hashToken.start, hashToken.end)
      : text.trim();
    updateText(remaining, remaining.length);
    setDismissed(true);
    onSubmit({ q: remaining || undefined, tagId: tag.id });
  };

  const handleRemoveTag = () => {
    const trimmed = text.trim();
    onSubmit({ q: trimmed || undefined, tagId: undefined });
  };

  const handleClearText = () => {
    updateText('', 0);
    setDismissed(true);
    onSubmit({ q: undefined, tagId });
    inputRef.current?.focus();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    const nextCaret = e.target.selectionStart ?? next.length;
    updateText(next, nextCaret);
  };

  const syncCaret = (e: SyntheticEvent<HTMLInputElement>) => {
    const nextCaret = e.currentTarget.selectionStart ?? text.length;
    setCaret(nextCaret);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && text === '' && tagId) {
      e.preventDefault();
      onSubmit({ q: undefined, tagId: undefined });
      return;
    }

    if (listOpen) {
      if (e.key === 'ArrowDown') {
        if (filteredTags.length > 0) {
          e.preventDefault();
          setHighlightedIndex((prev) => (prev + 1) % filteredTags.length);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        if (filteredTags.length > 0) {
          e.preventDefault();
          setHighlightedIndex(
            (prev) => (prev - 1 + filteredTags.length) % filteredTags.length,
          );
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeTag) {
          pickTag(activeTag);
        } else {
          commitSearch();
          e.currentTarget.blur();
        }
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      commitSearch();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="fsl-tx-search relative w-full">
      <InputGroup className="h-11 bg-card">
        {selectedTagName && (
          <InputGroupAddon align="inline-start" className="py-0 pl-1.5 pr-0">
            <button
              type="button"
              data-testid="tx-search-tag-chip"
              onClick={handleRemoveTag}
              aria-label={t('transactions.removeFilter', {
                label: `#${selectedTagName}`,
              })}
              className="inline-flex min-h-11 items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              <Pill tone="accent" className="gap-1 pr-1.5 py-1 text-xs whitespace-nowrap">
                <span>#{selectedTagName}</span>
                <Icon name="x" size={12} />
              </Pill>
            </button>
          </InputGroupAddon>
        )}

        <InputGroupInput
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          data-testid="tx-filter-search"
          value={text}
          onChange={handleChange}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onKeyDown={handleKeyDown}
          placeholder={t('transactions.searchPlaceholder')}
          aria-label={t('transactions.searchLabel')}
          aria-autocomplete={tags.length > 0 ? 'list' : undefined}
          aria-expanded={listOpen}
          aria-controls={listOpen ? listboxId : undefined}
          aria-activedescendant={
            activeTag ? `tx-tag-option-${activeTag.id}` : undefined
          }
          className="text-base md:text-base h-11 min-w-0"
        />

        <InputGroupAddon align="inline-end" className="gap-0 py-0 pr-0.5">
          {text.length > 0 && (
            <button
              type="button"
              data-testid="tx-search-clear"
              onClick={handleClearText}
              aria-label={t('transactions.clearSearch')}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="x" size={16} />
            </button>
          )}

          <button
            type="button"
            data-testid="tx-search-submit"
            onClick={commitSearch}
            aria-label={t('transactions.searchSubmit')}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors motion-reduce:transition-none">
              <Icon name="search" size={16} />
            </span>
          </button>

          <button
            type="button"
            data-testid="tx-filter-btn"
            onClick={onOpenAdvanced}
            aria-label={t('transactions.advancedFilters')}
            className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="sliders" size={18} />
            {advancedCount > 0 && (
              <span
                data-testid="tx-filter-count"
                className="absolute top-1.5 right-1.5 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums leading-none"
              >
                {advancedCount}
              </span>
            )}
          </button>
        </InputGroupAddon>
      </InputGroup>

      {listOpen && (
        <div
          id={listboxId}
          role="listbox"
          data-testid="tx-tag-suggestions"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-lg divide-y divide-border"
        >
          {filteredTags.length === 0 ? (
            <div className="min-h-11 px-4 py-2.5 flex items-center text-sm text-muted-foreground">
              {t('transactions.noTagMatch')}
            </div>
          ) : (
            filteredTags.map((tag, index) => {
              const selected = index === highlightedIndex;
              return (
                <button
                  key={tag.id}
                  id={`tx-tag-option-${tag.id}`}
                  data-testid={`tx-tag-option-${tag.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickTag(tag)}
                  className={cn(
                    'w-full min-h-11 px-4 py-2.5 text-left text-sm flex items-center cursor-pointer transition-colors motion-reduce:transition-none',
                    selected
                      ? 'bg-secondary text-secondary-foreground font-medium'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  #{tag.name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
