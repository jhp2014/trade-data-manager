// 앵커 표기 레지스트리·표식 계산의 **계약**(2026-08-24 확정, 2026-08-26 차트 패널과 공용화).
//
// 제일 중요한 건 첫 검사다: **도메인 레지스트리 전수가 표기 레지스트리에 있는가.**
// 표기는 param 별 명시라(도메인 성질에서 파생하지 않는다 — 사용자 확정) 새 param 을 등록하고
// 표기를 빠뜨리면 그 param 이 **두 화면(정규화·차트) 어디에도 조용히 안 뜬다** — 이 테스트가 그
// 침묵을 소리로 바꾼다. 레지스트리가 lib/ 로 올라오며 이 검사도 같이 따라왔다(안 따라오면 무방비).
import { describe, it, expect } from "vitest";
import { ANCHOR_PARAMS, BASELINE_PARAM, IGNORE_CANDLE_PARAM, chartAnchorKey, type ChartAnchor } from "@trade-data-manager/market/domain";
import { ANCHOR_DISPLAY, buildMarks, displayOf, stackMarkRows } from "../anchorMarks.js";

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

describe("buildMarks — grain·승자·좌표 보존", () => {
    it("패널과 grain 이 같은 앵커만 — 일봉 앵커는 일봉 화면에, 분봉 앵커는 분봉 화면에", () => {
        const anchors = [
            dailyAnchor("2026-07-01"),
            dailyAnchor("2026-07-08", { anchorTime: "09:30:00" }),
        ];
        const daily = buildMarks(anchors, { minutePanel: false, winnerKey: null });
        const minute = buildMarks(anchors, { minutePanel: true, winnerKey: null });
        expect(daily.map((m) => m.anchorDate)).toEqual(["2026-07-01"]);
        expect(daily.every((m) => m.anchorTime === undefined)).toBe(true);
        expect(minute.map((m) => [m.anchorDate, m.anchorTime])).toEqual([["2026-07-08", "09:30:00"]]);
    });

    it("좌표 원본을 그대로 싣는다 — x 환산은 화면 몫이라 여기서 자를 안 고른다", () => {
        const [m] = buildMarks([dailyAnchor("2026-07-01")], { minutePanel: false, winnerKey: null });
        expect(m).toMatchObject({ anchorDate: "2026-07-01", param: BASELINE_PARAM });
        expect(m).not.toHaveProperty("t");
    });

    it("기준선 승자만 채운 '기준', 나머지는 빈 '후보' — 무시 캔들은 언제나 채운 '무시'", () => {
        const anchors = [
            dailyAnchor("2026-07-01"), // coord 2026-07-01T
            dailyAnchor("2026-07-02"), // coord 2026-07-02T ← 승자로 지정
            { ...CK, param: IGNORE_CANDLE_PARAM, anchorDate: "2026-07-03" },
        ];
        const marks = buildMarks(anchors, { minutePanel: false, winnerKey: chartAnchorKey(anchors[1]) });
        expect(marks.map((m) => [m.short, m.solid])).toEqual([["후보", false], ["기준", true], ["무시", true]]);
    });

    // 실측(2026-08-26)에서 실제로 난 사고: 한 봉에 채운 "기준" 칩이 두 장 서는데 하늘색 가로선은 하나였다.
    // 승자를 좌표(anchorCoordKey)로 지목하면 같은 봉의 기준선이 **전부** 승자로 읽힌다 — 그래서 전체 키다.
    it("같은 봉에 field 만 다른 기준선 둘 — 승자는 하나뿐이다(가로선이 하나뿐이므로)", () => {
        const anchors = [dailyAnchor("2026-07-01", { field: "high" }), dailyAnchor("2026-07-01", { field: "low" })];
        const marks = buildMarks(anchors, { minutePanel: false, winnerKey: chartAnchorKey(anchors[1]) });
        expect(marks.map((m) => [m.short, m.solid])).toEqual([["후보", false], ["기준", true]]);
    });

    it("키가 field·market 까지 가른다 — 같은 봉 두 선이 같은 React key 를 갖지 않는다", () => {
        const anchors = [dailyAnchor("2026-07-01", { field: "high" }), dailyAnchor("2026-07-01", { field: "low" })];
        const marks = buildMarks(anchors, { minutePanel: false, winnerKey: null });
        expect(new Set(marks.map((m) => m.key)).size).toBe(2);
    });

    it("표기 레지스트리에 없는 param 은 안 뜬다 — 그 침묵이 위 전수 검사의 대상이다", () => {
        expect(buildMarks([{ ...CK, param: "ghost-param", anchorDate: "2026-07-01" }], { minutePanel: false, winnerKey: null })).toEqual([]);
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
