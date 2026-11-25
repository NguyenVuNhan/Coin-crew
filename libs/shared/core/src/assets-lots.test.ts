import { describe, expect, it } from "vitest";
import {
  assetQuantityLabel,
  assetUnitText,
  isLotAsset,
  parseQuantity,
  quantityInputDecimals,
} from "./assets";

describe('lot assets (unit === "")', () => {
  it("identifies lot assets and requires whole-number input decimals", () => {
    const btcLot = { name: "BTC", unit: "", decimals: 4 };
    const unitOne = { name: "VNM", unit: "", decimals: 0 };
    const goldWord = { name: "Vàng", unit: "chỉ", decimals: 2 };

    expect(isLotAsset(btcLot)).toBe(true);
    expect(isLotAsset(unitOne)).toBe(true);
    expect(isLotAsset(goldWord)).toBe(false);

    expect(quantityInputDecimals(btcLot)).toBe(0);
    expect(quantityInputDecimals(unitOne)).toBe(0);
    expect(quantityInputDecimals(goldWord)).toBe(2);
  });

  it("parses typed lot count as stored smallest units and formats back with asset.decimals", () => {
    const btcLot = { name: "BTC", unit: "", decimals: 4 };
    const parsed = parseQuantity("1", quantityInputDecimals(btcLot));
    expect(parsed).toBe(1);
    expect(parseQuantity("0,5", quantityInputDecimals(btcLot))).toBeNull();
    expect(assetUnitText(btcLot)).toBe("0,0001");
    expect(assetQuantityLabel(parsed!, btcLot)).toBe("0,0001 BTC");
  });
});
