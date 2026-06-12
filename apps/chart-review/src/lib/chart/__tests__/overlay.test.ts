import { describe, expect, it } from "vitest";
import { assignSeriesColors } from "@/lib/chart/overlay";
import { OVERLAY_SELF_COLOR, OVERLAY_PEER_PALETTE } from "@/lib/colors";
import type { ChartOverlaySeries } from "@/types/chart";

function s(stockCode: string, isSelf: boolean): ChartOverlaySeries {
  return { stockCode, isSelf } as unknown as ChartOverlaySeries;
}

describe("assignSeriesColors", () => {
  it("self 는 self 색, peer 는 인덱스 기준 팔레트 색", () => {
    const map = assignSeriesColors([s("SELF", true), s("P1", false), s("P2", false)]);
    expect(map.get("SELF")).toBe(OVERLAY_SELF_COLOR);
    expect(map.get("P1")).toBe(OVERLAY_PEER_PALETTE[1 % OVERLAY_PEER_PALETTE.length]);
    expect(map.get("P2")).toBe(OVERLAY_PEER_PALETTE[2 % OVERLAY_PEER_PALETTE.length]);
  });
});
