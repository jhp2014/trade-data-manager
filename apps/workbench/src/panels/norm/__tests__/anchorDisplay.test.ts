// 정규화 패널이 **이 화면에서만** 지는 몫의 계약: x 환산(toNormMarks)과 수준선 줄(buildLevelRows).
// 레지스트리·표식 계산·계단식 쌓기는 두 화면 공용이라 lib/__tests__/anchorMarks.test.ts 가 잰다.
import { describe, it, expect } from "vitest";
import { BASELINE_PARAM, type ChartAnchor } from "@trade-data-manager/market/domain";
import { buildMarks } from "../../../lib/anchorMarks.js";
import { toNormMarks } from "../anchorDisplay.js";
import { buildLevelRows, type LevelOwner, type NormLevel } from "../LevelsLayer.js";

// ── x 환산(toNormMarks) ──────────────────────────────────────

const CK = { stockCode: "005930", date: "2026-07-08" };
const dailyAnchor = (anchorDate: string, extra?: Partial<ChartAnchor>): ChartAnchor =>
    ({ ...CK, param: BASELINE_PARAM, anchorDate, field: "low", market: "un", ...extra });

const DATES = ["2026-07-01", "2026-07-02", "2026-07-03"];
const dailyIndexOf = (d: string): number => DATES.indexOf(d);

describe("toNormMarks — 이 패널의 자로 환산", () => {
    it("일봉은 번들 인덱스, 분봉은 벽시계 분 — 선·캔들이 x 를 만들 때 쓴 바로 그 단위", () => {
        const daily = toNormMarks(buildMarks([dailyAnchor("2026-07-02")], { minutePanel: false, winnerKey: null }), { minute: false, dailyIndexOf });
        const minute = toNormMarks(buildMarks([dailyAnchor("2026-07-08", { anchorTime: "09:30:00" })], { minutePanel: true, winnerKey: null }), { minute: true, dailyIndexOf });
        expect(daily.map((m) => m.t)).toEqual([1]);
        expect(minute.map((m) => m.t)).toEqual([9 * 60 + 30]);
    });

    it("번들 창 밖(dailyIndexOf −1)은 버린다 — x 를 지어내지 않는다", () => {
        const marks = buildMarks([dailyAnchor("2020-01-01")], { minutePanel: false, winnerKey: null });
        expect(marks).toHaveLength(1); // 공용 계산은 좌표만 보므로 살아있다
        expect(toNormMarks(marks, { minute: false, dailyIndexOf })).toEqual([]); // 버리는 건 환산하는 쪽
    });
});

// ── 수준선 줄(buildLevelRows) ───────────────────────────────────────────────

const owner = (over?: Partial<LevelOwner["s"]>): LevelOwner => ({
    color: "red",
    s: {
        key: "k", chartKey: "005930|2026-07-08", stockCode: "005930", date: "2026-07-08",
        points: [], basePrice: 10_000, baseRate: 0, baseT: 0, ...over,
    },
});
const BOX = { left: 50, top: 0, width: 400, height: 200 };
const scaleY = (v: number): number => 100 - v; // 0% → y=100

describe("buildLevelRows — 태그·값·상한", () => {
    it("승자는 '기준'(채움) · 후보는 '후보' · 전일 종가선은 '전일 시장' — 값은 일반 규칙 하나다", () => {
        const levels: NormLevel[] = [
            { price: 9_000, baseline: true, minute: true },
            { price: 8_000, baseline: false, minute: true },
            // 전일 종가선의 price = %p 공간의 분모 자신(basePrice) — 그래서 절대값이 정확히 0 이 된다.
            { price: 10_000, baseline: false, zero: "un" },
        ];
        const { rows } = buildLevelRows([owner({ baseRate: 26.3 })], () => levels, scaleY, BOX, true, () => "삼성전자");
        // 줄은 벌리기가 y 순으로 내보낸다 — 종류 대응만 잰다(순서는 값의 몫).
        expect(new Map(rows.map((r) => [r.tag, r.winner]))).toEqual(new Map([["기준", true], ["후보", false], ["전일 UN", false]]));
        // 분봉꼴(baseRate≠0)의 값은 두 개 — 전일 종가선의 절대값은 정확히 0(옛 `0% (…)` 특례의 후임).
        expect(rows.find((r) => r.tag === "전일 UN")!.value).toBe("-26.3% (+0.0%)");
    });

    it("패널과 grain 이 다르면 태그에 접두 — 표식이 왜 없는지의 설명이다", () => {
        const levels: NormLevel[] = [{ price: 9_000, baseline: true, minute: false }];
        const { rows } = buildLevelRows([owner()], () => levels, scaleY, BOX, true, () => "");
        expect(rows[0].tag).toBe("일 기준");
    });

    it("후보만 상한(6)의 예산을 쓴다 — 기준·전일은 언제나 남고, 밀린 후보는 hidden 으로", () => {
        const levels: NormLevel[] = [
            { price: 5_000, baseline: true, minute: false },
            { price: 9_999, baseline: false, zero: "un" },
            ...Array.from({ length: 8 }, (_, i) => ({ price: 6_000 + i * 100, baseline: false, minute: false })),
        ];
        const { rows, hidden } = buildLevelRows([owner()], () => levels, scaleY, BOX, false, () => "");
        expect(rows.filter((r) => r.tag === "후보")).toHaveLength(6);
        expect(rows.some((r) => r.winner)).toBe(true);
        expect(rows.some((r) => r.tag === "전일 UN")).toBe(true);
        expect(hidden).toHaveLength(2);
    });
});
