// 골격 겹쳐 그리기의 **표시 토글 한 벌** — 무엇을 보여줄지 정하는 영속 스위치들.
//
// 흩어져 있을 땐 각자 `usePersistedState` 한 줄이라 문제로 안 보였는데, 헤더를 떼어내려니 프롭이
// 열네 개(값 7 + 세터 7)로 늘어났다. 한 벌로 묶으면 헤더가 받는 건 하나다.
//
// ⚠ **키에는 전부 grain 이 붙는다.** 일봉·분봉이 별도 패널이라 둘이 동시에 떠 있고, 키를 공유하면
// 한쪽이 쓴 값이 다른 쪽 몫까지 덮는다(같은 저장소를 두 인스턴스가 각자 들고 있어 서로의 변경을 못 본다).
// 예전에 showFuture·showTheme 둘만 접미사가 빠져 있었다 — 규칙을 한 곳에 모아 두면 다음에 토글이
// 하나 늘 때 그 실수를 반복할 자리가 없다.
//
// 예외는 `anchor` 하나다: 기준 앵커는 **일봉 전용 개념**이고 주인이 하나라 일부러 공유한다.
import type { Dispatch, SetStateAction } from "react";
import { usePersistedState } from "../../store/persist.js";
import type { SkeletonAnchor } from "./skeletonOverlay.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
const bool = (o: unknown): boolean | null => (typeof o === "boolean" ? o : null);

export interface OverlayToggles {
    /** 정규화 기준 피벗(일봉 전용) — 첫 점 / 마지막 점. */
    anchor: SkeletonAnchor;
    setAnchor: Setter<SkeletonAnchor>;
    /** 타점 이후(점선 구간)까지 기본 창에 담나(분봉 전용). */
    showFuture: boolean;
    setShowFuture: Setter<boolean>;
    /** 조사 중인 골격의 기준선·D선을 얹나. */
    showLevels: boolean;
    setShowLevels: Setter<boolean>;
    /** 선 끝의 종목·날짜 라벨. */
    showLabels: boolean;
    setShowLabels: Setter<boolean>;
    /** 분당 거래대금을 **굵기**로 싣나. */
    showAmount: boolean;
    setShowAmount: Setter<boolean>;
    /** 터진 자리에 거래대금 **숫자**를 붙이나. */
    showAmountLabels: boolean;
    setShowAmountLabels: Setter<boolean>;
    /** 같은 테마 종목들의 분당 경로를 같이 세우나(분봉 전용). */
    showTheme: boolean;
    setShowTheme: Setter<boolean>;
}

export function useOverlayToggles(grain: "daily" | "minute"): OverlayToggles {
    const [anchor, setAnchor] = usePersistedState<SkeletonAnchor>(
        "wb.skeletonOverlayAnchor",
        (o) => (o === "first" || o === "last" ? o : null),
        "last",
    );
    const [showFuture, setShowFuture] = usePersistedState<boolean>(`wb.skeletonOverlayFuture.${grain}`, bool, false);
    const [showLevels, setShowLevels] = usePersistedState<boolean>(`wb.skeletonOverlayLevels.${grain}`, bool, true);
    const [showLabels, setShowLabels] = usePersistedState<boolean>(`wb.skeletonOverlayLabels.${grain}`, bool, true);
    const [showAmount, setShowAmount] = usePersistedState<boolean>(`wb.skeletonOverlayAmount.${grain}`, bool, true);
    const [showAmountLabels, setShowAmountLabels] = usePersistedState<boolean>(`wb.skeletonOverlayAmountLabels.${grain}`, bool, false);
    const [showTheme, setShowTheme] = usePersistedState<boolean>(`wb.skeletonOverlayTheme.${grain}`, bool, false);

    return {
        anchor, setAnchor,
        showFuture, setShowFuture,
        showLevels, setShowLevels,
        showLabels, setShowLabels,
        showAmount, setShowAmount,
        showAmountLabels, setShowAmountLabels,
        showTheme, setShowTheme,
    };
}
