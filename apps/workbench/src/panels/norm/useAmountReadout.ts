// **복기 스냅샷을 재료로 쓰는 것들** — 거래대금 런(굵기)·세로선 판독·핀 판독·금액 라벨.
// 넷이 같은 조회기 한 벌(amountLookupOf)을 나눠 쓰므로 파생도 한 훅에 모은다.
//
// ⚠ 스냅샷(useDaySnapshot)과 조회기(lookup) 자체는 **패널이 소유**한다 — useThemeOverlay 가 같은
// 재료를 먼저 받아야 해서(테마 선·hot 판정), 여기 들이면 훅 순서가 원형이 된다. 이 훅은 그 조회기를
// 받아 "무엇을 뽑아 어디에 세우나"만 답한다.
import { useMemo } from "react";
import { yAtX, type OverlayLine, type PointLine } from "./overlay.js";
import { amountRuns, type AmountRun } from "../canvas/amountRuns.js";
import { amountLevelOf, type AmountLookup } from "./amountLayer.js";
import { useAmountLabels, type AmountLabel, type AmountSource } from "./AmountLabels.js";
import {
    pickReadouts, layoutReadoutRows, readoutCandidatesAt, READOUT_GAP,
    type PlacedRow, type ReadoutCandidate, type ReadoutSource,
} from "../canvas/readout.js";
import type { ThemeOverlay, ThemeView } from "./useThemeOverlay.js";
import type { Scales } from "./useOverlayViewport.js";

/** 판독 칩 상한 — 등락률 상위 N ∪ 누적 거래대금 상위 N(사용자 확정). 합집합이라 최대 2N, 보통 그보다 적다. */
const READOUT_TOP = 5;

export interface AmountReadout {
    /** 짚은 선의 분당 런 — 골격선 층이 굵기로 싣는다(굵기가 꺼져도 값 라벨의 재료라 계산된다). */
    amounts: { key: string; runs: AmountRun[] } | null;
    /** 크로스헤어의 x → 판독 목록. null 이면 판독을 안 펼친 상태. */
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    /** 붙잡은 핀 시각의 판독(화면 좌표로 배치까지 끝난 것). */
    themeReadingSlots: PlacedRow<ReadoutCandidate>[];
    /** 살아남은 금액 라벨들(솎기·자리 배치 끝). */
    amountLabels: AmountLabel[];
}

