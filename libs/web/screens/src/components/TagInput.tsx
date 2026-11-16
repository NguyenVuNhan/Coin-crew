import { useMemo, useState, type JSX, type KeyboardEvent } from 'react';
import { useT } from '@cc/web-i18n';
import { useTags } from '@cc/web-data-access/personalMoney';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';

export interface TagInputProps {
  value: string[];
  onChange(tags: string[]): void;
}

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

export function TagInput({ value, onChange }: TagInputProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState('');
  const tagsQuery = useTags();

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query) return [];
    const existing = new Set(value.map((tag) => tag.toLowerCase()));
    return (tagsQuery.data?.tags ?? [])
      .filter((tag) => !existing.has(tag.name.toLowerCase()) && tag.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [draft, tagsQuery.data?.tags, value]);

  const addTag = (raw: string) => {
    const trimmed = raw.replace(/,/g, '').trim();
    if (!trimmed || trimmed.length > MAX_TAG_LENGTH) return;
    if (value.length >= MAX_TAGS) return;
    if (value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  };

  const removeTag = (name: string) => {
    onChange(value.filter((tag) => tag !== name));
  };

  const handleChange = (next: string) => {
    if (next.includes(',')) {
      const parts = next.split(',');
      let updated = [...value];
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]?.trim() ?? '';
        if (
          part &&
          part.length <= MAX_TAG_LENGTH &&
          updated.length < MAX_TAGS &&
          !updated.some((tag) => tag.toLowerCase() === part.toLowerCase())
        ) {
          updated = [...updated, part];
        }
      }
      if (updated.length !== value.length) {
        onChange(updated);
      }
      setDraft(parts[parts.length - 1] ?? '');
      return;
    }
    setDraft(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    }
  };

  return (
    <div data-testid="tag-input" className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              data-testid={`tag-chip-${tag}`}
              className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-sm font-medium"
            >
              <span>{tag}</span>
              <button
                type="button"
                aria-label={t('personalEntry.removeTag', { name: tag })}
                onClick={() => removeTag(tag)}
                className="inline-flex items-center justify-center size-5 rounded-full hover:bg-muted cursor-pointer bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground"
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <Input
        type="text"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_TAG_LENGTH}
        disabled={value.length >= MAX_TAGS}
        placeholder={t('personalEntry.tagsPlaceholder')}
        data-testid="tag-input-field"
        className="text-base min-h-11"
      />

      {suggestions.length > 0 && (
        <div data-testid="tag-suggestions" className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              data-testid={`tag-suggestion-${tag.name}`}
              onClick={() => addTag(tag.name)}
              className="min-h-11 rounded-full bg-muted text-foreground px-3 text-sm font-medium hover:bg-secondary cursor-pointer border-0"
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
