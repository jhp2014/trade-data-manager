// 테마↔종목 투영 한 벌 — 전 테마 × 전 종목 배열이라 소비자마다 만들면 그만큼 힙에 남는다.
// (강도 카운트·테마 순위 패널·타점 정보 패널 셋이 같은 물건을 본다.)
//
// 캐시 키는 **인덱스 참조**고, 그게 성립하는 건 `useThemeIndex` 가 인덱스를 **모듈 캐시**로 주기
// 때문이다(거기도 1-엔트리, 키 = RQ data). 컴포넌트마다 새로 서는 파생을 키로 쓰면 1-엔트리 캐시가
// 두 참조 사이를 오가며 매번 미스가 난다 — 실제로 그 회귀를 테스트가 잡았다(2026-09-13).
// 그래서 인덱스를 제 손으로 `buildThemeIndex` 해서 만드는 소비자가 있으면 안 된다.
import { useMemo } from "react";
import type { ThemeIndex } from "@trade-data-manager/market/domain";
import { themeProjectionOf, type ThemeProjection } from "@trade-data-manager/market/domain";
import { useThemeIndex, type ThemeIndexView } from "./useThemeIndex.js";

let cache: { index: ThemeIndex; proj: ThemeProjection } | null = null;

/** 인덱스 참조 키의 모듈 캐시(훅 밖에서도 쓸 수 있게 함수로). */
export function projectionOf(index: ThemeIndex): ThemeProjection {
    if (!cache || cache.index !== index) cache = { index, proj: themeProjectionOf(index) };
    return cache.proj;
}

export interface ThemeProjectionView extends ThemeIndexView {
    proj: ThemeProjection;
}

export function useThemeProjection(): ThemeProjectionView {
    const view = useThemeIndex();
    // 반환 객체 참조 고정 — 소비자의 memo 의존에 통째로 실린다(매 렌더 새 객체면 그 memo 가 매번 깨진다).
    return useMemo(() => ({ ...view, proj: projectionOf(view.index) }), [view]);
}
