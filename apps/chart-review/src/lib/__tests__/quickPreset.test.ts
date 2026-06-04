import { describe, expect, it } from "vitest";
import {
  actionLabel,
  actionSymbol,
  defaultPresetGroups,
  mergePresetIntoManual,
} from "@/lib/quickPreset";

describe("quickPreset", () => {
  it("creates the default 1~4 hotkey groups", () => {
    expect(defaultPresetGroups()).toEqual([
      { hotkey: "1", presets: [] },
      { hotkey: "2", presets: [] },
      { hotkey: "3", presets: [] },
      { hotkey: "4", presets: [] },
    ]);
  });

  it("labels actions for settings and switcher UI", () => {
    expect(actionLabel("overwrite")).toBe("덮어쓰기");
    expect(actionLabel("append")).toBe("추가");
    expect(actionLabel("delete")).toBe("삭제");
    expect(actionSymbol("overwrite")).toBe("=");
    expect(actionSymbol("append")).toBe("+");
    expect(actionSymbol("delete")).toBe("✕");
  });

  it("merges overwrite, append, and delete entries into a full payload", () => {
    const result = mergePresetIntoManual(
      {
        result: "watch",
        tag: "volume | breakout",
        stale: "remove-me",
      },
      [
        { key: "result", action: "overwrite", value: "good" },
        { key: "tag", action: "append", value: "follow-through" },
        { key: "tag", action: "append", value: "volume" },
        { key: "stale", action: "delete", value: "" },
      ],
    );

    expect(result).toEqual({
      payload: {
        result: "good",
        tag: ["volume", "breakout", "follow-through"],
      },
      summary: "m_result=good, m_tag+follow-through, m_stale 삭제",
    });
  });

  it("ignores empty keys and empty values for value actions", () => {
    const result = mergePresetIntoManual(
      { memo: "keep" },
      [
        { key: "", action: "overwrite", value: "ignored" },
        { key: "empty", action: "overwrite", value: " " },
        { key: "alsoEmpty", action: "append", value: "" },
      ],
    );

    expect(result).toEqual({
      payload: { memo: "keep" },
      summary: "",
    });
  });
});
