import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CategoryView,
  EntryView,
  GroupRow,
  GroupSettingsView,
  ListRow,
  TripView,
  WalletDetailView,
} from "@cc/core";
import { renderAt, mockApi } from "../../test/render";
import { mockMedia } from "../../test/media";
import { tripView } from "../../test/fixtures";
import { App } from "../../App";

const { useCopyListMock, useCopyGroupRowsMock } = vi.hoisted(() => ({
  useCopyListMock: vi.fn(),
  useCopyGroupRowsMock: vi.fn(),
}));

vi.mock("@cc/web-data-access/txCopy/hooks", () => ({
  useCopyList: (...args: unknown[]) => useCopyListMock(...args),
  useTxCopy: () => ({ status: "unavailable", snapshot: null }),
}));

vi.mock("@cc/web-data-access/txCopy/groupCopy", () => ({
  useCopyGroupRows: (...args: unknown[]) => useCopyGroupRowsMock(...args),
}));

beforeEach(() => {
  localStorage.clear();
  useCopyListMock.mockReset();
  useCopyListMock.mockReturnValue({ rows: null, ready: false, opening: false });
  useCopyGroupRowsMock.mockReset();
  useCopyGroupRowsMock.mockReturnValue({ groupRows: null, ready: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOff = {
  user: {
    id: "u-me",
    email: "me@example.com",
    name: "Me",
    consentAt: "2026-10-12T00:00:00.000Z",
  },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};
const meOn = { ...meOff, personalArea: true };

const wallets: WalletDetailView[] = [
  {
    id: "w-bank",
    name: "Techcombank",
    kind: "everyday",
    currency: "VND",
    balance: 4_000_000,
    startAmount: 4_000_000,
    startDate: "2026-11-01",
    startCostVnd: null,
    vndValue: 4_000_000,
    icon: "bg-avatar-1",
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 2,
  },
  {
    id: "w-cash",
    name: "Tiền mặt",
    kind: "everyday",
    currency: "VND",
    balance: 1_000_000,
    startAmount: 1_000_000,
    startDate: "2026-11-01",
    startCostVnd: null,
    vndValue: 1_000_000,
    icon: "bg-avatar-2",
    sortOrder: 1,
    archived: false,
    isDefault: false,
    entryCount: 1,
  },
];

const categories: CategoryView[] = [
  {
    id: "cat-food",
    parentId: null,
    type: "expense",
    name: "Ăn uống",
    icon: "utensils",
    hidden: false,
    sortOrder: 0,
  },
  {
    id: "cat-group",
    parentId: null,
    type: "expense",
    name: "Nhóm",
    icon: "users",
    hidden: false,
    sortOrder: 1,
  },
];

const defaultSettings: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: "e-1",
    walletId: "w-bank",
    type: "expense",
    amount: 50_000,
    currency: "VND",
    categoryId: "cat-food",
    transferId: null,
    counterpartWalletId: null,
    date: "2026-11-18",
    time: "09:00",
    note: "Phở sáng",
    tags: [],
    excludeFromReports: false,
    source: "manual",
    beforeStart: false,
    createdAt: "2026-11-18T09:00:00.000Z",
    ...overrides,
  };
}

function makeGroupRow(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: "group",
    activityAt: "2026-11-01T00:00:00.000Z",
    id: "g-1",
    rootId: "root-g-1",
    tripId: "t-dalat",
    tripName: "Đà Lạt",
    isDirect: false,
    source: "expense",
    date: "2026-11-17",
    title: "Lẩu tối",
    total: 300_000,
    myShare: 100_000,
    iPaid: true,
    payerName: "Me",
    counterpartName: null,
    people: ["Minh", "Lan"],
    pending: false,
    link: null,
    createdAt: "2026-11-17T19:00:00.000Z",
    ...overrides,
  };
}

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: "t-led",
      name: "Quick expenses",
      currency: "VND",
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 240_000,
    },
    me: {
      kind: "member",
      participantId: "p-me",
      participantPending: false,
      isOrganiser: true,
    },
    people: [
      {
        id: "p-me",
        name: "Me",
        status: "active",
        isMember: true,
        bank: "approved",
      },
      {
        id: "p-minh",
        name: "Minh",
        status: "active",
        isMember: false,
        bank: "none",
      },
    ],
    expenses: [
      {
        id: "e-taxi",
        description: "Taxi",
        amount: 240_000,
        spentOn: "2026-11-15",
        payerId: "p-me",
        mode: "equal",
        status: "approved",
        rejectReason: null,
        disabledByName: null,
        createdById: "p-me",
        shares: [
          { participantId: "p-me", amount: 120_000, inputValue: 1 },
          { participantId: "p-minh", amount: 120_000, inputValue: 1 },
        ],
      },
    ],
    payments: [
      {
        id: "pay-1",
        fromId: "p-minh",
        toId: "p-me",
        amountClaimed: 120_000,
        amountConfirmed: 120_000,
        status: "confirmed",
        notArrived: false,
        createdAt: "2026-11-16T08:00:00.000Z",
        disabledByName: null,
      },
    ],
  });
}