export function useAmountReadout(args: {
    isDaily: boolean;
    singleTarget: OverlayLine | null;
    pointTarget: PointLine | null;
    amountWidthOn: boolean;
    amountLabelsOn: boolean;
    lookup: AmountLookup;
    themeOverlay: ThemeOverlay | null;
    themeRuns: ThemeView["runs"];
    themeHovered: ReadonlySet<string> | null;
    hovered: string | null;
    nameOf: (code: string) => string;
    scales: Scales | null;
    box: { top: number; height: number };
    /** 핀 상태에서 오는 두 값 — 세로선 판독의 x, 금액 라벨의 세그먼트 경계. */
    openReadingX: number | null;
    anchorMinutes: readonly number[];
}): AmountReadout {
    const {
        isDaily, singleTarget, pointTarget, amountWidthOn, amountLabelsOn, lookup,
        themeOverlay, themeRuns, themeHovered, hovered, nameOf, scales, box, openReadingX, anchorMinutes,
    } = args;

    // 런 계산은 굵기가 꺼져도 필요하다 — 값 라벨의 재료가 같은 런이다.
    const amountTarget = amountWidthOn || amountLabelsOn ? singleTarget : null;
    // 두 조회기는 **셋이 나눠 쓴다**(골격선 굵기·테마선 굵기·판독 칩) — 그래서 층이 아니라 공용 재료다.
    const amountLookup = lookup.amountAt;
    const cumLookup = lookup.cumAt;

    const amounts = useMemo(() => {
        if (!amountTarget) return null;
        const at = amountLookup(amountTarget.stockCode);
        if (!at) return null;
        return { key: amountTarget.key, runs: amountRuns(amountTarget.points, amountTarget.baseT, at, amountLevelOf) };
    }, [amountTarget, amountLookup]);

    /**
     * ── 세로선 판독 — **선 하나에 손이 올라가면** 교차선의 세로선이 그 시각의 판독 자가 된다(사용자 확정).
     * 그 x 에서 보이는 선들의 값을 읽어 세로선 **오른쪽**에 칩으로 세운다(왼쪽 = 지나온 궤적이라 안 가린다).
     *
     * 여기서는 **재료(조회기)만** 만든다 — 값은 커서를 따라 매 픽셀 바뀌므로 실제 판독·배치·그리기는
     * 크로스헤어 층이 자기 안에서 한다(부모가 mousemove 를 타면 선 수백 개가 이동마다 재조정된다).
     * 조회는 O(1) 이어야 한다: 테마 멤버는 1분에 점 하나라 **x → y 색인**을 선당 한 번 만들어 둔다
     * (yAtX 로 매번 훑으면 30선 × 720점을 마우스 이동마다 반복한다).
     */
    const readoutSources = useMemo<ReadoutSource[] | null>(() => {
        if (isDaily || !pointTarget) return null;
        const t0 = pointTarget.baseT;
        const out: ReadoutSource[] = [];
        const anchorAt = amountLookup(pointTarget.stockCode);
        const anchorCum = cumLookup(pointTarget.stockCode);
        out.push({
            code: pointTarget.stockCode, name: nameOf(pointTarget.stockCode), own: true, t0,
            baseRate: pointTarget.baseRate,
            // 골격선은 피벗 몇 개뿐이라 보간이 싸다 — 그리고 피벗 사이 임의 지점도 읽혀야 한다.
            yAt: (x) => yAtX(pointTarget.points, x),
            amountAt: anchorAt, cumAt: anchorCum,
        });
        for (const l of themeOverlay?.lines ?? []) {
            // 전 조각 평탄화 — 정확분 조회(byX)라 갭(이탈) 분은 자연히 null = 판독 없음이 된다(보간 아님).
            const byX = new Map<number, number>();
            for (const seg of l.segments) for (const p of seg) byX.set(p.x, p.y);
            out.push({
                code: l.code, name: l.name, t0, baseRate: themeOverlay!.baseRate,
                yAt: (x) => byX.get(Math.round(x)) ?? null,
                amountAt: amountLookup(l.code), cumAt: cumLookup(l.code),
            });
        }
        return out;
    }, [isDaily, pointTarget, themeOverlay, amountLookup, cumLookup, nameOf]);

    /** 판독을 지금 펼치나 — **테마 선이든 골격선이든 하나에 손이 올라갔을 때만**(사용자 확정). */
    const readoutOn = !!readoutSources && (themeHovered?.size === 1 || (hovered !== null && hovered === singleTarget?.key));
    const readoutAt = useMemo<((x: number) => ReadoutCandidate[]) | null>(() => {
        if (!readoutOn || !readoutSources) return null;
        const lit = themeHovered?.size === 1 ? [...themeHovered][0] : singleTarget?.stockCode ?? null;
        return (x) => pickReadouts(readoutCandidatesAt(readoutSources, x, lit), READOUT_TOP, READOUT_TOP);
    }, [readoutOn, readoutSources, themeHovered, singleTarget]);

    /**
     * 붙잡은 핀 시각의 판독 — **크로스헤어 판독과 같은 규칙**으로 통일했다(사용자 확정):
     * 옛 열 쌓기(layoutAxisColumns)는 겹칠수록 오른쪽으로 번져 화면을 넘었고, "어느 시각 것이냐"를
     * 열로 읽는 규칙을 따로 배워야 했다. 지시선이 이미 대응을 지므로 **한 열에서 위아래로** 벌리면 그만이다.
     * 뽑기도 같은 기준(등락률·누적 대금 상위) — 두 판독이 다른 무리를 보여주면 그게 더 헷갈린다.
     */
    const themeReadingSlots = useMemo(() => {
        if (!scales || !readoutSources || openReadingX === null) return [];
        return layoutReadoutRows(
            pickReadouts(readoutCandidatesAt(readoutSources, openReadingX), READOUT_TOP, READOUT_TOP)
                .map((r) => ({ item: r, y: scales.y(r.y) })),
            { min: box.top + 8, max: box.top + box.height - 8 },
            READOUT_GAP,
        );
    }, [scales, readoutSources, openReadingX, box.top, box.height]);

    /** 라벨 후보를 내는 선들 — 앵커 골격 + 테마 전부. 모양이 같아 한 격자에서 겨룬다(AmountLabels). */
    const amountSources = useMemo<AmountSource[]>(() => {
        const out: AmountSource[] = [];
        if (amounts && amountTarget) out.push({ code: amountTarget.stockCode, runs: amounts.runs, baseT: amountTarget.baseT, own: true });
        if (themeRuns && themeOverlay) for (const [code, runs] of themeRuns) out.push({ code, runs, baseT: themeOverlay.t0, own: false });
        return out;
    }, [amounts, amountTarget, themeRuns, themeOverlay]);
    const amountLabels = useAmountLabels(amountSources, scales, anchorMinutes, amountLabelsOn);

    return { amounts, readoutAt, themeReadingSlots, amountLabels };
}
