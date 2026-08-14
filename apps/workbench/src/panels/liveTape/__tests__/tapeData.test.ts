import { describe, it, expect } from "vitest";
import type { LiveTapeStock, LiveTapeView } from "@trade-data-manager/wire";
import { machineGaps, mergeTape, segmentsOf } from "../tapeData.js";
import { tapeAmountAt } from "../tapeLayers.js";

// 테이프 클라 반쪽의 계약 — 델타 병합(rev/date/theme 게이트·겹침 분은 새 값)·선분화(빈 분은 끊는다)·
// 기계 결손 판정(틱 없는 연속 분).

const stock = (code: string, minutes: number[], rate: number[], cumAmount?: number[], over: Partial<LiveTapeStock> = {}): LiveTapeStock => ({
    code,
    name: `${code}명`,
    themes: ["로봇"],
    minutes,
    rate,
    cumAmount: cumAmount ?? minutes.map((_, i) => (i + 1) * 100),
    ...over,
});

const view = (over: Partial<LiveTapeView>): LiveTapeView => ({
    date: "2026-08-14",
    rev: 0,
    theme: "로봇",
    since: null,
    ticks: [],
    stocks: [],
    pending: [],
    ...over,
});

describe("mergeTape", () => {
    it("첫 응답·풀 응답(since=null)은 교체", () => {
        const full = view({ ticks: [565, 566], stocks: [stock("005930", [565, 566], [1, 2])] });
        const merged = mergeTape(null, full);
        expect(merged.stocks.get("005930")?.minutes).toEqual([565, 566]);
        // 풀 응답은 언제나 교체 — 직전 누적이 있어도
        const replaced = mergeTape(merged, view({ ticks: [600], stocks: [stock("005930", [600], [5])] }));
        expect(replaced.stocks.get("005930")?.minutes).toEqual([600]);
    });

    it("델타는 겹치는 분(>= since)을 새 값으로 잇는다 — 형성 중이던 분의 재전송", () => {
        const prev = mergeTape(null, view({ ticks: [565, 566], stocks: [stock("005930", [565, 566], [1, 2])] }));
        const delta = view({ since: 566, ticks: [566, 567], stocks: [stock("005930", [566, 567], [2.5, 3])] });
        const merged = mergeTape(prev, delta);
        expect(merged.stocks.get("005930")?.minutes).toEqual([565, 566, 567]);
        expect(merged.stocks.get("005930")?.rate).toEqual([1, 2.5, 3]); // 566 은 새 값이 이김
        expect(merged.ticks).toEqual([565, 566, 567]);
    });

    it("rev 가 다르면(백필로 과거가 채워짐) 델타여도 교체", () => {
        const prev = mergeTape(null, view({ ticks: [565], stocks: [stock("005930", [565], [1])] }));
        const next = mergeTape(prev, view({ rev: 1, since: 565, ticks: [565, 566], stocks: [stock("005930", [540, 565, 566], [0, 1, 2])] }));
        expect(next.stocks.get("005930")?.minutes).toEqual([540, 565, 566]);
    });

    it("델타의 모르는 코드는 그대로 추가(신규 편입), 안 실린 기존 코드는 보존", () => {
        const prev = mergeTape(null, view({ ticks: [565], stocks: [stock("005930", [565], [1])] }));
        const merged = mergeTape(prev, view({ since: 566, ticks: [566], stocks: [stock("000660", [566], [4])] }));
        expect(merged.stocks.get("000660")?.minutes).toEqual([566]);
        expect(merged.stocks.get("005930")?.minutes).toEqual([565]); // 이탈했어도 보유분은 남는다
    });
});

describe("segmentsOf — 빈 분은 잇지 않는다(복기 memberPath 와 반대, 결손이 정보)", () => {
    it("연속 구간마다 한 조각, 끊긴 자리는 조각 경계", () => {
        expect(segmentsOf([565, 566, 570, 571], [1, 2, 3, 4])).toEqual([
            [{ x: 565, y: 1 }, { x: 566, y: 2 }],
            [{ x: 570, y: 3 }, { x: 571, y: 4 }],
        ]);
    });

    it("한 점짜리 조각도 남긴다 — 1분만 떴던 종목도 '떴다'가 보여야 한다", () => {
        expect(segmentsOf([565], [1])).toEqual([[{ x: 565, y: 1 }]]);
    });

    it("빈 입력은 빈 배열", () => {
        expect(segmentsOf([], [])).toEqual([]);
    });
});

describe("machineGaps — 틱 없는 연속 분(회색띠)", () => {
    it("중간 결손과 선두 결손을 구간으로 묶는다", () => {
        expect(machineGaps([542, 543, 547], 540, 547)).toEqual([
            { from: 540, to: 541 },
            { from: 544, to: 546 },
        ]);
    });

    it("틱이 빈틈없으면 결손 없음", () => {
        expect(machineGaps([540, 541, 542], 540, 542)).toEqual([]);
    });
});

describe("tapeAmountAt — 분당 대금(누적 차분), 결손 직후는 모름", () => {
    it("연속 분은 차분, 결손 직후 분은 null(여러 분의 합을 그 분 것으로 안 꾸민다)", () => {
        const at = tapeAmountAt(stock("005930", [565, 566, 570], [1, 2, 3], [100, 250, 900]));
        expect(at(565)).toBe(100); // 첫 분은 누적 그대로(그 분까지의 유일한 관찰)
        expect(at(566)).toBe(150);
        expect(at(570)).toBe(null); // 567~569 결손 — 650 은 4분의 합이라 570 의 값이 아니다
        expect(at(567)).toBe(null); // 자리 자체가 없음
    });
});
