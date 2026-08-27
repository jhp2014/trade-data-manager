// 테마 오버레이의 **모드 규칙** — 한 화면에 두 질문을 겹치지 않으려고 구조로 푼 자리.
//
// themeLayer.dom 은 테마가 켜진 화면이 *그려지는지*를 보고, themeSkeleton.test 는 선을 *뽑는 규칙*을
// 본다. 그 사이에 아무도 안 보던 게 **접기(swapped)와 표시(lineShown)** 다 — 테마 선(무채색 얇은 선
// 30개)과 다른 타점의 골격선(역시 무채색 얇은 선 수십~수백)이 같이 깔리면 눈으로 안 갈리므로,
// 다른 골격선을 짚는 동안 테마를 통째로 접는다. 이 두 함수가 골격선 층의 렌더를 좌우한다.
//
// 좌표 이사도 여기서 잰다: 멤버를 **각자 자기 값으로 재기저하지 않고** 절대 공간을 통째로 평행이동한다
// (사용자 확정). 재기저하면 타점 시각의 앵커 대비 %p 간격이 무너져 "내 종목 기준 테마가 어디 있나"가
// 안 읽힌다 — 그림은 여전히 그럴듯하게 나오므로 눈으로는 안 잡히는 종류의 회귀다.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { pct, type PointLine } from "../overlay.js";
import { amountLookupOf } from "../amountLayer.js";
import { useThemeOverlay } from "../useThemeOverlay.js";
import { CODE, DATE, MEMBER, TIME, TIME_MIN, themeSnapshot } from "./overlayFixture.js";

const PK = `${CODE}|${DATE}|${TIME}`;
const OTHER = `000660|${DATE}|09:31:00`;
const HOT = { amountN: 40, rateN: 40 };

/** 짚은 타점 선 — 테마를 펼칠 대상(useNormLines 가 만드는 그 공간을 손으로 최소 구성). */
const target: PointLine = {
    kind: "point", key: PK, chartKey: `${CODE}|${DATE}`, stockCode: CODE, date: DATE, time: TIME,
    basePrice: 9_500, baseRate: pct(12_000, 9_500), baseT: TIME_MIN, splitIdx: 1,
    points: [{ x: -5, y: -2 }, { x: 0, y: 0 }, { x: 5, y: -1 }],
};

const lookup = amountLookupOf(themeSnapshot);

type Args = Parameters<typeof useThemeOverlay>[0];
const BASE: Args = {
    enabled: true, target, snapshot: themeSnapshot, hot: HOT, span: "day", lookup,
    amountWidthOn: false, amountLabelsOn: false, hoveredLine: null, singleKey: PK, groupSet: null,
};
const setup = (over: Partial<Args> = {}): ReturnType<typeof renderHook<ReturnType<typeof useThemeOverlay>, Args>> =>
    renderHook((a: Args) => useThemeOverlay(a), { initialProps: { ...BASE, ...over } });

describe("픽스처 자신 — 대상이 실제로 섰나", () => {
    // 대상이 null 이면 아래 검사가 전부 "테마 안 펼침"을 상대로 헛돈다.
    it("대상의 원점 좌표가 의도대로다", () => {
        expect(target.baseT).toBe(TIME_MIN);
        expect(target.baseRate).toBeCloseTo(pct(12_000, 9_500));
    });
});

describe("펼치는 조건 — 셋이 다 맞아야 한다", () => {
    it("전부 갖추면 펼쳐진다(멤버 1개) — 0개면 아래 검사가 헛돈다", () => {
        const { result } = setup();
        expect(result.current.mode).toBe(true);
        expect(result.current.overlay?.lines.map((l) => l.code)).toEqual([MEMBER]);
    });

    it.each([
        ["꺼져 있으면", { enabled: false }],
        ["짚은 타점이 없으면", { target: null }],
        ["스냅샷이 아직 없으면", { snapshot: undefined }],
    ])("%s 안 펼친다", (_label, over) => {
        const { result } = setup(over as Partial<Args>);
        expect(result.current.overlay).toBeNull();
        expect(result.current.mode).toBe(false);
    });

    it("앵커 자신은 테마 선에 안 든다 — 자기와의 동조는 잴 게 없다", () => {
        expect(setup().result.current.overlay?.lines.some((l) => l.code === CODE)).toBe(false);
    });
});

