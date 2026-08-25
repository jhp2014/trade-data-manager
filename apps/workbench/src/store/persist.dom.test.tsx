// 영속 헬퍼 + **설정 setter 가 실제로 저장하는지**. 후자가 이 파일의 본론이다 — 설정 모달 3화면이
// 통째로 휘발했던 사고가 "setter 를 만들면서 saveJson 을 안 부른" 종류라, 값이 아니라 **기록 여부**를
// 못 박아 둔다. localStorage 를 쓰므로 jsdom(.dom) 이다.
import { describe, it, expect, beforeEach } from "vitest";
import { mergeShape, persistedField } from "./persist.js";
import { useWorkbench } from "./workbench.js";
import { createSettingsSlice } from "./settingsSlice.js";
import { createChartSlice } from "./chartSlice.js";

const stored = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? "null");

beforeEach(() => localStorage.clear());

describe("mergeShape", () => {
    const def = { n: 10, on: true, s: "a" };

    it("기본값과 타입이 같은 필드만 승계한다", () => {
        expect(mergeShape({ n: 3, on: false, s: "b" }, def)).toEqual({ n: 3, on: false, s: "b" });
    });

    it("타입이 어긋난 필드는 기본값으로 되돌린다", () => {
        expect(mergeShape({ n: "20", on: 1 }, def)).toEqual(def);
    });

    it("NaN·Infinity 는 숫자여도 안 받는다", () => {
        expect(mergeShape({ n: Number.NaN }, def)!.n).toBe(10);
        expect(mergeShape({ n: Number.POSITIVE_INFINITY }, def)!.n).toBe(10);
    });

    it("객체가 아니면 null(= 기본값 재생)", () => {
        expect(mergeShape(null, def)).toBeNull();
        expect(mergeShape("x", def)).toBeNull();
    });

    it("저장에 없던 필드(나중에 추가된 설정)는 기본값이 채운다", () => {
        expect(mergeShape({ n: 3 }, def)).toEqual({ n: 3, on: true, s: "a" });
    });
});

describe("persistedField", () => {
    const f = persistedField<number>("wb.test.field", (o) => (typeof o === "number" ? o : null), 7);

    it("저장이 없으면 fallback", () => {
        expect(f.load()).toBe(7);
    });

    it("save 는 기록하고 그 값을 그대로 돌려준다(setter 에서 바로 쓰라고)", () => {
        expect(f.save(42)).toBe(42);
        expect(stored("wb.test.field")).toBe(42);
        expect(f.load()).toBe(42);
    });

    it("모양이 어긋난 저장은 버리고 fallback", () => {
        localStorage.setItem("wb.test.field", JSON.stringify("nope"));
        expect(f.load()).toBe(7);
    });
});

describe("설정 setter 는 전부 localStorage 에 남는다", () => {
    it("복기 top-N", () => {
        useWorkbench.getState().setReplaySettings({ amountN: 33 });
        expect(stored("wb.replaySettings")).toMatchObject({ amountN: 33 });
    });

    it("이슈정리 표시 토글", () => {
        useWorkbench.getState().setThemeBoardSettings({ showUnclassified: false });
        expect(stored("wb.themeBoardSettings")).toMatchObject({ showUnclassified: false });
    });

    it("차트 이동·줌 봉 수", () => {
        useWorkbench.getState().setChartSettings({ jumpBars: 5 });
        expect(stored("wb.chartSettings")).toMatchObject({ jumpBars: 5 });
    });

    it("차트 % 기준 시장", () => {
        useWorkbench.getState().setChartPriceMode("krx");
        expect(stored("wb.chartPriceMode")).toBe("krx");
    });

    it("뉴스 검색 엔진", () => {
        useWorkbench.getState().setNewsSearchEngine("google");
        expect(stored("wb.newsSearchEngine")).toBe("google");
    });

    it("보드 기준 시장은 보드별로 갈린다", () => {
        useWorkbench.getState().setBoardMarket("replay", "krx");
        expect(stored("wb.boardMarket")).toMatchObject({ replay: "krx", theme: "un" });
    });
});

/**
 * **읽는 쪽 절반.** 위 블록이 "setter 가 저장하는가"를 보는 데 반해 여기는 "다음 부팅이 그걸 읽는가"를
 * 본다 — 새로고침마다 설정이 날아가던 버그의 나머지 절반이 이쪽이다. `useWorkbench` 는 모듈 싱글턴이라
 * 새로고침을 흉내 낼 수 없으므로, **슬라이스 생성자를 직접 불러** 그 순간의 localStorage 로 초기값이
 * 서는지 확인한다(persistedField.load 가 값이 아니라 함수인 이유이기도 하다).
 */
const initialOf = <T,>(create: (set: never, get: never, store: never) => T): T =>
    create((() => undefined) as never, (() => ({})) as never, {} as never);

describe("부팅 시 저장된 설정을 읽어 온다", () => {
    it("복기 top-N — 저장이 있으면 그 값으로 슬라이스가 선다", () => {
        localStorage.setItem("wb.replaySettings", JSON.stringify({ amountN: 33, rateN: 40 }));
        expect(initialOf(createSettingsSlice).replaySettings).toEqual({ amountN: 33, rateN: 40 });
    });

    it("저장이 없으면 기본값", () => {
        expect(initialOf(createSettingsSlice).replaySettings).toEqual({ amountN: 80, rateN: 40 });
    });

    it("일부 필드만 저장돼 있으면 나머지는 기본값이 채운다(설정이 나중에 늘어난 경우)", () => {
        localStorage.setItem("wb.chartSettings", JSON.stringify({ jumpBars: 5 }));
        const cs = initialOf(createChartSlice).chartSettings;
        expect(cs.jumpBars).toBe(5);
        expect(cs.minuteZoomBars).toBe(200);
    });

    it("모양이 어긋난 저장은 통째로 버리고 기본값 — 깨진 값으로 부팅하지 않는다", () => {
        localStorage.setItem("wb.chartPriceMode", JSON.stringify("nasdaq"));
        expect(initialOf(createChartSlice).chartPriceMode).toBe("un");
    });
});
