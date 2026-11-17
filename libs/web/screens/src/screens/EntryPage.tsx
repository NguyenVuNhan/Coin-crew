import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CURRENCIES,
  formatMoney,
  type CurrencyCode,
  type EntryInput,
  type EntryView,
  type ListResponse,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { currentMonthLocal, todayLocal } from '@cc/web-util/localDate';
import { useIsMousePointer } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { useLedger } from '@cc/web-data-access/people';
import {
  PERSONAL_LIST_KEY,
  readLastWallet,
  useCategories,
  useCreateEntry,
  useDeleteEntry,
  usePersonalList,
  useUpdateEntry,
  useWalletDetails,
  writeLastWallet,
} from '@cc/web-data-access/personalMoney';
import { Amount } from '@cc/web-ui/components/Amount';
import { AmountSuggestionChips } from '@cc/web-ui/components/AmountKeypad';
import { BottomBar } from '@cc/web-ui/components/BottomBar';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError, errorText, ownError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import { AmountField, evaluateAmountExpression, formatKeypadValue } from '../components/AmountField';
import { CategoryPicker } from '../components/CategoryPicker';
import { EntryDateRow } from '../components/EntryDateRow';
import { DockedAmountKeypad, useLiveAnnouncer } from '../components/AmountKeypadDock';
import { SmallAmountModal } from '../components/SmallAmountModal';
import { ForeignWalletModal, type ForeignWalletConfirm } from '../components/ForeignWalletModal';
import { showUndo } from '../components/UndoSnackbarHost';
import { useBack } from '../lib/navHistory';
import { QuickExpenseEmbed } from './ExpenseForm';

type FormEntryType = 'expense' | 'income';
type TabValue = FormEntryType | 'loan-debt';

function parseInitialType(raw: string | null): {
  tab: TabValue;
  type: FormEntryType;
  transfer: boolean;
} {
  if (raw === 'loan-debt') return { tab: 'loan-debt', type: 'expense', transfer: false };
  if (raw === 'income') return { tab: 'income', type: 'income', transfer: false };
  if (raw === 'transfer') return { tab: 'expense', type: 'expense', transfer: true };
  return { tab: 'expense', type: 'expense', transfer: false };
}

function nowDatetimeLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatImpliedRate(
  fromCur: CurrencyCode,
  toCur: CurrencyCode,
  sentMinor: number,
  receivedMinor: number,
): string {
  const sentMajor = sentMinor / 10 ** CURRENCIES[fromCur].decimals;
  const recMajor = receivedMinor / 10 ** CURRENCIES[toCur].decimals;
  if (sentMajor <= 0 || recMajor <= 0) return '';

  if (fromCur === 'VND' && toCur !== 'VND') {
    const vndPerUnit = Math.round(sentMajor / recMajor);
    return `1 ${toCur} ≈ ${formatMoney(vndPerUnit, 'VND')}`;
  }
  if (toCur === 'VND' && fromCur !== 'VND') {
    const vndPerUnit = Math.round(recMajor / sentMajor);
    return `1 ${fromCur} ≈ ${formatMoney(vndPerUnit, 'VND')}`;
  }
  const ratio = recMajor / sentMajor;
  return `1 ${fromCur} ≈ ${ratio.toLocaleString('vi-VN', { maximumFractionDigits: 4 })} ${toCur}`;
}

function pickDefaultWallet(activeWallets: WalletDetailView[]): string {
  const lastId = readLastWallet();
  if (lastId && activeWallets.some((w) => w.id === lastId)) {
    return lastId;
  }
  return (activeWallets.find((w) => w.isDefault) ?? activeWallets[0])?.id ?? '';
}

