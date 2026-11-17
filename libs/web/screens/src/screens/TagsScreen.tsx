import { useMemo, useState, type JSX } from 'react';
import type { TagView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError } from '@cc/web-data-access/client';
import { useLedger } from '@cc/web-data-access/people';
import { useDeleteTag, useRenameTag, useTags } from '@cc/web-data-access/personalMoney';
import { SwipeGroupProvider } from '@cc/web-util/useSwipeReveal';
import { ActionRow, type RowAction } from '@cc/web-ui/components/ActionRow';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { Screen } from '../components/Screen';

export function TagsScreen(): JSX.Element {
  const t = useT();
  const { ledger } = useLedger();
  const tagsQuery = useTags();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();

  const [renaming, setRenaming] = useState<TagView | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TagView | null>(null);

  const sortedTags = useMemo(() => {
    const list = tagsQuery.data?.tags ?? [];
    return [...list].sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
  }, [tagsQuery.data?.tags]);

  const openRename = (tag: TagView) => {
    setRenaming(tag);
    setNameInput(tag.name);
    setRenameError(null);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    const trimmed = nameInput.trim();
    if (!trimmed || renameTag.isPending) return;
    setRenameError(null);
    try {
      await renameTag.mutateAsync({ id: renaming.id, name: trimmed });
      setRenaming(null);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 409 || err.code === 'CONFLICT')) {
        setRenameError(t('tags.renameConflict'));
      } else {
        setRenameError(t('error.generic'));
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || deleteTag.isPending) return;
    await deleteTag.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <Screen
      title={t('tags.title')}
      back="/trips"
      nav={ledger ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` } : undefined}
    >
      <div className="fsl-tags flex flex-col gap-4 py-4">
        {tagsQuery.isPending ? (
          <SkeletonList rows={4} />
        ) : tagsQuery.error ? (
          <InlineError error={tagsQuery.error} onRetry={() => tagsQuery.refetch()} />
        ) : sortedTags.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={t('tags.emptyTitle')}
            body={t('tags.emptyBody')}
          />
        ) : (
          <SwipeGroupProvider>
            <div className="fsl-tags__list bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {sortedTags.map((tag) => {
                const actions: RowAction[] = [
                  {
                    id: 'rename',
                    label: t('tags.rename'),
                    icon: 'edit',
                    onSelect: () => openRename(tag),
                  },
                  {
                    id: 'delete',
                    label: t('tags.delete'),
                    icon: 'trash',
                    tone: 'danger',
                    onSelect: () => setConfirmDelete(tag),
                  },
                ];

                return (
                  <div key={tag.id} data-testid={`tag-row-${tag.id}`}>
                    <ActionRow
                      label={tag.name}
                      actions={actions}
                      trailing={
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t('tags.useCount', { count: tag.useCount })}
                        </span>
                      }
                    >
                      <span className="text-sm font-medium text-foreground truncate">
                        {tag.name}
                      </span>
                    </ActionRow>
                  </div>
                );
              })}
            </div>
          </SwipeGroupProvider>
        )}
      </div>

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('tags.renameTitle')}
      >
        <form onSubmit={(e) => void handleRenameSubmit(e)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-name-input">{t('tags.name')}</Label>
            <Input
              id="tag-name-input"
              type="text"
              required
              maxLength={40}
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setRenameError(null);
              }}
              data-testid="tag-name-input"
              className="min-h-11 text-base"
            />
          </div>

          {renameError && (
            <p role="alert" className="m-0 text-sm text-danger">
              {renameError}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!nameInput.trim()}
              loading={renameTag.isPending}
              data-testid="tag-save-btn"
            >
              {t('tags.save')}
            </Button>
          </div>
        </form>
      </Sheet>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t('tags.deleteConfirmTitle')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {confirmDelete ? t('tags.deleteConfirmBody', { count: confirmDelete.useCount }) : ''}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              data-testid="tag-delete-confirm"
              loading={deleteTag.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {t('tags.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </Screen>
  );
}
