// 정규화 겹치기의 **표시 토글 한 벌** — 무엇을 어떻게 보여줄지 정하는 영속 스위치들.
//
// 흩어져 있을 땐 각자 `usePersistedState` 한 줄이라 문제로 안 보였는데, 헤더를 떼어내려니 프롭이
// 값·세터 십수 개로 늘어났다. 한 벌로 묶으면 헤더가 받는 건 하나다.
//
// ⚠ **키에는 전부 grain 이 붙는다.** 일봉·분봉이 별도 패널이라 둘이 동시에 떠 있고, 키를 공유하면
// 한쪽이 쓴 값이 다른 쪽 몫까지 덮는다. 예외는 dailyMarket 하나 — 일봉 전용 개념이라 주인이 하나다.
// (키 접두 wb.norm* — 옛 wb.skeletonOverlay* 는 골격 은퇴와 함께 버린다. 옛 값 이관 없음.)
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { usePersistedState } from "../../store/persist.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
const bool = (o: unknown): boolean | null => (typeof o === "boolean" ? o : null);

/** 그리기 모드 — 자동은 항목 수가 정한다(적으면 캔들, 많으면 선 — 사용자 확정: 기본은 캔들). */
export type DrawMode = "auto" | "candles" | "lines";

/**
 * 전일 종가선(0%) — **분봉 전용**. 끄기 / UN / KRX 3택(사용자 확정).
 * 분봉 %p 공간은 타점 시각을 원점으로 끌어내려 "진짜 0%"가 선마다 흩어진다 — 그 자리를 되돌려 놓는다.
 * 시장을 고르는 이유: 분모가 UN 전일 종가라 UN 선은 정확히 −baseRate 지만, KRX 전일 종가는 다를 수
 * 있고(NXT·정규장 종가 괴리) **그 간격 자체가 정보**다.
 */
export type ZeroLine = "off" | "un" | "krx";

/** 자동 모드의 캔들 상한 — 이 수를 넘으면 종가선(겹친 캔들은 서로를 가린다). */
export const AUTO_CANDLE_MAX = 3;

export interface OverlayToggles {
    /** 그리기 모드(자동/캔들/선). 실제 적용값은 패널이 항목 수와 함께 정한다(effMode). */
    mode: DrawMode;
    setMode: Setter<DrawMode>;
    /** 일봉 전용 — 어느 시장의 봉·원점(전일 종가)인가. 봉과 원점이 **함께** 갈린다(사용자 확정). */
    dailyMarket: "krx" | "un";
    setDailyMarket: Setter<"krx" | "un">;
    /** 타점 이후(점선 구간)까지 기본 창에 담나(분봉 전용). */
    showFuture: boolean;
    setShowFuture: Setter<boolean>;
    /** 시선 항목의 기준선·D선을 얹나. */
    showLevels: boolean;
    setShowLevels: Setter<boolean>;
    /** 전일 종가선(0%)을 얹나 — 분봉 전용, 어느 시장 종가인지까지 이 값이 진다. */
    zeroLine: ZeroLine;
    setZeroLine: Setter<ZeroLine>;
    /** 선 끝의 종목·날짜 라벨. */
    showLabels: boolean;
    setShowLabels: Setter<boolean>;
    /** 분당 거래대금을 **굵기**로 싣나(분봉 전용). */
    showAmount: boolean;
    setShowAmount: Setter<boolean>;
    /** 터진 자리에 거래대금 **숫자**를 붙이나(분봉 전용). */
    showAmountLabels: boolean;
    setShowAmountLabels: Setter<boolean>;
    /** 같은 테마 종목들의 분당 경로를 같이 세우나(분봉 전용). */
    showTheme: boolean;
    setShowTheme: Setter<boolean>;
}

export function useOverlayToggles(grain: "daily" | "minute"): OverlayToggles {
    const [mode, setMode] = usePersistedState<DrawMode>(
        `wb.normMode.${grain}`,
        (o) => (o === "auto" || o === "candles" || o === "lines" ? o : null),
        "auto",
    );
    const [dailyMarket, setDailyMarket] = usePersistedState<"krx" | "un">(
        "wb.normDailyMarket",
        (o) => (o === "krx" || o === "un" ? o : null),
        "un",
    );
    const [showFuture, setShowFuture] = usePersistedState<boolean>(`wb.normFuture.${grain}`, bool, false);
    const [showLevels, setShowLevels] = usePersistedState<boolean>(`wb.normLevels.${grain}`, bool, true);
    const [zeroLine, setZeroLine] = usePersistedState<ZeroLine>(
        `wb.normZeroLine.${grain}`,
        (o) => (o === "off" || o === "un" || o === "krx" ? o : null),
        "un",
    );
    const [showLabels, setShowLabels] = usePersistedState<boolean>(`wb.normLabels.${grain}`, bool, true);
    const [showAmount, setShowAmount] = usePersistedState<boolean>(`wb.normAmount.${grain}`, bool, true);
    const [showAmountLabels, setShowAmountLabels] = usePersistedState<boolean>(`wb.normAmountLabels.${grain}`, bool, false);
    const [showTheme, setShowTheme] = usePersistedState<boolean>(`wb.normTheme.${grain}`, bool, false);

    // 한 벌 객체는 memo — 매 렌더 새로 만들면 이걸 통째로 받는 머리글(React.memo)이 값이 그대로여도
    // 매번 다시 그린다. 세터들은 useState 산(産)이라 전부 안정이고, 값들이 곧 의존성 전부다.
    return useMemo(() => ({
        mode, setMode,
        dailyMarket, setDailyMarket,
        showFuture, setShowFuture,
        showLevels, setShowLevels,
        zeroLine, setZeroLine,
        showLabels, setShowLabels,
        showAmount, setShowAmount,
        showAmountLabels, setShowAmountLabels,
        showTheme, setShowTheme,
    }), [
        mode, setMode, dailyMarket, setDailyMarket, showFuture, setShowFuture, showLevels, setShowLevels,
        zeroLine, setZeroLine,
        showLabels, setShowLabels, showAmount, setShowAmount, showAmountLabels, setShowAmountLabels, showTheme, setShowTheme,
    ]);
}
