// 캔들 오버레이의 **상태와 감추기 규칙** — 참고용 배경이 언제 나타나고 언제 물러나나.
//
// candles.test 는 환산(원주가/스냅샷 → 뷰 공간)을 보고, overlayInteraction.dom 은 켜는 손짓을 본다.
// 그 사이에 안 덮여 있던 게 **감추기**다: 다른 라벨을 짚는 동안엔 봉이 잠시 사라진다(사용자 확정).
// 그 순간의 질문은 "이 선 vs 저 선"이라 봉이 깔려 있으면 선끼리의 비교를 방해하기 때문이다.
//
// ⚠ 판정 단위가 종목이 아니라 **선**이라는 게 이 규칙의 핵심이다(사용자 확정): 같은 종목의 형제 선
//   (한 차트의 타점 여럿)을 짚을 때도 그건 비교하는 중이므로 자기 봉이 물러나야 한다. 종목으로 재면
//   그 순간 봉이 남아 형제 선끼리의 비교를 방해한다 — 눈으로는 "가끔 안 사라지네" 정도로만 보인다.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ChartBundle } from "@trade-data-manager/wire";
import { seededClient } from "../../../test/renderPanel.js";
import { pointSkeletons, normalizeSkeleton, type OverlayLine, type PointSkeleton } from "../skeletonOverlay.js";
import { useCandles, type CandleFocus } from "../useCandles.js";
import { CODE, DATE, MEMBER, TIME, themeSnapshot, skeletonFeed } from "./overlayFixture.js";

const TIME2 = "09:35:00";
const PK = `${CODE}|${DATE}|${TIME}`;
const SIBLING = `${CODE}|${DATE}|${TIME2}`; // **같은 종목**의 형제 선(타점만 다르다)

const chart = { key: `${CODE}|${DATE}`, stockCode: CODE, date: DATE };
const [pointTarget, sibling] = pointSkeletons(
    skeletonFeed.minute[0].pivots, skeletonFeed.minute[0].prevClose,
    [{ pk: PK, time: TIME }, { pk: SIBLING, time: TIME2 }], chart,
) as [PointSkeleton, PointSkeleton];

const dailyLine = normalizeSkeleton(skeletonFeed.daily[0].pivots, "last", chart)!;

/** 앵커 캔들의 재료 — 안 심으면 네트워크 그물에 걸린다(그게 의도다). */
const bar = { open: "12000", high: "12100", low: "11900", close: "12000", volume: "100" };
const bundle: ChartBundle = {
    stockCode: CODE,
    daily: [{ stockCode: CODE, date: DATE, krx: { ...bar, amount: "1000000" }, un: { ...bar, amount: "1000000" } }],
    minutes: [{ stockCode: CODE, date: DATE, time: TIME, krx: bar, un: bar }],
    basePrice: { krx: 9_500, un: 9_500 },
};

const wrapper = ({ children }: { children: ReactNode }): JSX.Element =>
    <QueryClientProvider client={seededClient({ charts: [{ code: CODE, date: DATE, data: bundle }] })}>{children}</QueryClientProvider>;

type Args = Parameters<typeof useCandles>[0];
const BASE: Args = {
    anchor: pointTarget, pointTarget, dailyTarget: null,
    snapshot: themeSnapshot, focus: null, nameOf: (c) => c, grain: "minute",
};
const setup = (over: Partial<Args> = {}): ReturnType<typeof renderHook<ReturnType<typeof useCandles>, Args>> =>
    renderHook((a: Args) => useCandles(a), { wrapper, initialProps: { ...BASE, ...over } });

describe("픽스처 자신 — 형제 선이 실제로 둘 섰나", () => {
    // 하나만 서면 "선 단위 판정"을 종목 단위와 구분할 수 없다.
    it("같은 종목·같은 차트의 타점 둘이 서로 다른 선이다", () => {
        expect(pointTarget.key).toBe(PK);
        expect(sibling.key).toBe(SIBLING);
        expect(sibling.stockCode).toBe(pointTarget.stockCode); // 종목은 같다
        expect(sibling.baseT).not.toBe(pointTarget.baseT);     // 원점(타점 시각)만 다르다
    });
});

describe("켜고 끄기 — 상태는 '켠 종목 집합' 하나뿐", () => {
    it("처음엔 아무것도 안 켜져 있다", () => {
        const { result } = setup();
        expect(result.current.codes.size).toBe(0);
        expect(result.current.set).toBeNull();
        expect(result.current.anchorOn).toBe(false);
    });

    it("누르면 켜지고 다시 누르면 꺼진다", () => {
        const { result } = setup();
        act(() => result.current.toggle(MEMBER));
        expect(result.current.codes.has(MEMBER)).toBe(true);
        act(() => result.current.toggle(MEMBER));
        expect(result.current.codes.has(MEMBER)).toBe(false);
    });

    it("전부 끄기", () => {
        const { result } = setup();
        act(() => { result.current.toggle(MEMBER); result.current.toggle(CODE); });
        act(() => result.current.clear());
        expect(result.current.codes.size).toBe(0);
    });

    // 다른 날·다른 종목의 무리라 그대로 두면 뜻이 안 맞는다.
    it("짚은 선이 바뀌면 켠 것들이 접힌다", () => {
        const { result, rerender } = setup();
        act(() => result.current.toggle(MEMBER));
        expect(result.current.codes.size).toBe(1);

        rerender({ ...BASE, anchor: dailyLine as OverlayLine });
        expect(result.current.codes.size).toBe(0);
    });
});

