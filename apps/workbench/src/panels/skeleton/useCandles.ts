// 캔들 오버레이의 **상태와 재료** — 골격 겹쳐 그리기의 참고용 배경.
//
// 그리기는 CandleLayer 가, 손짓의 뜻은 여기가 안다. 이 층이 통째로 떨어져 나올 수 있는 건 상태가
// 하나(`켠 종목 집합`)뿐이고 나머지가 전부 그것의 파생이기 때문이다 — 층 분리의 표본으로 삼기 좋은 이유.
//
// ## 켜는 손짓 = 선(또는 그 라벨) 클릭
// 누르고 있어야만 보이던 시절엔 값을 읽는 동안 손이 묶였다. 전역 토글·단축키도 폐기했다: 어차피
// "어느 종목의 캔들이냐"를 골라야 하므로 **고르는 손짓이 곧 켜는 손짓**이면 상태가 하나 줄어든다.
//
// ## 앵커 재료는 차트 번들 그대로
// `/chart`(원주가 dense 분봉 + volume + 2년 일봉)를 종목·날짜로 통째로 받는다. RQ 키가 차트 패널·
// 필터 패널과 **같아서** 그 날짜가 이미 떠 있으면 왕복이 0이다(딸려오는 일봉/분봉 중 안 쓰는 쪽은 버린다).
// 테마 멤버는 이미 받은 그날 스냅샷이라 공짜.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { chartQuery } from "../../api/queries.js";
import { usePersistedState } from "../../store/persist.js";
import { anchorCandles, memberCandles, dailyOverlayCandles, type ViewCandle } from "./candles.js";
import { minuteIndexOf, type OverlayLine, type PointSkeleton } from "./skeletonOverlay.js";
import type { DayReplay } from "@trade-data-manager/wire";

/** 캔들 선명도 단계 — 배경(low) / 기본(mid) / 같이 읽기(high). */
export type CandleAlpha = "low" | "mid" | "high";
const CANDLE_ALPHA: Record<CandleAlpha, number> = { low: 0.18, mid: 0.35, high: 0.7 };
/** 테마 멤버 캔들은 앵커보다 한 겹 뒤 — 주인공이 누구인지 진하기로도 남는다. */
const CANDLE_MEMBER_RATIO = 0.8;

/** 그릴 캔들 한 벌 — 앵커(주인공) + 켜 둔 테마 멤버들. `daily` 면 마커 정책이 갈린다(고가 등락률 vs 거래대금 구간). */
export interface CandleSet {
    anchor: ViewCandle[];
    members: { code: string; name: string; candles: ViewCandle[] }[];
    daily: boolean;
}

/** 지금 짚고 있는 대상 — 캔들을 감출지 정하는 유일한 기준. null 이면 아무것도 안 짚은 상태. */
export type CandleFocus = { kind: "line"; key: string } | { kind: "theme"; codes: ReadonlySet<string> } | null;

export interface CandlesView {
    /** 헤더 선명도 칩(패널이 그린다 — 이 층의 상태지만 자리는 헤더다). */
    alpha: CandleAlpha;
    setAlpha: (a: CandleAlpha) => void;
    /** 켠 종목 집합 — 라벨의 밑줄·툴팁 문구가 이걸 읽는다. */
    codes: ReadonlySet<string>;
    /** 켜고 끄기. 선·라벨·목록 어디서 눌러도 같은 자리로 들어온다. */
    toggle: (code: string) => void;
    clear: () => void;
    /** 그릴 것(없으면 null). */
    set: CandleSet | null;
    /** 앵커 캔들이 켜져 있나 — 푸터 이름 줄이 쓴다. */
    anchorOn: boolean;
    anchorLoading: boolean;
    /** 지금 그리나 — 다른 라벨을 짚는 동안엔 감춘다(아래 규칙). */
    anchorShown: boolean;
    memberShown: (code: string) => boolean;
    /** 진하기 — 헤더 단계 × (멤버면 한 겹 뒤). */
    opacityOf: (member: boolean) => number;
}

export interface UseCandlesArgs {
    /** 캔들의 주인공 — 분봉이면 짚은 타점 선, 일봉이면 짚은 차트 선. 재료(차트 번들)는 한 벌이다. */
    anchor: OverlayLine | null;
    /** 분봉 뷰에서 짚은 타점(테마 멤버 캔들의 원점). 일봉이면 null. */
    pointTarget: PointSkeleton | null;
    /** 일봉 뷰에서 짚은 차트. 분봉이면 null. */
    dailyTarget: OverlayLine | null;
    /** 그날 복기 스냅샷 — 테마 멤버 캔들의 재료(이미 받은 것). */
    snapshot: DayReplay | undefined;
    /** 지금 짚고 있는 것(골격선 호버 / 테마 라벨 호버). */
    focus: CandleFocus;
    nameOf: (code: string) => string;
    /** 설정 영속 키의 알갱이 — 일봉·분봉 패널이 각자 제 값을 가진다. */
    grain: "daily" | "minute";
}

