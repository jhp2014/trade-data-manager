// 자 읽기(값 복사) — 모드 4조합·저장값 부재·반올림. 연동이 아니라 복사라는 것이 이 표면의 전부다.
import { describe, expect, it } from "vitest";
import { readThemeRuler } from "../rulerRead.js";

describe("readThemeRuler", () => {
    it("순위×순위 — 대금 N·등락 순위, 창은 axes 그대로, 반올림", () => {
        const r = readThemeRuler({ axes: { xMode: "rank", yMode: "rank", windowMin: 30 }, guides: { "x:rank": 41.7, "y:rank": 12.2 } })!;
        expect(r).toEqual({ window: 30, zoneAmountN: 42, rate: { mode: "rank", max: 12 } });
    });

    it("값 모드 y — 등락 값 ≥(소수 1자리), 값 모드 x — 대금 자는 못 가져온다(null)", () => {
        const r = readThemeRuler({ axes: { xMode: "value", yMode: "value", windowMin: null }, guides: { "x:value": 3.2e10, "y:value": 5.34 } })!;
        expect(r).toEqual({ window: null, zoneAmountN: null, rate: { mode: "value", minPct: 5.3 } });
    });

    it("저장값이 하나도 없으면 null — 화면의 자는 뷰 가운데 파생일 뿐이다", () => {
        expect(readThemeRuler({ axes: { xMode: "rank", yMode: "rank", windowMin: null }, guides: {} })).toBeNull();
        expect(readThemeRuler({ axes: { xMode: "rank", yMode: "rank", windowMin: null } })).toBeNull();
        expect(readThemeRuler(undefined)).toBeNull();
    });

    it("축 모드와 다른 키의 저장값은 안 읽는다(모드를 바꾸면 그 모드의 자만)", () => {
        const r = readThemeRuler({ axes: { xMode: "rank", yMode: "rank", windowMin: null }, guides: { "x:value": 100, "y:rank": 7 } })!;
        expect(r).toEqual({ window: null, zoneAmountN: null, rate: { mode: "rank", max: 7 } });
    });
});