export function EntryPage(): JSX.Element {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { goBack } = useBack('/trips');
  const { ledger, isLoading: ledgerLoading } = useLedger({ enabled: !isEdit });

  const stateEntry = (location.state as { entry?: EntryView } | null)?.entry;

  const cachedEntry = useMemo(() => {
    if (!id || stateEntry) return stateEntry ?? null;
    const cachedLists = queryClient.getQueriesData<ListResponse>({ queryKey: PERSONAL_LIST_KEY });
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const row of data.rows) {
        if (row.kind === 'entry' && row.entry.id === id) {
          return row.entry;
        }
      }
    }
    return null;
  }, [id, stateEntry, queryClient]);

  const preEntry = useMemo(() => {
    if (cachedEntry) return cachedEntry;
    return null;
  }, [cachedEntry]);

  const cachedCounterpart = useMemo(() => {
    if (!preEntry?.transferId) return null;
    const cachedLists = queryClient.getQueriesData<ListResponse>({ queryKey: PERSONAL_LIST_KEY });
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const row of data.rows) {
        if (
          row.kind === 'entry' &&
          row.entry.transferId === preEntry.transferId &&
          row.entry.id !== preEntry.id
        ) {
          return row.entry;
        }
      }
    }
    return null;
  }, [preEntry, queryClient]);

  const monthParam = preEntry?.date.slice(0, 7) ?? searchParams.get('month') ?? currentMonthLocal();
  const needsCounterpartFetch = isEdit && Boolean(preEntry?.transferId) && !cachedCounterpart;
  const listQuery = usePersonalList(
    { month: monthParam },
    { enabled: isEdit && (!cachedEntry || needsCounterpartFetch) },
  );

  const entry = useMemo(() => {
    if (cachedEntry) return cachedEntry;
    if (!id || !listQuery.data) return null;
    for (const row of listQuery.data.rows) {
      if (row.kind === 'entry' && row.entry.id === id) {
        return row.entry;
      }
    }
    return null;
  }, [cachedEntry, id, listQuery.data]);

  const counterpartEntry = useMemo(() => {
    if (!entry?.transferId) return null;
    if (cachedCounterpart) return cachedCounterpart;
    if (listQuery.data) {
      for (const row of listQuery.data.rows) {
        if (
          row.kind === 'entry' &&
          row.entry.transferId === entry.transferId &&
          row.entry.id !== entry.id
        ) {
          return row.entry;
        }
      }
    }
    return null;
  }, [entry, cachedCounterpart, listQuery.data]);

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  const allWallets = useMemo(
    () => walletsQuery.data?.wallets ?? [],
    [walletsQuery.data?.wallets],
  );
  const activeWallets = useMemo(
    () => allWallets.filter((w) => !w.archived),
    [allWallets],
  );

  const initial = parseInitialType(isEdit ? null : searchParams.get('type'));
  const [activeTab, setActiveTab] = useState<TabValue>(initial.tab);
  const [entryType, setEntryType] = useState<FormEntryType>(initial.type);
  const [isTransferMode, setIsTransferMode] = useState<boolean>(initial.transfer);
  const [walletId, setWalletId] = useState('');
  const [otherWalletId, setOtherWalletId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [primaryExpr, setPrimaryExpr] = useState('');
  const [secondaryExpr, setSecondaryExpr] = useState('');
  const [activeTransferField, setActiveTransferField] = useState<'primary' | 'secondary'>('primary');
  const [dateTime, setDateTime] = useState(() => nowDatetimeLocal());
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [excludeFromReports, setExcludeFromReports] = useState(initial.transfer);
  const [excludeTouched, setExcludeTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(!isEdit);
  const [walletSheetTarget, setWalletSheetTarget] = useState<'single' | 'other' | null>(null);
  const [validationError, setValidationError] = useState<unknown>(null);
  const [categoryError, setCategoryError] = useState(false);
  const [categoryRingActive, setCategoryRingActive] = useState(false);
  const [smallAmountConfirm, setSmallAmountConfirm] = useState<{
    minor: number;
    target: 'primary' | 'secondary';
  } | null>(null);
  const [foreignConfirm, setForeignConfirm] = useState<ForeignWalletConfirm | null>(null);
  const foreignConfirmedRef = useRef(false);
  const [leaveGuardOpen, setLeaveGuardOpen] = useState(false);
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [counterpartAppliedId, setCounterpartAppliedId] = useState<string | null>(null);
  const [walletDefaultsApplied, setWalletDefaultsApplied] = useState(false);
  const [keypadFocusToken, setKeypadFocusToken] = useState(0);

  const amountAreaRef = useRef<HTMLDivElement>(null);
  const categoryGridRef = useRef<HTMLDivElement>(null);
  const categoryRingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const secondaryButtonRef = useRef<HTMLButtonElement>(null);
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const saveBarRef = useRef<HTMLDivElement>(null);
  const pendingFocusTargetRef = useRef<'category' | 'secondary' | 'save' | null>(null);
  const wasKeypadOpenBeforeGuardRef = useRef(false);
  const didAutoFocusRef = useRef(false);
  const isMousePointer = useIsMousePointer();
  const effectiveKeypadOpen = !isMousePointer && keypadOpen;
  const { announce, announceSoon, region: liveRegion } = useLiveAnnouncer();

  useEffect(() => {
    return () => {
      if (categoryRingTimerRef.current) clearTimeout(categoryRingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (keypadOpen || pendingFocusTargetRef.current === null) return;
    const target = pendingFocusTargetRef.current;
    pendingFocusTargetRef.current = null;
    if (target === 'category') {
      const firstTile = categoryGridRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      firstTile?.focus();
      firstTile?.scrollIntoView?.({ block: 'nearest' });
    } else if (target === 'secondary') {
      secondaryButtonRef.current?.focus();
    } else {
      saveBarRef.current?.querySelector<HTMLButtonElement>('[data-testid="entry-save-btn"]')?.focus();
    }
  }, [keypadOpen]);

  const typeParam = searchParams.get('type');
  useEffect(() => {
    if (isEdit) return;
    if (typeParam === 'loan-debt') {
      setActiveTab('loan-debt');
    } else if (typeParam === 'income') {
      setActiveTab('income');
      setEntryType('income');
    } else if (typeParam === 'expense') {
      setActiveTab('expense');
      setEntryType('expense');
    }
  }, [isEdit, typeParam]);

  // Initialize default wallets in new mode
  useEffect(() => {
    if (isEdit || walletDefaultsApplied || activeWallets.length === 0) return;
    const defId = pickDefaultWallet(activeWallets);
    const otherId = activeWallets.find((w) => w.id !== defId)?.id ?? '';
    setWalletId(defId);
    setOtherWalletId(otherId);
    setWalletDefaultsApplied(true);
  }, [isEdit, walletDefaultsApplied, activeWallets]);

  // Initialize form from loaded entry in edit mode
  useEffect(() => {
    if (!isEdit || !entry || initializedId === entry.id) return;
    const isTransfer = entry.type === 'transfer_out' || entry.type === 'transfer_in';
    setIsTransferMode(isTransfer);

    if (isTransfer) {
      setEntryType('expense');
      if (entry.type === 'transfer_out') {
        setWalletId(entry.walletId);
        setOtherWalletId(entry.counterpartWalletId ?? '');
        setPrimaryExpr(formatKeypadValue(entry.amount, entry.currency));
        if (counterpartEntry) {
          setSecondaryExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
        }
      } else {
        setWalletId(entry.counterpartWalletId ?? '');
        setOtherWalletId(entry.walletId);
        setSecondaryExpr(formatKeypadValue(entry.amount, entry.currency));
        if (counterpartEntry) {
          setPrimaryExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
        }
      }
    } else {
      setEntryType(entry.type === 'income' ? 'income' : 'expense');
      setWalletId(entry.walletId);
      setCategoryId(entry.categoryId);
      setPrimaryExpr(formatKeypadValue(entry.amount, entry.currency));
    }

    const hhmm = entry.time && /^\d{2}:\d{2}/.test(entry.time) ? entry.time.slice(0, 5) : '00:00';
    setDateTime(`${entry.date}T${hhmm}`);
    setNote(entry.note ?? '');
    setTags(entry.tags);
    setExcludeFromReports(entry.excludeFromReports);
    setExcludeTouched(true);
    if (entry.excludeFromReports !== isTransfer) {
      setShowMore(true);
    }
    setInitializedId(entry.id);
    if (counterpartEntry) {
      setCounterpartAppliedId(entry.id);
    }
  }, [isEdit, entry, counterpartEntry, initializedId]);

  useEffect(() => {
    if (!isEdit || !entry || !counterpartEntry || counterpartAppliedId === entry.id) return;
    if (entry.type === 'transfer_out') {
      setSecondaryExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
    } else if (entry.type === 'transfer_in') {
      setPrimaryExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
    }
    setCounterpartAppliedId(entry.id);
  }, [isEdit, entry, counterpartEntry, counterpartAppliedId]);

  const selectedWallet = useMemo(
    () =>
      isEdit
        ? allWallets.find((w) => w.id === walletId)
        : (activeWallets.find((w) => w.id === walletId) ?? activeWallets[0]),
    [isEdit, allWallets, activeWallets, walletId],
  );
  const otherWallet = useMemo(
    () =>
      isEdit
        ? allWallets.find((w) => w.id === otherWalletId)
        : (activeWallets.find((w) => w.id === otherWalletId) ??
          activeWallets.find((w) => w.id !== selectedWallet?.id)),
    [isEdit, allWallets, activeWallets, otherWalletId, selectedWallet?.id],
  );

  const fromWallet = isTransferMode
    ? entryType === 'expense'
      ? selectedWallet
      : otherWallet
    : undefined;
  const toWallet = isTransferMode
    ? entryType === 'expense'
      ? otherWallet
      : selectedWallet
    : undefined;

  const hasArchivedWallet =
    isEdit &&
    (isTransferMode
      ? Boolean(fromWallet?.archived || toWallet?.archived)
      : Boolean(selectedWallet?.archived));

  const isDiffCurrencyTransfer =
    isTransferMode &&
    Boolean(fromWallet && toWallet && fromWallet.currency !== toWallet.currency);

  const primaryCurrency: CurrencyCode = selectedWallet?.currency ?? 'VND';
  const secondaryCurrency: CurrencyCode = otherWallet?.currency ?? 'VND';

  const activeCurrency: CurrencyCode =
    isTransferMode && activeTransferField === 'secondary' && isDiffCurrencyTransfer
      ? secondaryCurrency
      : primaryCurrency;

  const activeExpr =
    isTransferMode && activeTransferField === 'secondary' && isDiffCurrencyTransfer
      ? secondaryExpr
      : primaryExpr;

  const spokenAmountRef = useRef('');

  const setActiveExpr = (next: string) => {
    announceSoon(() => spokenAmountRef.current);
    setValidationError(null);
    if (isTransferMode && activeTransferField === 'secondary' && isDiffCurrencyTransfer) {
      setSecondaryExpr(next);
    } else {
      setPrimaryExpr(next);
    }
  };

  const primaryMinor = evaluateAmountExpression(primaryExpr, primaryCurrency);
  const secondaryMinor = evaluateAmountExpression(secondaryExpr, secondaryCurrency);
  const activeMinor =
    isTransferMode && activeTransferField === 'secondary' && isDiffCurrencyTransfer
      ? secondaryMinor
      : primaryMinor;
  const sentMinor = isTransferMode
    ? entryType === 'expense'
      ? primaryMinor
      : secondaryMinor
    : primaryMinor;
  const receivedMinor = isTransferMode
    ? entryType === 'expense'
      ? secondaryMinor
      : primaryMinor
    : null;

  const amountLabelFor = (expr: string, cur: CurrencyCode, evaluated: number | null): string =>
    evaluated !== null
      ? formatMoney(evaluated, cur)
      : expr || t('personalEntry.amountNotEntered');

  const primaryAmountText = amountLabelFor(primaryExpr, primaryCurrency, primaryMinor);
  const secondaryAmountText = amountLabelFor(secondaryExpr, secondaryCurrency, secondaryMinor);
  const secondaryLabel = entryType === 'expense' ? t('personalEntry.amountReceived') : t('personalEntry.amountSent');
  const activeIsSecondary =
    isTransferMode && activeTransferField === 'secondary' && isDiffCurrencyTransfer;
  spokenAmountRef.current = activeIsSecondary
    ? `${secondaryLabel}: ${secondaryAmountText}`
    : t('personalEntry.amountLabel', { amount: primaryAmountText });

  useEffect(() => {
    if (smallAmountConfirm) {
      announce(
        `${t('personalEntry.smallAmountTitle')} ${t('personalEntry.smallAmountBody', {
          amount: formatMoney(smallAmountConfirm.minor, 'VND'),
        })}`,
      );
    }
  }, [smallAmountConfirm]);

  useEffect(() => {
    if (foreignConfirm) {
      announce(
        `${t('personalEntry.foreignTitle', { currency: foreignConfirm.currency })} ${t(
          'personalEntry.foreignBody',
          {
            amount: formatMoney(foreignConfirm.minor, foreignConfirm.currency),
            wallet: foreignConfirm.walletName,
          },
        )}`,
      );
    }
  }, [foreignConfirm]);

  useEffect(() => {
    if (validationError !== null) announce(errorText(validationError, t));
  }, [validationError]);

  const clearCategoryError = () => {
    setCategoryError(false);
    setCategoryRingActive(false);
    if (categoryRingTimerRef.current) {
      clearTimeout(categoryRingTimerRef.current);
      categoryRingTimerRef.current = null;
    }
  };

  const triggerCategoryError = () => {
    setCategoryError(true);
    setCategoryRingActive(true);
    if (categoryRingTimerRef.current) clearTimeout(categoryRingTimerRef.current);
    categoryRingTimerRef.current = setTimeout(() => {
      setCategoryRingActive(false);
      categoryRingTimerRef.current = null;
    }, 1500);
    categoryGridRef.current?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleTabChange = (next: TabValue) => {
    if (next === 'loan-debt') {
      if (isEdit) return;
      setActiveTab('loan-debt');
      setValidationError(null);
      clearCategoryError();
      const params = new URLSearchParams(searchParams);
      params.set('type', 'loan-debt');
      setSearchParams(params, { replace: true });
      return;
    }
    if (isEdit && isTransferMode) return;
    setActiveTab(next);
    setEntryType(next);
    setIsTransferMode(false);
    setActiveTransferField('primary');
    setCategoryId(null);
    setValidationError(null);
    clearCategoryError();
    if (!excludeTouched) {
      setExcludeFromReports(false);
    }
    if (!isEdit) {
      // Coming back from Vay/Nợ (or switching Chi/Thu) on a new entry: amount first again (R4).
      if (activeTab === 'loan-debt') {
        if (isMousePointer) {
          didAutoFocusRef.current = false;
        } else {
          setKeypadOpen(true);
        }
      }
      const params = new URLSearchParams(searchParams);
      params.set('type', next);
      setSearchParams(params, { replace: true });
    }
  };

  const handleLoanDebtSaved = () => {
    showUndo({
      message: t('personalEntry.saved'),
      actionLabel: t('common.close'),
      onAction: () => {},
    });
    goBack();
  };

  const handleSelectTransfer = () => {
    setIsTransferMode(true);
    setCategoryId(null);
    setValidationError(null);
    clearCategoryError();
    if (!excludeTouched) {
      setExcludeFromReports(true);
    }
  };

  const handleSelectCategory = (cid: string) => {
    setIsTransferMode(false);
    setActiveTransferField('primary');
    setCategoryId(cid);
    setValidationError(null);
    clearCategoryError();
    if (!excludeTouched) {
      setExcludeFromReports(false);
    }
  };

  const handleFieldDone = (field: 'primary' | 'secondary') => {
    if (!isTransferMode && !categoryId) {
      const firstTile = categoryGridRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      firstTile?.focus();
      firstTile?.scrollIntoView?.({ block: 'nearest' });
    } else if (
      isTransferMode &&
      isDiffCurrencyTransfer &&
      field === 'primary' &&
      (secondaryMinor === null || secondaryMinor <= 0)
    ) {
      secondaryInputRef.current?.focus();
    } else {
      saveBarRef.current?.querySelector<HTMLButtonElement>('[data-testid="entry-save-btn"]')?.focus();
    }
  };

  const handleKeypadDone = (minor: number) => {
    const formatted = formatKeypadValue(minor, activeCurrency);
    if (formatted !== activeExpr) {
      setActiveExpr(formatted);
    }
    if (!isTransferMode && !categoryId) {
      pendingFocusTargetRef.current = 'category';
    } else if (
      isTransferMode &&
      isDiffCurrencyTransfer &&
      activeTransferField === 'primary' &&
      (secondaryMinor === null || secondaryMinor <= 0)
    ) {
      pendingFocusTargetRef.current = 'secondary';
    } else {
      pendingFocusTargetRef.current = 'save';
    }
    setKeypadOpen(false);
  };

  const isSaving = createEntry.isPending || updateEntry.isPending;

  const handleSave = async (
    doneMinor: number,
    confirmedOverride?: { target: 'primary' | 'secondary'; minor: number },
  ) => {
    if (isSaving || savingRef.current || hasArchivedWallet) return;
    setValidationError(null);

    const [rawDate, rawTime] = dateTime.split('T');
    const date = rawDate || todayLocal();
    const time = rawTime ? rawTime.slice(0, 5) : null;

    let input: EntryInput;
    let lastUsedWalletId: string | null;
    let savedMessage: string;

    const effectivePrimaryMinor =
      confirmedOverride?.target === 'primary' ? confirmedOverride.minor : primaryMinor;
    const effectiveSecondaryMinor =
      confirmedOverride?.target === 'secondary' ? confirmedOverride.minor : secondaryMinor;

    if (isTransferMode) {
      if (!fromWallet || !toWallet || fromWallet.id === toWallet.id) {
        setValidationError(ownError(t('personalEntry.differentWalletsError')));
        return;
      }

      let sent: number;
      let received: number | undefined;

      if (entryType === 'expense') {
        const s =
          confirmedOverride?.target === 'primary'
            ? confirmedOverride.minor
            : activeTransferField === 'primary'
              ? doneMinor
              : effectivePrimaryMinor;
        if (s === null || s <= 0) {
          setActiveTransferField('primary');
          return;
        }
        sent = s;
        if (isDiffCurrencyTransfer) {
          const r =
            confirmedOverride?.target === 'secondary'
              ? confirmedOverride.minor
              : activeTransferField === 'secondary'
                ? doneMinor
                : effectiveSecondaryMinor;
          if (r === null || r <= 0) {
            setActiveTransferField('secondary');
            setValidationError(ownError(t('personalEntry.amountReceivedError')));
            return;
          }
          received = r;
        }
      } else {
        const r =
          confirmedOverride?.target === 'primary'
            ? confirmedOverride.minor
            : activeTransferField === 'primary'
              ? doneMinor
              : effectivePrimaryMinor;
        if (r === null || r <= 0) {
          setActiveTransferField('primary');
          return;
        }
        if (isDiffCurrencyTransfer) {
          const s =
            confirmedOverride?.target === 'secondary'
              ? confirmedOverride.minor
              : activeTransferField === 'secondary'
                ? doneMinor
                : effectiveSecondaryMinor;
          if (s === null || s <= 0) {
            setActiveTransferField('secondary');
            setValidationError(ownError(t('personalEntry.amountReceivedError')));
            return;
          }
          sent = s;
          received = r;
        } else {
          sent = r;
        }
      }

      if (!confirmedOverride) {
        if (fromWallet.currency === 'VND' && sent >= 1 && sent <= 999) {
          const target = entryType === 'expense' || !isDiffCurrencyTransfer ? 'primary' : 'secondary';
          setSmallAmountConfirm({ minor: sent, target });
          return;
        }
        if (
          isDiffCurrencyTransfer &&
          toWallet.currency === 'VND' &&
          received !== undefined &&
          received >= 1 &&
          received <= 999
        ) {
          const target = entryType === 'expense' ? 'secondary' : 'primary';
          setSmallAmountConfirm({ minor: received, target });
          return;
        }
      }

      input = {
        type: 'transfer',
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amountSent: sent,
        ...(received !== undefined ? { amountReceived: received } : {}),
        date,
        time,
        note: note.trim() ? note.trim() : null,
        ...(isEdit ? { tags } : {}),
        excludeFromReports,
      };
      lastUsedWalletId = null; // transfers never change the remembered wallet
      savedMessage = t('personalEntry.savedTransfer', {
        amount: formatMoney(sent, fromWallet.currency),
        wallet: toWallet.name,
      });
    } else {
      if (!selectedWallet) return;
      if (!categoryId) {
        triggerCategoryError();
        return;
      }
      const amountToSave =
        confirmedOverride?.target === 'primary' ? confirmedOverride.minor : doneMinor;
      if (!confirmedOverride && selectedWallet.currency === 'VND' && amountToSave >= 1 && amountToSave <= 999) {
        setSmallAmountConfirm({ minor: amountToSave, target: 'primary' });
        return;
      }
      if (
        !isEdit &&
        !confirmedOverride &&
        selectedWallet.currency !== 'VND' &&
        !foreignConfirmedRef.current
      ) {
        setForeignConfirm({
          minor: amountToSave,
          currency: selectedWallet.currency,
          walletName: selectedWallet.name,
        });
        return;
      }

      input = {
        type: entryType,
        walletId: selectedWallet.id,
        amount: amountToSave,
        categoryId,
        date,
        time,
        note: note.trim() ? note.trim() : null,
        tags: isEdit ? tags : [],
        excludeFromReports,
      };
      lastUsedWalletId = selectedWallet.id;
      const categoryName =
        categoriesQuery.data?.categories.find((c) => c.id === categoryId)?.name ?? '';
      savedMessage = t(
        entryType === 'expense' ? 'personalEntry.savedExpense' : 'personalEntry.savedIncome',
        {
          amount: formatMoney(amountToSave, selectedWallet.currency),
          category: categoryName,
        },
      );
    }

    savingRef.current = true;
    try {
      if (isEdit && id) {
        await updateEntry.mutateAsync({ id, input });
        if (lastUsedWalletId) writeLastWallet(lastUsedWalletId);
        showUndo({
          message: t('personalEntry.saved'),
          actionLabel: t('common.close'),
          onAction: () => {},
        });
      } else {
        const created = await createEntry.mutateAsync(input);
        const createdId = created?.entries?.[0]?.id;
        if (lastUsedWalletId) writeLastWallet(lastUsedWalletId);
        showUndo(
          {
            message: savedMessage,
            actionLabel: t('common.undo'),
            onAction: () => {
              if (createdId) {
                deleteEntry.mutate(createdId);
              }
            },
          },
          5000,
        );
      }
      goBack();
    } catch (err) {
      setValidationError(err);
    } finally {
      savingRef.current = false;
    }
  };

  const hasUnsavedAmount =
    !isEdit &&
    activeTab !== 'loan-debt' &&
    (primaryExpr.trim().length > 0 || (isDiffCurrencyTransfer && secondaryExpr.trim().length > 0));

  const handleBack = () => {
    if (hasUnsavedAmount) {
      wasKeypadOpenBeforeGuardRef.current = keypadOpen;
      setLeaveGuardOpen(true);
      return;
    }
    goBack();
  };

  const handleLeaveGuardKeep = () => {
    setLeaveGuardOpen(false);
    if (wasKeypadOpenBeforeGuardRef.current) {
      setKeypadOpen(true);
      window.setTimeout(() => setKeypadFocusToken((n) => n + 1), 0);
    } else {
      const target = backButtonRef.current?.isConnected
        ? backButtonRef.current
        : primaryButtonRef.current;
      window.setTimeout(() => target?.focus(), 0);
    }
  };

  const editLockedTransfer = isEdit && isTransferMode;

  const impliedRate =
    isDiffCurrencyTransfer && fromWallet && toWallet && sentMinor !== null && receivedMinor !== null
      ? formatImpliedRate(fromWallet.currency, toWallet.currency, sentMinor, receivedMinor)
      : '';

  const renderAmountValue = (expr: string, cur: CurrencyCode, evaluated: number | null, tone: 'neutral' | 'success' | 'danger') => {
    if (evaluated !== null) {
      return <Amount value={evaluated} currency={cur} size="xl" tone={tone} />;
    }
    return (
      <span className={cn('text-2xl tabular-nums text-muted-foreground', expr ? 'font-bold' : 'font-medium')}>
        {expr || formatMoney(0, cur)}
      </span>
    );
  };

  const displayTone = isTransferMode
    ? 'neutral'
    : entryType === 'expense'
      ? 'danger'
      : 'success';

  const excludeRow = (
    <div className="w-full min-h-11 flex items-center justify-between gap-3">
      <Label
        htmlFor="entry-exclude-switch"
        className="flex-1 min-h-11 pl-4 py-3 flex items-center text-sm font-medium text-foreground cursor-pointer"
      >
        {t('personalEntry.excludeFromReports')}
      </Label>
      <div className="pr-4 flex items-center">
        <Switch
          id="entry-exclude-switch"
          checked={excludeFromReports}
          onCheckedChange={(checked) => {
            setExcludeFromReports(checked);
            setExcludeTouched(true);
          }}
          aria-label={t('personalEntry.excludeFromReports')}
          data-testid="entry-exclude-switch"
        />
      </div>
    </div>
  );

  const handleWalletPick = (pickedId: string) => {
    if (walletSheetTarget === 'single') {
      if (isTransferMode && pickedId === otherWallet?.id) {
        setOtherWalletId(selectedWallet?.id ?? '');
      }
      setWalletId(pickedId);
    } else if (walletSheetTarget === 'other') {
      if (pickedId === selectedWallet?.id) {
        setWalletId(otherWallet?.id ?? '');
      }
      setOtherWalletId(pickedId);
    }
    setWalletSheetTarget(null);
  };

  const isLoading = walletsQuery.isPending || (isEdit && !entry && listQuery.isPending);
  const noActiveWallet = !isEdit && !isLoading && !walletsQuery.isError && activeWallets.length === 0;

  useEffect(() => {
    if (
      !isMousePointer ||
      isEdit ||
      activeTab === 'loan-debt' ||
      isLoading ||
      walletsQuery.isError ||
      noActiveWallet ||
      didAutoFocusRef.current
    ) {
      return;
    }
    didAutoFocusRef.current = true;
    primaryInputRef.current?.focus();
  }, [isMousePointer, isEdit, activeTab, isLoading, walletsQuery.isError, noActiveWallet]);

  return (
    <div className="fsl-entry-page min-h-screen min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 h-14 bg-background border-b border-border z-20">
        <div className="h-full flex items-center gap-2 px-4 mx-auto w-full max-w-[480px]">
          <button
            type="button"
            ref={backButtonRef}
            onClick={handleBack}
            aria-label={t('common.back')}
            title={t('common.back')}
            data-testid="entry-back"
            className="inline-flex items-center justify-center size-11 text-foreground rounded-full bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 cursor-pointer border-0"
          >
            <Icon name="back" size={24} />
          </button>

          <Tabs
            value={isEdit ? entryType : activeTab}
            onValueChange={(v) => handleTabChange(v as TabValue)}
            className="flex-1 min-w-0 gap-0"
          >
            <TabsList
              aria-label={t('personalEntry.tabs')}
              className="flex bg-muted rounded-full p-1 gap-1 h-auto w-full"
            >
              <TabsTrigger
                value="expense"
                data-testid="entry-tab-expense"
                className="flex-1 min-w-0 min-h-11 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.expense')}
              </TabsTrigger>
              <TabsTrigger
                value="income"
                disabled={editLockedTransfer}
                data-testid="entry-tab-income"
                className="flex-1 min-w-0 min-h-11 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.income')}
              </TabsTrigger>
              <TabsTrigger
                value="loan-debt"
                disabled={isEdit}
                data-testid="entry-tab-loan-debt"
                className="flex-1 min-w-0 min-h-11 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.loanDebt')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {!isEdit && activeTab === 'loan-debt' ? (
        ledger ? (
          <QuickExpenseEmbed tripId={ledger.tripId} onSaved={handleLoanDebtSaved} />
        ) : (
          <main className="flex-1 mx-auto w-full max-w-[480px] px-4 py-4 flex flex-col gap-4">
            {ledgerLoading ? (
              <SkeletonList rows={4} />
            ) : (
              <InlineError error={{ code: 'UNKNOWN' }} />
            )}
          </main>
        )
      ) : (
        <>
          {liveRegion}
          <main
            className={cn('flex-1 mx-auto w-full max-w-[480px] px-4 py-4 flex flex-col gap-4', !effectiveKeypadOpen && 'pb-24')}
          >
        {isLoading ? (
          <SkeletonList rows={4} />
        ) : walletsQuery.isError ? (
          <InlineError error={walletsQuery.error} onRetry={() => walletsQuery.refetch()} />
        ) : isEdit && !entry && listQuery.isError ? (
          <InlineError error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : isEdit && !entry ? (
          <EmptyState icon="receipt" title={t('personalEntry.notFound')} />
        ) : noActiveWallet ? (
          <EmptyState
            icon="wallet"
            title={t('personalEntry.noWalletTitle')}
            action={
              <Button href="/wallets" variant="primary" block data-testid="entry-go-to-wallets">
                {t('personalEntry.goToWallets')}
              </Button>
            }
          />
        ) : (
          <>
            {hasArchivedWallet && (
              <div data-testid="archived-wallet-notice">
                <InlineError error={ownError(t('personalEntry.archivedWalletNotice'))} />
              </div>
            )}
            {validationError !== null && (
              <InlineError error={validationError} />
            )}

            {/* Display amount */}
            <div ref={amountAreaRef} className="flex flex-col gap-2">
              {isMousePointer ? (
                <AmountField
                  label={t('personalEntry.amountBoxLabel')}
                  value={primaryExpr}
                  currency={primaryCurrency}
                  tone={displayTone}
                  inputRef={primaryInputRef}
                  testId="amount-display"
                  inputTestId="amount-input"
                  disabled={hasArchivedWallet}
                  onFocus={() => setActiveTransferField('primary')}
                  onChange={(next) => {
                    setActiveTransferField('primary');
                    announceSoon(() => spokenAmountRef.current);
                    setValidationError(null);
                    setPrimaryExpr(next);
                  }}
                  onDone={() => handleFieldDone('primary')}
                />
              ) : (
                <button
                  type="button"
                  ref={primaryButtonRef}
                  data-testid="amount-display"
                  aria-label={t('personalEntry.amountLabel', { amount: primaryAmountText })}
                  aria-expanded={keypadOpen && (!isDiffCurrencyTransfer || activeTransferField === 'primary')}
                  onClick={() => {
                    setActiveTransferField('primary');
                    setKeypadOpen(true);
                    setKeypadFocusToken((n) => n + 1);
                  }}
                  className={cn(
                    'w-full rounded-xl bg-card border-0 px-4 py-3 flex items-center justify-between gap-3 min-h-16 cursor-pointer text-right',
                    keypadOpen && (!isDiffCurrencyTransfer || activeTransferField === 'primary') && 'ring-2 ring-primary',
                  )}
                >
                  <span aria-hidden="true" className="text-sm font-medium text-muted-foreground shrink-0">
                    {t('personalEntry.amountBoxLabel')}
                  </span>
                  <span className="flex flex-col items-end tabular-nums min-w-0">
                    {renderAmountValue(primaryExpr, primaryCurrency, primaryMinor, displayTone)}
                  </span>
                </button>
              )}

              {!isTransferMode &&
                selectedWallet &&
                (selectedWallet.currency !== 'VND' || selectedWallet.kind === 'investment') && (
                  <button
                    type="button"
                    data-testid="amount-wallet-chip"
                    aria-label={t('personalEntry.walletChip', {
                      name: selectedWallet.name,
                      currency: selectedWallet.currency,
                    })}
                    onClick={() => setWalletSheetTarget('single')}
                    className="self-start min-h-11 rounded-full bg-warning-soft text-foreground px-3.5 text-sm font-medium border-0 cursor-pointer"
                  >
                    {t('personalEntry.walletChipText', {
                      name: selectedWallet.name,
                      currency: selectedWallet.currency,
                    })}
                  </button>
                )}

              {!isMousePointer &&
                !keypadOpen &&
                primaryCurrency === 'VND' &&
                primaryMinor !== null &&
                primaryMinor >= 1 &&
                primaryMinor <= 999 && (
                  <AmountSuggestionChips
                    value={primaryExpr}
                    currency={primaryCurrency}
                    onSelect={(next) => {
                      setValidationError(null);
                      setPrimaryExpr(next);
                    }}
                    chipClassName="border border-border"
                  />
                )}

              {isDiffCurrencyTransfer && (
                isMousePointer ? (
                  <AmountField
                    label={secondaryLabel}
                    value={secondaryExpr}
                    currency={secondaryCurrency}
                    tone="neutral"
                    inputRef={secondaryInputRef}
                    testId={entryType === 'expense' ? 'amount-received-box' : 'amount-sent-box'}
                    inputTestId={entryType === 'expense' ? 'amount-received-input' : 'amount-sent-input'}
                    disabled={hasArchivedWallet}
                    onFocus={() => setActiveTransferField('secondary')}
                    onChange={(next) => {
                      setActiveTransferField('secondary');
                      announceSoon(() => spokenAmountRef.current);
                      setValidationError(null);
                      setSecondaryExpr(next);
                    }}
                    onDone={() => handleFieldDone('secondary')}
                  />
                ) : (
                  <button
                    type="button"
                    ref={secondaryButtonRef}
                    data-testid={entryType === 'expense' ? 'amount-received-box' : 'amount-sent-box'}
                    aria-label={`${secondaryLabel}: ${secondaryAmountText}`}
                    aria-expanded={keypadOpen && activeTransferField === 'secondary'}
                    onClick={() => {
                      setActiveTransferField('secondary');
                      setKeypadOpen(true);
                      setKeypadFocusToken((n) => n + 1);
                    }}
                    className={cn(
                      'w-full rounded-xl bg-card border-0 px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer',
                      keypadOpen && activeTransferField === 'secondary' && 'ring-2 ring-primary',
                    )}
                  >
                    <span className="text-sm font-medium text-muted-foreground">{secondaryLabel}</span>
                    <div className="flex flex-col items-end">
                      {renderAmountValue(secondaryExpr, secondaryCurrency, secondaryMinor, 'neutral')}
                    </div>
                  </button>
                )
              )}

              {!isMousePointer &&
                !keypadOpen &&
                isDiffCurrencyTransfer &&
                secondaryCurrency === 'VND' &&
                secondaryMinor !== null &&
                secondaryMinor >= 1 &&
                secondaryMinor <= 999 && (
                  <AmountSuggestionChips
                    value={secondaryExpr}
                    currency={secondaryCurrency}
                    onSelect={(next) => {
                      setValidationError(null);
                      setSecondaryExpr(next);
                    }}
                    chipClassName="border border-border"
                  />
                )}

              {impliedRate && (
                <p
                  data-testid="transfer-implied-rate"
                  className="m-0 px-1 text-sm text-muted-foreground tabular-nums"
                >
                  {impliedRate}
                </p>
              )}
            </div>

            {/* Category tiles (with fixed transfer tile) */}
            <CategoryPicker
              type={entryType}
              categories={categoriesQuery.data?.categories ?? []}
              recentIds={categoriesQuery.data?.recentIds ?? []}
              walletKind={selectedWallet?.kind}
              value={categoryId}
              onChange={handleSelectCategory}
              transferSelected={isTransferMode}
              onSelectTransfer={handleSelectTransfer}
              error={categoryError ? t('personalEntry.pickCategoryError') : null}
              highlightError={categoryRingActive}
              gridRef={categoryGridRef}
            />

            {/* Compact rows */}
            <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
              <button
                type="button"
                data-testid="entry-wallet-row"
                onClick={() => setWalletSheetTarget('single')}
                className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-x-0 border-t-0 text-left cursor-pointer hover:bg-muted/50"
              >
                <span className="text-sm font-medium text-muted-foreground">
                  {isTransferMode
                    ? entryType === 'expense'
                      ? t('personalEntry.fromWallet')
                      : t('personalEntry.toWallet')
                    : t('personalEntry.wallet')}
                </span>
                <span className="flex items-center gap-1 text-base font-medium text-foreground">
                  <span>{selectedWallet ? `${selectedWallet.name} (${selectedWallet.currency})` : '—'}</span>
                  <Icon name="chevronRight" size={18} className="text-muted-foreground" />
                </span>
              </button>

              {isTransferMode && (
                <button
                  type="button"
                  data-testid={entryType === 'expense' ? 'entry-to-wallet-row' : 'entry-from-wallet-row'}
                  onClick={() => setWalletSheetTarget('other')}
                  className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-x-0 border-t-0 text-left cursor-pointer hover:bg-muted/50"
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {entryType === 'expense'
                      ? t('personalEntry.toWallet')
                      : t('personalEntry.fromWallet')}
                  </span>
                  <span className="flex items-center gap-1 text-base font-medium text-foreground">
                    <span>{otherWallet ? `${otherWallet.name} (${otherWallet.currency})` : '—'}</span>
                    <Icon name="chevronRight" size={18} className="text-muted-foreground" />
                  </span>
                </button>
              )}

              <EntryDateRow
                date={dateTime.split('T')[0] ?? ''}
                time={dateTime.split('T')[1]?.slice(0, 5) || null}
                onChange={(next) => setDateTime(`${next.date}T${next.time ?? '00:00'}`)}
              />

              <div className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground shrink-0">
                  {t('personalEntry.note')}
                </span>
                <Input
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('personalEntry.notePlaceholder')}
                  data-testid="entry-note-input"
                  className="text-base border-0 shadow-none text-right px-0 focus-visible:ring-0 min-h-11"
                />
              </div>

              {isTransferMode && excludeRow}
            </div>

            {/* More details toggle (not for transfers: the switch is inline above) */}
            {!isTransferMode && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="entry-more-details-toggle"
                  onClick={() => setShowMore((prev) => !prev)}
                  className="min-h-11 px-1 flex items-center justify-between text-sm font-medium text-primary bg-transparent border-0 cursor-pointer"
                >
                  <span>{t('personalEntry.moreDetails')}</span>
                  <Icon name={showMore ? 'chevronUp' : 'chevronDown'} size={18} />
                </button>

                {showMore && (
                  <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                    {excludeRow}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Docked keypad when amount is focused, or BottomBar Save when keypad is closed */}
      {!isLoading && !walletsQuery.isError && !(isEdit && !entry) && !noActiveWallet && (
        effectiveKeypadOpen ? (
          <DockedAmountKeypad
            open={keypadOpen}
            onClose={() => setKeypadOpen(false)}
            onEscape={() => {
              (activeIsSecondary ? secondaryButtonRef : primaryButtonRef).current?.focus();
              setKeypadOpen(false);
            }}
            focusToken={keypadFocusToken}
            tabOutRef={categoryGridRef}
            amountAreaRef={amountAreaRef}
            value={activeExpr}
            currency={activeCurrency}
            onChange={setActiveExpr}
            onDone={handleKeypadDone}
            doneLabel={t('personalEntry.done')}
            deleteLabel={t('personalEntry.deleteDigit')}
            disabled={isSaving || hasArchivedWallet}
          />
        ) : (
          <div ref={saveBarRef} className="contents">
            <BottomBar>
              {(() => {
                const transferDisabledReason = !isTransferMode
                  ? null
                  : !fromWallet || !toWallet || fromWallet.id === toWallet.id
                    ? t('personalEntry.chooseDifferentWallets')
                    : primaryMinor === null
                      ? t('loanDebt.enterAmount')
                      : isDiffCurrencyTransfer && secondaryMinor === null
                        ? t(
                            entryType === 'expense'
                              ? 'personalEntry.enterAmountReceived'
                              : 'personalEntry.enterAmountSent',
                          )
                        : null;
                const saveDisabled = isTransferMode
                  ? transferDisabledReason !== null || isSaving || hasArchivedWallet
                  : activeMinor === null || isSaving || hasArchivedWallet;
                return (
                  <>
                    {transferDisabledReason && !isSaving && !hasArchivedWallet && (
                      <p
                        data-testid="transfer-disabled-reason"
                        className="m-0 text-center text-sm text-muted-foreground"
                      >
                        {transferDisabledReason}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="primary"
                      block
                      loading={isSaving}
                      disabled={saveDisabled}
                      data-testid="entry-save-btn"
                      onClick={() => {
                        if (activeMinor !== null) void handleSave(activeMinor);
                      }}
                    >
                      {t('personalEntry.save')}
                    </Button>
                  </>
                );
              })()}
            </BottomBar>
          </div>
        )
        )}
        </>
      )}

      {/* Wallet picker Sheet */}
      <Sheet
        open={walletSheetTarget !== null}
        onClose={() => setWalletSheetTarget(null)}
        title={t('personalEntry.pickWallet')}
      >
        <div data-testid="wallet-picker-list" className="flex flex-col divide-y divide-border">
          {activeWallets.map((w) => {
            const currentId =
              walletSheetTarget === 'other'
                ? otherWallet?.id
                : selectedWallet?.id;
            const isSelected = w.id === currentId;
            return (
              <button
                key={w.id}
                type="button"
                data-testid={`wallet-option-${w.id}`}
                onClick={() => handleWalletPick(w.id)}
                className="min-h-11 px-2 py-3 flex items-center justify-between gap-3 bg-transparent border-x-0 border-t-0 text-left cursor-pointer hover:bg-muted rounded-xl"
              >
                <div className="flex flex-col">
                  <span className="text-base font-medium text-foreground">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.currency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Amount value={w.balance} currency={w.currency} size="sm" tone="neutral" />
                  {isSelected && <Icon name="check" size={18} className="text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>
      {/* Small-amount guard Modal */}
      <SmallAmountModal
        minor={smallAmountConfirm?.minor ?? null}
        onClose={() => setSmallAmountConfirm(null)}
        disabled={isSaving}
        onKeep={(minor) => {
          if (!smallAmountConfirm) return;
          const { target } = smallAmountConfirm;
          setSmallAmountConfirm(null);
          void handleSave(minor, { target, minor });
        }}
        onMultiply={(multiplied) => {
          if (!smallAmountConfirm) return;
          const { target } = smallAmountConfirm;
          if (target === 'secondary') {
            setSecondaryExpr(formatKeypadValue(multiplied, 'VND'));
          } else {
            setPrimaryExpr(formatKeypadValue(multiplied, 'VND'));
          }
          setSmallAmountConfirm(null);
          void handleSave(multiplied, { target, minor: multiplied });
        }}
      />

      <ForeignWalletModal
        confirm={foreignConfirm}
        onClose={() => setForeignConfirm(null)}
        disabled={isSaving}
        onSave={(minor) => {
          foreignConfirmedRef.current = true;
          setForeignConfirm(null);
          void handleSave(minor, { target: 'primary', minor });
        }}
        onChangeWallet={() => {
          setForeignConfirm(null);
          setWalletSheetTarget('single');
        }}
      />

      {/* Leave guard Modal */}
      <Modal
        open={leaveGuardOpen}
        onClose={handleLeaveGuardKeep}
        title={t('personalEntry.discardTitle')}
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              data-testid="leave-guard-discard"
              className="text-danger border border-danger/40 hover:bg-danger-soft hover:text-danger"
              onClick={() => {
                setLeaveGuardOpen(false);
                goBack();
              }}
            >
              {t('personalEntry.discardConfirm')}
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="leave-guard-keep"
              onClick={handleLeaveGuardKeep}
            >
              {t('personalEntry.discardKeepEditing')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