function setupMock({
  me = meOn,
  rows = [],
  groupRows = [],
  settings = defaultSettings,
}: {
  me?: unknown;
  rows?: ListRow[];
  groupRows?: GroupRow[];
  settings?: GroupSettingsView;
} = {}) {
  return mockApi({
    "GET /api/me": me,
    "GET /api/me/ledger": { tripId: "t-led", ownerPid: "p-me" },
    "GET /api/me/people/summary": { people: [], incomplete: false },
    "GET /api/trips/t-led": ledgerView(),
    "GET /api/trips/t-led/version": { version: 1 },
    "GET /api/me/personal/wallets": { wallets },
    "GET /api/me/personal/categories": { categories, recentIds: [] },
    "GET /api/me/personal/tags": { tags: [] },
    "GET /api/me/personal/assets": { assets: [] },
    "GET /api/me/personal/group-settings": { settings },
    "GET /api/me/personal/balance-checks": { walletIds: [] },
    "GET /api/me/personal/summary": {
      month: "2026-11",
      totalVnd: 5_000_000,
      approximate: false,
      perCurrency: [{ currency: "VND", balance: 5_000_000 }],
      unratedWalletIds: [],
      spent: [],
      income: [],
    },
    "GET /api/me/personal/transactions": (
      _init: RequestInit | undefined,
      url: string,
    ) => {
      const parsed = new URL(url, "http://localhost");
      const showGroups = parsed.searchParams.get("groups") === "show";
      return Response.json({
        rows,
        totals: [],
        ...(showGroups ? { groupRows } : {}),
      });
    },
  });
}

