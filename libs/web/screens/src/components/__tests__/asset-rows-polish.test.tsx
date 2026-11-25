import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssetView, BookRow, EntryView, WalletDetailView } from "@cc/core";
import { setLang } from "@cc/web-i18n";
import { mockApi, renderAt } from "../../test/render";
import { AssetsScreen } from "../../screens/AssetsScreen";
import { AssetPicker } from "../AssetPicker";
import { TransactionRow } from "../TransactionRow";

const meOn = {
  user: {
    id: "u-1",
    email: "me@example.com",
    name: "Me",
    consentAt: "2026-10-12T00:00:00.000Z",
  },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const lotBtc: AssetView = {
  id: "a-btc",
  name: "BTC",
  unit: "",
  groupName: "Crypto",
  decimals: 4,
  icon: "crypto:btc",
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const wordGold: AssetView = {
  id: "a-gold",
  name: "Vàng SJC",
  unit: "chỉ",
  groupName: "Vàng",
  decimals: 2,
  icon: null,
  hidden: false,
  sortOrder: 1,
  entryCount: 0,
};

const investWallet: WalletDetailView = {
  id: "w-inv",
  name: "Binance",
  currency: "USDT",
  balance: 1_000_000,
  isDefault: false,
  kind: "investment",
  startAmount: 1_000_000,
  startDate: "2026-01-01",
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 2,
};

function makeTradeRow(type: "buy" | "sell"): BookRow {
  const entry: EntryView = {
    id: `e-${type}`,
    walletId: "w-inv",
    type,
    amount: type === "buy" ? -500_000 : 600_000,
    currency: "USDT",
    categoryId: null,
    assetId: "a-btc",
    quantity: 100,
    date: "2026-11-20",
    time: null,
    note: null,
    tags: [],
    excludeFromReports: false,
    source: "manual",
    counterpartWalletId: null,
    transferId: null,
    beforeStart: false,
    createdAt: "2026-11-20T00:00:00.000Z",
  };
  return { kind: "entry", entry };
}

describe("Asset rows, AssetPicker rows, and trade TransactionRow polish (#132)", () => {
  it("AssetsScreen shows AssetIcon, step/unit subtitle, Switch hide toggle, row-tap edit, and delete-only action", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      "GET /api/me": meOn,
      "GET /api/me/ledger": { ledger: null },
      "GET /api/me/personal/assets": { assets: [lotBtc, wordGold] },
      "PATCH /api/me/personal/assets/a-btc": {
        asset: { ...lotBtc, hidden: true },
      },
    });

    renderAt(<AssetsScreen />, { route: "/personal/assets" });
    act(() => setLang("vi"));

    const btcRow = await screen.findByTestId("asset-row-a-btc");
    const goldRow = screen.getByTestId("asset-row-a-gold");

    expect(within(btcRow).getByTestId("asset-icon")).toBeInTheDocument();
    expect(within(goldRow).getByTestId("asset-icon")).toBeInTheDocument();

    expect(within(btcRow).getByText("lẻ đến 0,0001")).toBeInTheDocument();
    expect(within(goldRow).getByText("chỉ")).toBeInTheDocument();

    const switches = within(btcRow).getAllByRole("switch");
    expect(switches).toHaveLength(1);
    expect(switches[0]).toHaveAttribute(
      "data-testid",
      "asset-toggle-hidden-a-btc",
    );
    expect(within(btcRow).queryByRole("button", { name: "Ẩn BTC" })).toBeNull();

    // Only delete action is present in row actions (no edit or toggle-hidden action buttons).
    expect(
      within(btcRow).getByRole("button", { name: "Xóa" }),
    ).toBeInTheDocument();
    expect(within(btcRow).queryByRole("button", { name: "Sửa" })).toBeNull();
    expect(within(btcRow).queryByRole("button", { name: "Ẩn" })).toBeNull();
    expect(within(btcRow).queryByRole("button", { name: "Hiện" })).toBeNull();

    await user.click(switches[0]!);
    await waitFor(() => {
      const patch = calls.find(
        (c) =>
          c.method === "PATCH" && c.path === "/api/me/personal/assets/a-btc",
      );
      expect(patch?.body).toEqual({ hidden: true });
    });

    // Row tap edits via ActionRow openTestId
    await user.click(within(btcRow).getByTestId("asset-edit-a-btc"));
    expect(await screen.findByTestId("asset-form")).toBeInTheDocument();
  });

  it("AssetPicker rows show AssetIcon and step/unit subtitle", async () => {
    renderAt(
      <AssetPicker
        open
        onClose={vi.fn()}
        assets={[lotBtc, wordGold]}
        value={null}
        onSelect={vi.fn()}
      />,
    );
    act(() => setLang("vi"));

    const btcOpt = await screen.findByTestId("asset-option-a-btc");
    const goldOpt = screen.getByTestId("asset-option-a-gold");

    expect(within(btcOpt).getByTestId("asset-icon")).toBeInTheDocument();
    expect(within(btcOpt).getByText("lẻ đến 0,0001")).toBeInTheDocument();

    expect(within(goldOpt).getByTestId("asset-icon")).toBeInTheDocument();
    expect(within(goldOpt).getByText("chỉ")).toBeInTheDocument();
  });

  it("TransactionRow for buy/sell shows AssetIcon with direction badge and neutral amount", () => {
    const { unmount } = renderAt(
      <TransactionRow
        row={makeTradeRow("buy")}
        wallets={[investWallet]}
        assets={[lotBtc]}
      />,
    );
    act(() => setLang("vi"));

    const buyRow = screen.getByTestId("tx-row-e-buy");
    expect(within(buyRow).getByTestId("asset-icon")).toBeInTheDocument();
    expect(
      within(buyRow).getByTestId("trade-direction-buy"),
    ).toBeInTheDocument();
    const buyAmount = buyRow.querySelector(".fsl-tx-row__amount")!;
    expect(buyAmount.className).not.toContain("text-danger");
    expect(buyAmount.className).not.toContain("text-success");
    expect(buyAmount.querySelector(".text-danger, .text-success")).toBeNull();

    unmount();
    renderAt(
      <TransactionRow
        row={makeTradeRow("sell")}
        wallets={[investWallet]}
        assets={[lotBtc]}
      />,
    );

    const sellRow = screen.getByTestId("tx-row-e-sell");
    expect(within(sellRow).getByTestId("asset-icon")).toBeInTheDocument();
    expect(
      within(sellRow).getByTestId("trade-direction-sell"),
    ).toBeInTheDocument();
    const sellAmount = sellRow.querySelector(".fsl-tx-row__amount")!;
    expect(sellAmount.className).not.toContain("text-danger");
    expect(sellAmount.className).not.toContain("text-success");
    expect(sellAmount.querySelector(".text-danger, .text-success")).toBeNull();
  });
});