describe("그릴 것 — 앵커는 원주가, 멤버는 스냅샷", () => {
    it("아무것도 안 켜면 그릴 게 없다", () => {
        expect(setup().result.current.set).toBeNull();
    });

    it("테마 멤버를 켜면 그 봉이 나온다 — 이미 받은 스냅샷이라 공짜", () => {
        const { result } = setup();
        act(() => result.current.toggle(MEMBER));
        expect(result.current.set?.members.map((m) => m.code)).toEqual([MEMBER]);
        expect(result.current.set?.members[0].candles.length ?? 0).toBeGreaterThan(0);
    });

    it("스냅샷에 없는 종목은 조용히 빠진다 — 지어내지 않는다", () => {
        const { result } = setup();
        act(() => result.current.toggle("999999"));
        expect(result.current.set?.members ?? []).toHaveLength(0);
    });

    it("앵커는 멤버 목록에 안 든다 — 소스가 다르다(원주가 vs 스냅샷)", () => {
        const { result } = setup();
        act(() => result.current.toggle(CODE));
        expect(result.current.anchorOn).toBe(true);
        expect(result.current.set?.members).toHaveLength(0);
    });

    it("일봉이면 앵커 하나뿐 — 테마는 분봉 화면의 개념", () => {
        const { result } = setup({ anchor: dailyLine, pointTarget: null, dailyTarget: dailyLine, grain: "daily" });
        act(() => result.current.toggle(CODE));
        expect(result.current.set?.daily).toBe(true);
        expect(result.current.set?.members).toHaveLength(0);
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다.
describe("감추기 — 다른 라벨을 짚는 동안엔 물러난다", () => {
    const withAnchorOn = (focus: CandleFocus): ReturnType<typeof useCandles> => {
        const { result, rerender } = setup();
        act(() => result.current.toggle(CODE));
        rerender({ ...BASE, focus });
        return result.current;
    };

    it("아무것도 안 짚으면 그린다 — 평소 화면", () => {
        expect(withAnchorOn(null).anchorShown).toBe(true);
    });

    it("자기 선을 짚으면 그대로 그린다 — 그건 이 선을 보는 중이다", () => {
        expect(withAnchorOn({ kind: "line", key: PK }).anchorShown).toBe(true);
    });

    it("다른 선을 짚으면 감춘다 — 그 순간의 질문은 '이 선 vs 저 선'이다", () => {
        expect(withAnchorOn({ kind: "line", key: `000660|${DATE}|09:30:00` }).anchorShown).toBe(false);
    });

    // ⚠ 종목으로 재면 여기가 true 가 된다 — 자기 봉이 남아 형제 선끼리의 비교를 방해한다.
    it("**같은 종목의 형제 선**을 짚어도 감춘다 — 판정 단위는 종목이 아니라 선이다", () => {
        expect(withAnchorOn({ kind: "line", key: SIBLING }).anchorShown).toBe(false);
    });

    it("테마 라벨을 짚으면 앵커는 감춘다 — 지금 보는 건 테마 쪽이다", () => {
        expect(withAnchorOn({ kind: "theme", codes: new Set([MEMBER]) }).anchorShown).toBe(false);
    });
});

describe("감추기 — 테마 멤버는 종목으로 잰다(손잡이가 종목 단위라서)", () => {
    const withMemberOn = (focus: CandleFocus): ReturnType<typeof useCandles> => {
        const { result, rerender } = setup();
        act(() => result.current.toggle(MEMBER));
        rerender({ ...BASE, focus });
        return result.current;
    };

    it("아무것도 안 짚으면 그린다", () => {
        expect(withMemberOn(null).memberShown(MEMBER)).toBe(true);
    });

    it("그 종목의 테마 라벨을 짚으면 그린다", () => {
        expect(withMemberOn({ kind: "theme", codes: new Set([MEMBER]) }).memberShown(MEMBER)).toBe(true);
    });

    it("다른 종목의 테마 라벨을 짚으면 감춘다", () => {
        expect(withMemberOn({ kind: "theme", codes: new Set(["999999"]) }).memberShown(MEMBER)).toBe(false);
    });

    it("골격선을 짚는 동안엔 멤버 봉도 물러난다 — 그때 보는 건 선이다", () => {
        expect(withMemberOn({ kind: "line", key: PK }).memberShown(MEMBER)).toBe(false);
    });
});

describe("진하기 — 헤더 단계 × (멤버면 한 겹 뒤)", () => {
    it("멤버가 앵커보다 흐리다 — 주인공이 누구인지 진하기로도 남는다", () => {
        const { result } = setup();
        expect(result.current.opacityOf(true)).toBeLessThan(result.current.opacityOf(false));
    });

    it("단계를 올리면 둘 다 진해진다", () => {
        const { result } = setup();
        const before = result.current.opacityOf(false);
        act(() => result.current.setAlpha("high"));
        expect(result.current.opacityOf(false)).toBeGreaterThan(before);
    });

    it("감추기는 진하기에 안 든다 — 물러남과 사라짐은 다른 층이 판정한다", () => {
        const { result, rerender } = setup();
        const shown = result.current.opacityOf(false);
        rerender({ ...BASE, focus: { kind: "line", key: SIBLING } });
        expect(result.current.opacityOf(false)).toBe(shown); // 값은 그대로, anchorShown 이 false 일 뿐
        expect(result.current.anchorShown).toBe(false);
    });
});
