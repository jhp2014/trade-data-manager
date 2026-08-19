// "지금 조사 중인 하나" — 상세(피벗 값·기준선)와 비싼 파생(거래대금·테마·캔들)의 **대상 판정**을
// 한 훅으로 모았다. 규칙 두 벌이 갈리는 지점이 이 파일의 본론이다:
//  · 공짜 상세(inspectKey) = 호버 우선, 없으면 단일 선택.
//  · 비용 있는 파생(singleTarget·dailyTarget) = **단일 선택만** — 호버를 방아쇠로 삼으면 라벨 위를
//    훑기만 해도 날짜가 계속 갈려 스치는 것마다 복기 파생(~15MB)을 당긴다. 선택은 **누른** 것이라
//    왕복이 클릭 수만큼으로 묶인다. 비용이 다르면 규칙도 갈려야 한다.
import { useMemo } from "react";
import type { OverlayLine, PointSkeleton } from "./skeletonOverlay.js";
import type { CandleFocus } from "./useCandles.js";

/**
 * 단일 선택이 가리키는 선 — 없거나 여럿이면 null. 일봉·분봉이 grain 만 다른 같은 파생을 두 벌
 * 들고 있었던 자리(singleTarget/dailyTarget)를 이 헬퍼 하나로 접었다.
 */
export const pickedSingleOf = (
    byKey: ReadonlyMap<string, OverlayLine>,
    effSelected: ReadonlySet<string>,
): OverlayLine | null => (effSelected.size === 1 ? byKey.get([...effSelected][0]) ?? null : null);

/**
 * 지금 짚고 있는 대상 — 캔들을 그릴지 정하는 유일한 기준. null 이면 아무것도 안 짚은 상태(전부 그린다).
 * 골격선 호버는 **선 하나**(키), 테마 라벨·뱃지 호버는 종목 무리.
 * (순수 함수로 따로 있는 이유: 테마 호버는 useThemeOverlay 가 내는 값이라 이 훅 **뒤**에 태어난다 —
 *  패널이 그 값을 받아 이 규칙으로 접는다.)
 */
export const candleFocusOf = (themeHovered: ReadonlySet<string> | null, hovered: string | null): CandleFocus => {
    if (themeHovered) return { kind: "theme", codes: themeHovered };
    if (hovered) return { kind: "line", key: hovered };
    return null;
};

export interface Inspection {
    /** 상세(피벗 값·기준선·타점 세로선)를 받을 "지금 조사 중인 하나" — 호버 우선, 없으면 단일 선택. */
    inspectKey: string | null;
    /** 거래대금·테마가 같이 보는 "지금 조사 중인 선 하나" — 분봉 전용, 단일 선택일 때만(머리 주석). */
    singleTarget: OverlayLine | null;
    /** singleTarget 이 타점 단위일 때 — 테마 오버레이·판독의 원점. */
    pointTarget: PointSkeleton | null;
    /**
     * 일봉 패널에서 짚은 차트 하나 — **캔들 오버레이 전용**(사용자 확정). `singleTarget` 은 분봉 전용이라
     * (거래대금·테마의 재료가 그날 복기 스냅샷이다) 따로 뽑는다. 일봉 캔들은 그 재료를 안 쓴다 —
     * `/chart` 번들의 일봉을 그대로 깔면 되고, 그건 이미 차트 패널들과 캐시를 공유한다.
     */
    dailyTarget: OverlayLine | null;
    /** 캔들의 주인공 — 분봉이면 짚은 타점 선, 일봉이면 짚은 차트 선. 재료(차트 번들)는 한 벌이다. */
    candleAnchor: OverlayLine | null;
    /**
     * 축이 절대값을 같이 읽는 기준 — **타점 하나를 선택했을 때만**(사용자 확정).
     * 뷰 좌표는 그 타점 기준 상대값이라, 축 눈금·크로스헤어에 (벽시계 · 전일比 %)를 나란히 세우면
     * 화면을 옮겨 다니며 값을 환산할 필요가 없어진다. 호버가 아니라 선택을 방아쇠로 삼는 이유:
     * 라벨 위를 스치기만 해도 축 전체가 다시 쓰이면 눈이 붙잡을 기준이 사라진다.
     */
    axisAbs: { baseT: number; baseRate: number } | null;
}

export function useInspection(args: {
    isDaily: boolean;
    byKey: ReadonlyMap<string, OverlayLine>;
    effSelected: ReadonlySet<string>;
    hovered: string | null;
}): Inspection {
    const { isDaily, byKey, effSelected, hovered } = args;

    const inspectKey = hovered ?? (effSelected.size === 1 ? [...effSelected][0] : null);

    const picked = useMemo(() => pickedSingleOf(byKey, effSelected), [byKey, effSelected]);
    const singleTarget = isDaily ? null : picked;
    const dailyTarget = isDaily ? picked : null;
    const pointTarget: PointSkeleton | null = singleTarget?.kind === "point" ? singleTarget : null;
    const candleAnchor: OverlayLine | null = pointTarget ?? dailyTarget;

    const axisAbs = useMemo(
        () => (singleTarget?.kind === "point" ? { baseT: singleTarget.baseT, baseRate: singleTarget.baseRate } : null),
        [singleTarget],
    );

    return { inspectKey, singleTarget, pointTarget, dailyTarget, candleAnchor, axisAbs };
}
