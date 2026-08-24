// 앵커 표기 레지스트리·표식·수준선 줄의 **계약**(2026-08-24 확정)을 못박는다.
//
// 제일 중요한 건 첫 검사다: **도메인 레지스트리 전수가 표기 레지스트리에 있는가.**
// 표기는 param 별 명시라(도메인 성질에서 파생하지 않는다 — 사용자 확정) 새 param 을 등록하고
// 표기를 빠뜨리면 그 param 이 이 패널에서 **조용히 안 뜬다** — 이 테스트가 그 침묵을 소리로 바꾼다.
import { describe, it, expect } from "vitest";
import { ANCHOR_PARAMS, BASELINE_PARAM, IGNORE_CANDLE_PARAM, type ChartAnchor } from "@trade-data-manager/market/domain";
import { ANCHOR_DISPLAY, buildMarks, displayOf, stackMarkRows } from "../anchorDisplay.js";
import { buildLevelRows, type LevelOwner, type NormLevel } from "../LevelsLayer.js";

describe("표기 레지스트리", () => {
    it("도메인 param 전수가 표기를 갖는다 — 누락 = 화면에서 조용히 사라지는 param", () => {
        for (const p of ANCHOR_PARAMS) {
            expect(displayOf(p.key), `param '${p.key}' 의 표기가 ANCHOR_DISPLAY 에 없다`).toBeDefined();
        }
    });

    it("표기 레지스트리에 유령이 없다 — 도메인에 없는 param 의 표기는 죽은 줄이다", () => {
        for (const key of Object.keys(ANCHOR_DISPLAY)) {
            expect(ANCHOR_PARAMS.some((p) => p.key === key), `표기 '${key}' 가 가리키는 param 이 도메인에 없다`).toBe(true);
        }
    });
});

// ── 표식(buildMarks) ────────────────────────────────────────────────────────

const CK = { stockCode: "005930", date: "2026-07-08" };
const dailyAnchor = (anchorDate: string, extra?: Partial<ChartAnchor>): ChartAnchor =>
    ({ ...CK, param: BASELINE_PARAM, anchorDate, field: "low", market: "un", ...extra });

const DATES = ["2026-07-01", "2026-07-02", "2026-07-03"];
const dailyIndexOf = (d: string): number => DATES.indexOf(d);

describe("buildMarks — grain·승자·결손", () => {
    it("패널과 grain 이 같은 앵커만 — 일봉 앵커는 일봉 패널에, 분봉 앵커는 분봉 패널에", () => {
        const anchors = [
            dailyAnchor("2026-07-01"),
            dailyAnchor("2026-07-08", { anchorTime: "09:30:00" }),
        ];
        const daily = buildMarks(anchors, { minutePanel: false, dailyIndexOf, winnerCoord: null });
        const minute = buildMarks(anchors, { minutePanel: true, dailyIndexOf, winnerCoord: null });
        expect(daily.map((m) => m.t)).toEqual([0]); // 일봉 앵커의 번들 인덱스
        expect(minute.map((m) => m.t)).toEqual([9 * 60 + 30]); // 분봉 앵커의 벽시계 분
    });

    it("기준선 승자만 채운 '기준', 나머지는 빈 '후보' — 무시 캔들은 언제나 채운 '무시'", () => {
        const anchors = [
            dailyAnchor("2026-07-01"), // coord 2026-07-01T
            dailyAnchor("2026-07-02"), // coord 2026-07-02T ← 승자로 지정
            { ...CK, param: IGNORE_CANDLE_PARAM, anchorDate: "2026-07-03" },
        ];
        const marks = buildMarks(anchors, { minutePanel: false, dailyIndexOf, winnerCoord: "2026-07-02T" });
        expect(marks.map((m) => [m.short, m.solid])).toEqual([["후보", false], ["기준", true], ["무시", true]]);
    });

    it("번들 창 밖(dailyIndexOf −1)은 버린다 — x 를 지어내지 않는다", () => {
        expect(buildMarks([dailyAnchor("2020-01-01")], { minutePanel: false, dailyIndexOf, winnerCoord: null })).toEqual([]);
    });
});

// ── 계단식 쌓기(stackMarkRows) ──────────────────────────────────────────────

describe("stackMarkRows — 같은 봉이든 이웃 봉이든 한 규칙", () => {
    const xs = (items: { x: number; row: number }[]): [number, number][] => items.map((i) => [i.x, i.row]);

    it("같은 x 는 아래로 쌓인다(같은 봉에 표식 여럿)", () => {
        const rows = stackMarkRows([{ item: "a", x: 100 }, { item: "b", x: 100 }], 28, 2);
        expect(xs(rows)).toEqual([[100, 0], [100, 1]]);
    });

    it("가까운 이웃 봉은 계단으로, 멀면 같은 줄로 — 뭉침을 +N 으로 접지 않는다(x 가 본론이다)", () => {
        const rows = stackMarkRows([{ item: "a", x: 100 }, { item: "b", x: 110 }, { item: "c", x: 200 }], 28, 2);
        expect(xs(rows)).toEqual([[100, 0], [110, 1], [200, 0]]);
    });

    it("입력 순서와 무관 — x 오름차순으로 배치한다", () => {
        const rows = stackMarkRows([{ item: "b", x: 110 }, { item: "a", x: 100 }], 28, 2);
        expect(xs(rows)).toEqual([[100, 0], [110, 1]]);
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