describe("좌표 이사 — 재기저가 아니라 평행이동", () => {
    it("원점 상수가 앵커 타점의 (시각, 등락률)이다 — 절대값이 상수 하나로 복원된다", () => {
        const { overlay } = setup().result.current;
        expect(overlay?.t0).toBe(TIME_MIN);
        expect(overlay?.baseRate).toBeCloseTo(target.baseRate);
    });

    // ⚠ 멤버를 자기 값으로 재기저하면 여기가 0 이 된다 — 그래도 그림은 그럴듯하게 나온다.
    it("타점 시각의 멤버 값이 **앵커 대비 %p 간격**으로 남는다", () => {
        const { overlay } = setup().result.current;
        const at0 = overlay!.lines[0].segments[0].find((p) => p.x === 0)!;
        expect(at0.y).toBeCloseTo(18 - target.baseRate); // 멤버 18% − 앵커 26.3% ≈ −8.3%p
    });

    it("x 는 타점 시각 기준 분 — 앞뒤로 벌어진다", () => {
        const xs = setup().result.current.overlay!.lines[0].segments[0].map((p) => p.x);
        expect(Math.min(...xs)).toBe(-10);
        expect(Math.max(...xs)).toBe(10);
    });

    it("재적 모드도 같은 평행이동을 탄다 — 조각 좌표가 (t₀, baseRate)만큼 옮겨져 있다", () => {
        const { overlay } = setup({ span: "hot" }).result.current;
        // 픽스처의 두 종목뿐인 보드라 멤버는 내내 재적 → 조각 1개, 하루 모드와 같은 좌표.
        const at0 = overlay!.lines[0].segments[0].find((p) => p.x === 0)!;
        expect(at0.y).toBeCloseTo(18 - target.baseRate);
    });
});

// ⚠ 이 블록이 이 파일의 존재 이유다 — 골격선 층의 렌더가 이 둘로 갈린다.
describe("접기(swapped) — 다른 골격선을 보는 동안엔 테마를 접는다", () => {
    it("아무것도 안 짚으면 안 접는다", () => {
        expect(setup().result.current.swapped).toBe(false);
    });

    it("**다른** 골격선을 짚으면 접는다 — 두 무리가 겹치면 안 갈린다", () => {
        expect(setup({ hoveredLine: OTHER }).result.current.swapped).toBe(true);
    });

    it("테마의 주인(단일 선택) 자신을 짚는 건 안 접는다 — 그건 같은 무리다", () => {
        expect(setup({ hoveredLine: PK }).result.current.swapped).toBe(false);
    });

    it("뭉친 뱃지로 무리를 켜도 접는다 — 그것도 다른 골격선을 보는 손짓이다", () => {
        expect(setup({ groupSet: new Set([OTHER]) }).result.current.swapped).toBe(true);
    });

    it("빈 무리는 안 접는다 — 켠 게 없으면 켠 게 아니다", () => {
        expect(setup({ groupSet: new Set() }).result.current.swapped).toBe(false);
    });

    it("테마가 안 펼쳐졌으면 접을 것도 없다", () => {
        expect(setup({ enabled: false, hoveredLine: OTHER }).result.current.swapped).toBe(false);
    });
});