describe("Group shares wired into Sổ chi tiêu screens", () => {
  it("recent list interleaves entries and group rows by newest activity and requests recent=5 with groups=show", async () => {
    mockMedia();
    const eNew = makeEntry({
      id: "e-new",
      date: "2026-11-18",
      createdAt: "2026-11-18T10:00:00.000Z",
    });
    const gMid = makeGroupRow({
      id: "g-mid",
      date: "2026-11-17",
      title: "Lẩu tối",
      activityAt: "2026-11-17T09:00:00.000Z",
    });
    const eOld = makeEntry({
      id: "e-old",
      date: "2026-11-16",
      createdAt: "2026-11-16T08:00:00.000Z",
    });
    const gOld = makeGroupRow({
      id: "g-old",
      date: "2026-11-15",
      title: "Taxi sân bay",
      activityAt: "2026-11-15T09:00:00.000Z",
    });

    const { fetchMock } = setupMock({
      rows: [
        { kind: "entry", entry: eNew },
        { kind: "entry", entry: eOld },
      ],
      groupRows: [gOld, gMid],
    });

    renderAt(<App />, { route: "/trips" });

    const recent = await screen.findByTestId("book-recent");
    const rendered = await within(recent).findAllByTestId(/^tx-row-/);
    expect(rendered.map((el) => el.getAttribute("data-testid"))).toEqual([
      "tx-row-e-new",
      "tx-row-g-g-mid",
      "tx-row-e-old",
      "tx-row-g-g-old",
    ]);

    const txUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((u) => u.includes("/api/me/personal/transactions"));
    expect(
      txUrls.some((u) => u.includes("groups=show") && u.includes("recent=5")),
    ).toBe(true);
  });

  it("/transactions by day and by category include group rows and their totals", async () => {
    mockMedia();
    const user = userEvent.setup();
    const entry = makeEntry({
      id: "e-pho",
      date: "2026-11-16",
      amount: 50_000,
      categoryId: "cat-food",
      createdAt: "2026-11-16T08:00:00.000Z",
    });
    const groupFood = makeGroupRow({
      id: "g-lau",
      date: "2026-11-16",
      title: "Lẩu tối",
      total: 300_000,
      myShare: 100_000,
      link: {
        walletId: null,
        categoryId: "cat-food",
        tagIds: [],
        intent: null,
        excludeFromReports: false,
      },
      createdAt: "2026-11-16T19:00:00.000Z",
    });
    const groupUncat = makeGroupRow({
      id: "g-taxi",
      date: "2026-11-15",
      title: "Taxi",
      total: 240_000,
      myShare: 80_000,
      iPaid: false,
      payerName: "Hùng",
      link: null,
      createdAt: "2026-11-15T12:00:00.000Z",
    });

    setupMock({
      rows: [{ kind: "entry", entry }],
      groupRows: [groupFood, groupUncat],
    });

    renderAt(<App />, { route: "/transactions?month=2026-11" });

    // By day: 2026-11-16 has entry (−50.000) + groupFood (−100.000) = −150.000₫, newest first
    const day16 = await screen.findByTestId("tx-group-2026-11-16");
    expect(within(day16).getByText("−150.000₫")).toBeInTheDocument();
    const day16Rows = within(day16).getAllByTestId(/^tx-row-/);
    expect(day16Rows.map((el) => el.getAttribute("data-testid"))).toEqual([
      "tx-row-g-g-lau",
      "tx-row-e-pho",
    ]);

    const day15 = screen.getByTestId("tx-group-2026-11-15");
    expect(within(day15).getByTestId("tx-row-g-g-taxi")).toBeInTheDocument();
    expect(
      within(day15).getAllByText("−80.000₫").length,
    ).toBeGreaterThanOrEqual(2);

    // Switch to "by category"
    await user.click(screen.getByTestId("tx-view-toggle"));

    const foodGroup = await screen.findByTestId("tx-group-cat:cat-food");
    expect(within(foodGroup).getByTestId("tx-row-e-pho")).toBeInTheDocument();
    expect(within(foodGroup).getByTestId("tx-row-g-g-lau")).toBeInTheDocument();
    expect(within(foodGroup).getByText("−150.000₫")).toBeInTheDocument();

    const nhomGroup = screen.getByTestId("tx-group-cat:cat-group");
    expect(
      within(nhomGroup).getByTestId("tx-row-g-g-taxi"),
    ).toBeInTheDocument();
    expect(
      within(nhomGroup).getByRole("heading", { name: "Nhóm" }),
    ).toBeInTheDocument();
  });

  it("/transactions uses useCopyGroupRows when the local copy is ready", async () => {
    mockMedia();
    const copyEntry = makeEntry({ id: "e-copy", date: "2026-11-16" });
    const copyGroup = makeGroupRow({
      id: "g-copy",
      date: "2026-11-17",
      title: "Copy dinner",
    });
    useCopyListMock.mockReturnValue({
      rows: [{ kind: "entry", entry: copyEntry }],
      ready: true,
      opening: false,
    });
    useCopyGroupRowsMock.mockReturnValue({
      groupRows: [copyGroup],
      ready: true,
    });
    const { calls } = setupMock();

    renderAt(<App />, { route: "/transactions?month=2026-11" });

    expect(await screen.findByTestId("tx-row-g-g-copy")).toBeInTheDocument();
    expect(screen.getByTestId("tx-row-e-copy")).toBeInTheDocument();
    expect(
      calls.filter((c) => c.path.startsWith("/api/me/personal/transactions")),
    ).toHaveLength(0);
  });

  it("wallet history shows only group rows whose resolved wallet is this wallet", async () => {
    mockMedia();
    const entryCash = makeEntry({
      id: "e-cash",
      walletId: "w-cash",
      date: "2026-11-16",
    });
    const groupOnDefault = makeGroupRow({
      id: "g-default",
      date: "2026-11-17",
      title: "Default wallet dinner",
      link: null,
    });
    const groupOnCash = makeGroupRow({
      id: "g-cash",
      date: "2026-11-18",
      title: "Cash wallet coffee",
      link: {
        walletId: "w-cash",
        categoryId: null,
        tagIds: [],
        intent: null,
        excludeFromReports: false,
      },
    });

    setupMock({
      rows: [{ kind: "entry", entry: entryCash }],
      groupRows: [groupOnDefault, groupOnCash],
    });

    renderAt(<App />, { route: "/wallets/w-cash" });

    const list = await screen.findByTestId("wallet-entries");
    expect(within(list).getByTestId("tx-row-g-g-cash")).toBeInTheDocument();
    expect(within(list).getByTestId("tx-row-e-cash")).toBeInTheDocument();
    expect(
      within(list).queryByTestId("tx-row-g-g-default"),
    ).not.toBeInTheDocument();
  });

  it("Home with book true renders neither ExpenseList nor PaymentsList (phone and wide)", async () => {
    mockMedia({ wide: false });
    setupMock({ rows: [], groupRows: [] });
    const phone = renderAt(<App />, { route: "/trips" });

    await screen.findByTestId("book-total");
    await screen.findByTestId("book-recent");
    expect(phone.container.querySelector(".fsl-expense-list")).toBeNull();
    expect(phone.container.querySelector(".fsl-payments")).toBeNull();
    phone.unmount();

    mockMedia({ wide: true });
    setupMock({ rows: [], groupRows: [] });
    const wideView = renderAt(<App />, { route: "/trips" });

    await screen.findByTestId("book-total");
    await screen.findByTestId("book-recent");
    expect(wideView.container.querySelector(".fsl-expense-list")).toBeNull();
    expect(wideView.container.querySelector(".fsl-payments")).toBeNull();
  });

  it("Home with book false is unchanged and makes no groups=show request", async () => {
    mockMedia({ wide: false });
    const { fetchMock } = setupMock({ me: meOff });
    const { container } = renderAt(<App />, { route: "/trips" });

    expect(await screen.findByTestId("home-total")).toBeInTheDocument();
    expect(await screen.findByText("Taxi")).toBeInTheDocument();
    expect(container.querySelector(".fsl-expense-list")).toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((u) => u.includes("groups=show"))).toBe(false);
    expect(urls.some((u) => u.includes("/api/me/personal"))).toBe(false);
  });

  it("tapping a group row opens GroupRowSheet on BookRecent, /transactions, and WalletScreen", async () => {
    mockMedia();
    const user = userEvent.setup();
    const gRow = makeGroupRow({
      id: "g-tap",
      title: "Lẩu Đà Lạt",
      link: {
        walletId: "w-cash",
        categoryId: null,
        tagIds: [],
        intent: null,
        excludeFromReports: false,
      },
    });

    // 1. BookRecent
    setupMock({ rows: [], groupRows: [gRow] });
    const recentView = renderAt(<App />, { route: "/trips" });
    await user.click(await screen.findByTestId("tx-row-g-g-tap"));
    expect(await screen.findByTestId("group-row-sheet")).toBeInTheDocument();
    recentView.unmount();

    // 2. TransactionsScreen
    setupMock({ rows: [], groupRows: [gRow] });
    const txView = renderAt(<App />, { route: "/transactions?month=2026-11" });
    await user.click(await screen.findByTestId("tx-row-g-g-tap"));
    expect(await screen.findByTestId("group-row-sheet")).toBeInTheDocument();
    txView.unmount();

    // 3. WalletScreen
    setupMock({ rows: [], groupRows: [gRow] });
    renderAt(<App />, { route: "/wallets/w-cash" });
    await user.click(await screen.findByTestId("tx-row-g-g-tap"));
    expect(await screen.findByTestId("group-row-sheet")).toBeInTheDocument();
  });
});

