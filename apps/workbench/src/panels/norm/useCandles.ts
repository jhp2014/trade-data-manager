// 테마 멤버 캔들의 **상태와 재료** — 짚은 타점의 테마 동료를 캔들로 켜 보는 층(분봉 전용).
//
// 항목 자신의 캔들은 이제 여기 없다 — 캔들이 기본 렌더가 되면서(사용자 확정) 항목 캔들은
// useNormLines 가 선과 같은 재료(번들)로 함께 만든다. 여기 남은 건 **테마 멤버**뿐이다:
// 재료가 다르고(그날 복기 스냅샷 — 추가 왕복 0), 켜는 손짓도 다르다(테마 선/거터 클릭).
import { useCallback, useEffect, useMemo, useState } from "react";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { DayReplay } from "@trade-data-manager/wire";
import { usePersistedState } from "../../store/persist.js";
import { memberCandles, type ViewCandle } from "./candles.js";
import { minuteIndexOf, type PointLine } from "./overlay.js";

/** 캔들 선명도 단계 — 배경(low) / 기본(mid) / 같이 읽기(high). 항목 캔들과 멤버 캔들이 같은 단계를 쓴다. */
export type CandleAlpha = "low" | "mid" | "high";
export const CANDLE_ALPHA: Record<CandleAlpha, number> = { low: 0.18, mid: 0.35, high: 0.7 };
/** 테마 멤버 캔들은 항목 캔들보다 한 겹 뒤 — 주인공이 누구인지 진하기로도 남는다. */
const CANDLE_MEMBER_RATIO = 0.8;

/** 지금 짚고 있는 대상 — 캔들을 감출지 정하는 기준. null 이면 아무것도 안 짚은 상태. */
export type CandleFocus = { kind: "line"; key: string } | { kind: "theme"; codes: ReadonlySet<string> } | null;

export interface MemberCandleSet {
    code: string;
    name: string;
    candles: ViewCandle[];
}

export interface CandlesView {
    /** 헤더 선명도 칩(패널이 그린다 — 이 층의 상태지만 자리는 헤더다). */
    alpha: CandleAlpha;
    setAlpha: (a: CandleAlpha) => void;
    /** 켠 테마 멤버 종목 집합 — 거터 라벨의 밑줄·툴팁 문구가 이걸 읽는다. */
    codes: ReadonlySet<string>;
    /** 켜고 끄기 — 테마 선·거터 라벨 어디서 눌러도 같은 자리로 들어온다. */
    toggle: (code: string) => void;
    clear: () => void;
    /** 그릴 멤버 캔들(원점 = 짚은 타점 — 항목 캔들과 같은 공간). */
    members: MemberCandleSet[];
    /** 다른 것을 짚는 동안 이 멤버를 감추나. */
    memberShown: (code: string) => boolean;
    /** 항목/멤버 캔들의 진하기 — 헤더 단계 × (멤버면 한 겹 뒤). */
    opacityOf: (member: boolean) => number;
}

export function useCandles(args: {
    /** 분봉 뷰에서 짚은 타점(멤버 캔들의 원점). 일봉·미선택이면 null. */
    pointTarget: PointLine | null;
    /** 그날 복기 스냅샷 — 멤버 캔들의 재료(이미 받은 것). */
    snapshot: DayReplay | undefined;
    /** 지금 짚고 있는 것(선 호버 / 테마 라벨 호버). */
    focus: CandleFocus;
    nameOf: (code: string) => string;
    grain: "daily" | "minute";
}): CandlesView {
    const { pointTarget, snapshot, focus, nameOf, grain } = args;
    const [alpha, setAlpha] = usePersistedState<CandleAlpha>(
        `wb.normCandleAlpha.${grain}`,
        (o) => (o === "low" || o === "mid" || o === "high" ? o : null),
        "mid",
    );
    const [codes, setCodes] = useState<ReadonlySet<string>>(new Set());
    // 원점이 바뀌면(다른 타점) 켜 둔 멤버를 접는다 — 다른 날/시각의 무리라 그대로 두면 뜻이 안 맞는다.
    useEffect(() => { setCodes(new Set()); }, [pointTarget?.key]);

    const toggle = useCallback((code: string): void => {
        setCodes((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    }, []);
    const clear = useCallback(() => setCodes(new Set()), []);

    const members = useMemo<MemberCandleSet[]>(() => {
        if (!pointTarget || !snapshot || codes.size === 0) return [];
        const out: MemberCandleSet[] = [];
        for (const code of codes) {
            const st = snapshot.stocks.find((x) => x.code === code);
            if (!st) continue;
            const series = {
                index: minuteIndexOf(st.times, minuteOfDayOf),
                open: st.minuteOpen, high: st.minuteHigh, low: st.minuteLow, close: st.rate,
                cumAmount: st.cumAmount,
            };
            out.push({
                code,
                name: nameOf(code),
                candles: memberCandles(0, 1439, series, { baseRate: pointTarget.baseRate, baseT: pointTarget.baseT }),
            });
        }
        return out;
    }, [pointTarget, snapshot, codes, nameOf]);

    // 다른 걸 짚는 동안엔 그 무리만 남긴다 — 옛 규칙 그대로(배경이 시선을 가리지 않게).
    const memberShown = useCallback(
        (code: string): boolean => (focus === null ? true : focus.kind === "theme" ? focus.codes.has(code) : false),
        [focus],
    );
    const opacityOf = useCallback(
        (member: boolean): number => CANDLE_ALPHA[alpha] * (member ? CANDLE_MEMBER_RATIO : 1),
        [alpha],
    );

    return { alpha, setAlpha, codes, toggle, clear, members, memberShown, opacityOf };
}