describe("표시(lineShown) — 테마 모드에선 짚은 것만 남긴다", () => {
    it("테마가 꺼져 있으면 **전부** 그린다 — 평소 화면이다", () => {
        const { lineShown } = setup({ enabled: false }).result.current;
        expect(lineShown(OTHER)).toBe(true);
        expect(lineShown(PK)).toBe(true);
    });

    it("테마 모드에선 단일 선택·짚은 것·뱃지 무리만", () => {
        const { lineShown } = setup({ hoveredLine: OTHER, groupSet: new Set(["g1"]) }).result.current;
        expect(lineShown(PK)).toBe(true);      // 단일 선택(테마의 주인)
        expect(lineShown(OTHER)).toBe(true);   // 짚은 것
        expect(lineShown("g1")).toBe(true);    // 뱃지 무리
        expect(lineShown("아무거나")).toBe(false);
    });

    // 지우면 그 타점들이 화면에서 영영 사라져 이동·선택·사각선택이 다 죽는다 — 라벨은 남는다는 게
    // LabelLayer 의 몫이고, 여기서는 **선만** 접힌다는 걸 못박는다.
    it("접힌 선도 목록에서 사라지는 게 아니다 — 선을 안 그릴 뿐", () => {
        const { result } = setup({ hoveredLine: OTHER });
        expect(result.current.lineShown("숨는 선")).toBe(false);
        expect(result.current.overlay).not.toBeNull(); // 테마 자체는 살아 있다
    });
});

describe("색 — 라벨의 점에만 쓴다", () => {
    it("테마 선마다 고정 색", () => {
        const { colorOf } = setup().result.current;
        expect(colorOf(MEMBER)).toMatch(/^#/);
    });

    it("테마에 없는 종목은 중성색 — 지어내지 않는다", () => {
        expect(setup().result.current.colorOf("999999")).toBe("var(--text-secondary)");
    });
});

describe("굵기 런 — 굵기 **또는** 값 라벨이 켜졌을 때만 굽는다", () => {
    it("둘 다 꺼져 있으면 안 굽는다", () => {
        expect(setup({ amountWidthOn: false, amountLabelsOn: false }).result.current.runs).toBeNull();
    });

    it("굵기를 켜면 테마 선마다 런이 나온다 — 자금 유입 타이밍이 한 화면에 깔린다", () => {
        const { runs } = setup({ amountWidthOn: true }).result.current;
        expect(runs?.get(MEMBER)?.length ?? 0).toBeGreaterThan(0);
    });

    // ⚠ 값 라벨의 재료가 같은 런이다 — 굵기만 보고 거르면 "값 ON·굵기 OFF"에서 앵커 라벨만 서고
    //   멤버 라벨이 조용히 빈다(실측된 결함). 굵기 채널에 싣는 건 화면의 몫(amountWidthOn ? runs : null).
    it("값 라벨만 켜도 굽는다 — 라벨이 같은 런을 먹는다", () => {
        const { runs } = setup({ amountWidthOn: false, amountLabelsOn: true }).result.current;
        expect(runs?.get(MEMBER)?.length ?? 0).toBeGreaterThan(0);
    });
});

describe("대상이 바뀌면 손짓을 접는다", () => {
    it("호버·뱃지가 리셋된다 — 다른 날의 무리라 그대로 두면 뜻이 안 맞는다", () => {
        const { result, rerender } = setup();
        act(() => {
            result.current.setHovered([MEMBER]);
            result.current.openBadge({ x: 1, y: 2 }, [MEMBER]);
        });
        expect(result.current.hovered?.has(MEMBER)).toBe(true);
        expect(result.current.badge).not.toBeNull();

        rerender({ ...BASE, enabled: false }); // 테마가 접히면 overlay.key 가 사라진다
        expect(result.current.hovered).toBeNull();
        expect(result.current.badge).toBeNull();
    });

    it("같은 대상이면 호버가 남는다 — 스치는 동안 리셋되면 값을 못 읽는다", () => {
        const { result, rerender } = setup();
        act(() => result.current.setHovered([MEMBER]));
        rerender({ ...BASE, amountWidthOn: true });
        expect(result.current.hovered?.has(MEMBER)).toBe(true);
    });
});