export function useCandles({ anchor, pointTarget, dailyTarget, snapshot, focus, nameOf, grain }: UseCandlesArgs): CandlesView {
    /**
     * 캔들 선명도 — 배경으로 깔 것인가, 같이 읽을 것인가(사용자 요구). 캔들의 쓸모가 상황마다 달라서다:
     * 형태만 볼 땐 흐린 배경이 맞고, 봉 하나하나를 짚어 읽을 땐 골격선보다 진해도 된다.
     * 단계로 두는 이유는 이 패널의 다른 손잡이와 같은 문법(칩)이라서 — 슬라이더 하나를 위해 어휘를 늘리지 않는다.
     */
    const [alpha, setAlpha] = usePersistedState<CandleAlpha>(
        `wb.skeletonOverlayCandleAlpha.${grain}`,
        (o) => (o === "low" || o === "mid" || o === "high" ? o : null),
        "mid",
    );

    const [codes, setCodes] = useState<ReadonlySet<string>>(() => new Set());
    // 짚은 선이 바뀌면 켠 것들을 접는다 — 다른 날·다른 종목의 무리라 그대로 두면 뜻이 안 맞는다.
    useEffect(() => { setCodes(new Set()); }, [anchor?.key]);
    const toggle = useCallback((code: string): void => {
        setCodes((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }, []);
    const clear = useCallback((): void => setCodes(new Set()), []);

    const anchorOn = !!anchor && codes.has(anchor.stockCode);
    // 번들 하나가 둘 다 준다 — 분봉 캔들은 `minutes`, 일봉 캔들은 `daily`. 왕복이 늘지 않는다.
    const anchorQ = useQuery(chartQuery(anchorOn ? anchor.stockCode : "", anchorOn ? anchor.date : ""));

    /**
     * 그릴 캔들 — **하루치 전부**(장 마감까지, 사용자 확정): 초기 창으로 자르면 확대·이동해도 그 밖은
     * 영영 빈 화면이다(확대는 bounds 가 아니라 스케일 변환이라 이 memo 가 다시 안 돈다). 700봉이면 DOM 이 감당한다.
     * 멤버는 스냅샷(% 공간)이라 평행이동만, 앵커는 원주가라 골격 피벗과 같은 식으로 환산된다.
     */
    const set = useMemo<CandleSet | null>(() => {
        // 일봉 — 앵커 하나뿐이다(테마는 분봉 화면의 개념). x 는 창 안 거래일 순번이라 배열 인덱스가 곧 t.
        if (dailyTarget) {
            if (!anchorOn) return null;
            return {
                anchor: dailyOverlayCandles(anchorQ.data?.daily ?? [], { basePrice: dailyTarget.basePrice, baseT: dailyTarget.baseT }),
                members: [],
                daily: true,
            };
        }
        if (!pointTarget || codes.size === 0) return null;
        const origin = { basePrice: pointTarget.basePrice, baseRate: pointTarget.baseRate, baseT: pointTarget.baseT };
        const anchorCs = anchorOn ? anchorCandles(anchorQ.data?.minutes ?? [], origin) : [];
        const members: CandleSet["members"] = [];
        for (const code of codes) {
            if (code === pointTarget.stockCode) continue; // 앵커는 위에서(원주가 소스)
            const st = snapshot?.stocks.find((x) => x.code === code);
            if (!st) continue;
            const series = { index: minuteIndexOf(st.times, minuteOfDayOf), open: st.minuteOpen, high: st.minuteHigh, low: st.minuteLow, close: st.rate, cumAmount: st.cumAmount };
            // 멤버 시계열은 벽시계 색인 — 하루 전체를 훑는다(그린 뒤 화면 밖은 렌더가 거른다).
            members.push({ code, name: nameOf(code), candles: memberCandles(0, 1439, series, origin) });
        }
        return { anchor: anchorCs, members, daily: false };
    }, [dailyTarget, pointTarget, codes, anchorOn, anchorQ.data, snapshot, nameOf]);

    /**
     * 캔들을 지금 그리나 — **다른 라벨을 짚는 동안엔 감춘다**(사용자 확정). 그 순간의 질문은
     * "이 선 vs 저 선"이라 봉이 깔려 있으면 선끼리의 비교를 방해한다(흐리게도 써봤지만 흐린 봉도 가렸다).
     *
     * 판정 단위가 종목이 아니라 **선**인 이유(사용자 확정): 같은 종목의 형제 선(한 차트의 타점 여럿)을
     * 짚을 때도 그건 비교하는 중이다. 종목으로 재면 그 순간 자기 봉이 남아 형제 선끼리의 비교를 방해한다.
     * 테마 멤버 캔들만 종목으로 재는데, 그쪽 손잡이(테마 라벨)가 애초에 종목 단위라서다.
     */
    const anchorShown = !focus || (focus.kind === "line" && focus.key === anchor?.key);
    const memberShown = useCallback(
        (code: string): boolean => !focus || (focus.kind === "theme" && focus.codes.has(code)),
        [focus],
    );
    /** 캔들 진하기 — 헤더 단계 × (멤버면 한 겹 뒤). 물러남은 여기 안 든다(감추기는 위가 판정한다). */
    const opacityOf = useCallback(
        (member: boolean): number => CANDLE_ALPHA[alpha] * (member ? CANDLE_MEMBER_RATIO : 1),
        [alpha],
    );

    return { alpha, setAlpha, codes, toggle, clear, set, anchorOn, anchorLoading: anchorQ.isLoading, anchorShown, memberShown, opacityOf };
}
