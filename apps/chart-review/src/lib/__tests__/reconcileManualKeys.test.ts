import { describe, expect, it } from "vitest";
import {
  type ManualKeySettings,
  pruneManualKeysFromSettings,
  renameManualKeyInSettings,
} from "@/lib/reconcileManualKeys";

function makeSettings(over: Partial<ManualKeySettings> = {}): ManualKeySettings {
  return {
    headerFieldKeys: [],
    pointFieldKeys: [],
    exportFieldKeys: [],
    inputKeyOrder: [],
    inputKeyDisabled: [],
    manualFilters: {},
    quickPresetGroups: [{ hotkey: "1", presets: [] }],
    ...over,
  };
}

describe("pruneManualKeysFromSettings", () => {
  it("removes a dead m_ key from every persisted list", () => {
    const s = makeSettings({
      headerFieldKeys: ["m_dead", "m_keep", "stockCode"],
      pointFieldKeys: ["m_dead"],
      exportFieldKeys: ["stockCode", "m_dead", "m_keep"],
      inputKeyOrder: ["m_keep", "m_dead"],
      inputKeyDisabled: ["m_dead"],
      manualFilters: { dead: ["x"], keep: ["y"] },
      quickPresetGroups: [
        {
          hotkey: "1",
          presets: [
            {
              id: "p1",
              name: "a",
              entries: [
                { key: "dead", action: "overwrite", value: "1" },
                { key: "keep", action: "append", value: "2" },
              ],
            },
          ],
        },
      ],
    });

    const next = pruneManualKeysFromSettings(s, (raw) => raw === "dead");
    expect(next).not.toBeNull();
    expect(next!.headerFieldKeys).toEqual(["m_keep", "stockCode"]);
    expect(next!.pointFieldKeys).toEqual([]);
    expect(next!.exportFieldKeys).toEqual(["stockCode", "m_keep"]);
    expect(next!.inputKeyOrder).toEqual(["m_keep"]);
    expect(next!.inputKeyDisabled).toEqual([]);
    expect(next!.manualFilters).toEqual({ keep: ["y"] });
    expect(next!.quickPresetGroups[0].presets[0].entries).toEqual([
      { key: "keep", action: "append", value: "2" },
    ]);
  });

  it("does not touch feature/base keys that share no m_ prefix", () => {
    const s = makeSettings({ exportFieldKeys: ["stockCode", "tradeDate", "lineTargets"] });
    // even if isDead returns true for everything, non-m_ ids must be left alone
    const next = pruneManualKeysFromSettings(s, () => true);
    expect(next).toBeNull(); // nothing prefixed with m_ → no change
  });

  it("reconciles against a live set (removes anything not alive)", () => {
    const s = makeSettings({ exportFieldKeys: ["m_a", "m_b", "m_c", "stockCode"] });
    const live = new Set(["a", "c"]);
    const next = pruneManualKeysFromSettings(s, (raw) => !live.has(raw));
    expect(next!.exportFieldKeys).toEqual(["m_a", "m_c", "stockCode"]);
  });

  it("returns null when nothing changes", () => {
    const s = makeSettings({ exportFieldKeys: ["m_keep", "stockCode"] });
    expect(pruneManualKeysFromSettings(s, (raw) => raw === "dead")).toBeNull();
  });
});

describe("renameManualKeyInSettings", () => {
  it("moves a key id across every persisted list", () => {
    const s = makeSettings({
      headerFieldKeys: ["m_old", "stockCode"],
      exportFieldKeys: ["m_old"],
      inputKeyOrder: ["m_old"],
      manualFilters: { old: ["v"] },
      quickPresetGroups: [
        {
          hotkey: "1",
          presets: [
            { id: "p1", name: "a", entries: [{ key: "old", action: "overwrite", value: "1" }] },
          ],
        },
      ],
    });

    const next = renameManualKeyInSettings(s, "old", "new");
    expect(next).not.toBeNull();
    expect(next!.headerFieldKeys).toEqual(["m_new", "stockCode"]);
    expect(next!.exportFieldKeys).toEqual(["m_new"]);
    expect(next!.inputKeyOrder).toEqual(["m_new"]);
    expect(next!.manualFilters).toEqual({ new: ["v"] });
    expect(next!.quickPresetGroups[0].presets[0].entries[0].key).toBe("new");
  });

  it("returns null for no-op renames or when key is absent", () => {
    const s = makeSettings({ exportFieldKeys: ["m_keep"] });
    expect(renameManualKeyInSettings(s, "x", "x")).toBeNull();
    expect(renameManualKeyInSettings(s, "absent", "other")).toBeNull();
  });
});