describe("Giao dịch gần đây: newest activity first", () => {
  const idsIn = async () => {
    const recent = await screen.findByTestId("book-recent");
    const rendered = await within(recent).findAllByTestId(/^tx-row-/);
    return rendered.map((el) => el.getAttribute("data-testid"));
  };

  it("asks for recent=5 across all months and orders newest activity first with stable ties", async () => {
    mockMedia();
    const confirmedOldPayment = makeGroupRow({
      id: "g-confirmed",
      source: "payment",
      date: "2026-10-02",
      title: "Thanh toán cũ mới xác nhận",
      createdAt: "2026-10-02T09:00:00.000Z",
      activityAt: "2026-11-21T15:00:00.000Z",
    });
    const lastMonthAddedNow = makeEntry({
      id: "e-last-month",
      date: "2026-10-20",
      note: "Chi tháng trước vừa thêm",
      createdAt: "2026-11-21T14:00:00.000Z",
    });
    const tieA = makeEntry({
      id: "a-tie",
      date: "2026-11-18",
      createdAt: "2026-11-21T12:00:00.000Z",
    });
    const tieB = makeGroupRow({
      id: "b-tie",
      date: "2026-11-19",
      createdAt: "2026-11-19T08:00:00.000Z",
      activityAt: "2026-11-21T12:00:00.000Z",
    });
    const olderEntry = makeEntry({
      id: "e-older",
      date: "2026-11-21",
      createdAt: "2026-11-21T08:00:00.000Z",
    });
    const droppedSixth = makeEntry({
      id: "e-sixth",
      date: "2026-11-21",
      createdAt: "2026-11-20T08:00:00.000Z",
    });

    const { fetchMock } = setupMock({
      rows: [droppedSixth, olderEntry, tieA, lastMonthAddedNow].map(
        (entry) => ({ kind: "entry" as const, entry }),
      ),
      groupRows: [tieB, confirmedOldPayment],
    });
    renderAt(<App />, { route: "/trips" });

    expect(await idsIn()).toEqual([
      "tx-row-g-g-confirmed",
      "tx-row-e-last-month",
      "tx-row-a-tie",
      "tx-row-g-b-tie",
      "tx-row-e-older",
    ]);
    const txUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((u) => u.includes("/api/me/personal/transactions"));
    expect(
      txUrls.some((u) => u.includes("recent=5") && u.includes("groups=show")),
    ).toBe(true);
    expect(txUrls.some((u) => u.includes("month="))).toBe(false);
  });

  it("puts a payment confirmed just now above an entry with a later date", async () => {
    mockMedia();
    setupMock({
      rows: [
        {
          kind: "entry",
          entry: makeEntry({
            id: "e-later-date",
            date: "2026-11-20",
            createdAt: "2026-11-20T09:00:00.000Z",
          }),
        },
      ],
      groupRows: [
        makeGroupRow({
          id: "g-pay",
          source: "payment",
          date: "2026-11-01",
          createdAt: "2026-11-01T08:00:00.000Z",
          activityAt: "2026-11-21T15:30:00.000Z",
        }),
      ],
    });
    renderAt(<App />, { route: "/trips" });

    expect(await idsIn()).toEqual(["tx-row-g-g-pay", "tx-row-e-later-date"]);
  });
});
