// 골격 겹쳐 그리기의 **데이터 조립** — 패널의 읽기 절반. 렌더(SVG·라벨·손잡이)와 갈라둔 이유:
// 조립 규칙은 사용자 확정 규약이라 바뀔 때마다 정확히 읽혀야 하는데, 900줄 렌더 컴포넌트 안에서는 안 됐다.
//
// 필터는 **깔때기의 보는 집합을 구독만 한다** — 조건 평가는 깔때기가 끝냈고, 여기는 그 결과 집합에
// 드는 차트/타점만 남긴다. 알갱이 규칙이 두 뷰를 정리한다:
//   · 일봉(차트 단위) = 보는 집합의 차트 열쇠(타점 항목은 제 차트로 접힌다 — 위로 접기는 집합 소속이라 안전)
//   · 분봉(타점 단위) = 보는 집합을 타점으로 펼친 것(하루 항목은 그날 전 타점 — 정직한 반복)
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { skeletonsQuery, allPointsQuery } from "../../api/queries.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { pointKey, chartKey } from "../../lib/pointKey.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { subjectChartKey, subjectPointKeys, subjectStatus, useSubject, type Subject, type SubjectStatus } from "../../lib/subject.js";
import {
    normalizeSkeleton, pointSkeletons,
    type ChartSkeleton, type OverlayLine, type SkeletonAnchor,
} from "./skeletonOverlay.js";
import type { SkeletonWireLevel } from "../../api/skeletons.js";
import type { SetRef } from "../../lib/setRef.js";
import type { ReviewPointListItem } from "@trade-data-manager/wire";

export interface OverlayData {
    feedLoading: boolean;
    /** 화면의 선들 — 일봉은 차트 단위, 분봉은 타점 단위(kind 로 갈린다). "선택만 보기" 시야가 적용된 뒤다. */
    lines: OverlayLine[];
    /**
     * 이 패널이 표현할 수 있는 선 키 전부 — **시야("선택만 보기") 무관**. 사이드바의 표현됨/안 됨
     * 술어가 이걸 봐야 결손 목록이 렌즈·시야 상태에 안 출렁인다("채우러 갈 목록"의 뜻 유지).
     */
    drawableKeys: ReadonlySet<string>;
    /** 필터 전 전체 수 — 헤더의 "N개 / M" 분모. */
    population: number;
    /**
     * 분봉에서 전일 종가(%p 분모) 미수집으로 **못 그린 타점 수** — 필터로 빠진 것과 구분해 보여야 한다.
     * ⚠ 단위는 **타점**이다(차트가 아니라). 화면이 이걸 `population`·`lines.length` 와 나란히 세워
     * "M − N = 필터 + 결손"으로 읽히게 하는데, 셋 중 하나만 차트를 세면 그 산수가 조용히 깨진다.
     */
    missingPrevClose: number;
    levelsByChart: Map<string, SkeletonWireLevel[]>;
    /** 차트키 → 그 차트의 저장 타점들(시간 오름차순). 필터와 무관한 전체(선은 사실을 그린다). */
    pointsByChart: Map<string, ReviewPointListItem[]>;
    nameOf: (code: string) => string;
    /** 지금 선택(타점 또는 하루) — 아래 두 필드의 기준. */
    subject: Subject | null;
    /**
     * 선택이 이 뷰에서 가리키는 선 키들 — 일봉이면 차트 키 하나, 분봉이면 타점 pk 들
     * (하루 선택이면 **그날 전 타점** — 사용자 확정). 이 뷰의 선 키 공간과 같아 선택 폴백에 그대로 쓴다.
     */
    subjectKeys: ReadonlySet<string>;
    /** 선택이 안 보일 때 그 이유 — 필터 밖(filtered) vs 재료 없음(absent). 머리글 배지가 말한다. */
    subjectState: SubjectStatus;
}

export function useOverlayData(
    isDaily: boolean,
    anchor: SkeletonAnchor,
    /** "선택만 보기" — null 이면 제한 없음. 렌더 쪽 선택 상태에서 내려온다(패널 로컬 시야 — 필터와 별개). */
    onlyCharts: ReadonlySet<string> | null,
    /** 패널 바인딩 — null = 연동(필터 패널의 선택 포인터 그대로). 참조면 그 집합만 남긴다. */
    bindingRef: SetRef | null,
): OverlayData {
    const feedQ = useQuery(skeletonsQuery());
    const pointsQ = useQuery(allPointsQuery());
    const funnel = useFunnel();

    // 보는 집합 구독 — 바인딩 하나로 묻는다(시선이면 깔때기 viewed* 그대로). 안 걸려 있으면 null(제한 없음).
    // 로딩 가드는 뷰 계약(isFiltering) 안에 있다 — 여기서 되풀이하지 않는다.
    const view = funnel.viewOf(bindingRef);
    const filterOn = view.isFiltering;
    const chartAllowed = useMemo<ReadonlySet<string> | null>(
        () => (isDaily && filterOn ? view.viewedChartKeys : null),
        [isDaily, filterOn, view.viewedChartKeys],
    );
    const matchedPks = useMemo<ReadonlySet<string> | null>(
        () => (!isDaily && filterOn ? new Set(view.viewedPointRefs.map((p) => pointKey(p))) : null),
        [isDaily, filterOn, view.viewedPointRefs],
    );

    // 종목명 — 사전 한 벌(전량)에서. 예전엔 여기서 피드 둘(타점·앵커 차트)로 맵을 지었는데, 그 맵은
    // "이 화면에 데이터가 있는 종목"만 알아서 **정작 필터 밖·타점 없는 종목에서 이름이 비었다**
    // (머리글 배지가 코드로 뜨던 그 버그). 사전은 그 조건이 없다.
    const { nameOf } = useStockNames();

    const pointsByChart = useMemo(() => {
        const m = new Map<string, ReviewPointListItem[]>();
        for (const p of pointsQ.data ?? []) {
            const k = chartKey(p);
            const list = m.get(k);
            if (list) list.push(p);
            else m.set(k, [p]);
        }
        for (const list of m.values()) list.sort((a, b) => (a.time < b.time ? -1 : 1));
        return m;
    }, [pointsQ.data]);

    // 차트 단위 선(일봉) — 분봉 뷰에선 비어 있다(선의 전체 집합이 다르다).
    const shapes = useMemo<ChartSkeleton[]>(() => {
        const feed = feedQ.data;
        if (!feed || !isDaily) return [];
        const out: ChartSkeleton[] = [];
        for (const e of feed.daily) {
            const key = chartKey(e);
            if (chartAllowed && !chartAllowed.has(key)) continue;
            const n = normalizeSkeleton(e.pivots, anchor, { key, stockCode: e.stockCode, date: e.date });
            if (n) out.push(n);
        }
        return out;
    }, [feedQ.data, chartAllowed, isDaily, anchor]);

    // 타점 단위 선(분봉) — 골격 하나를 타점마다 %p 공간으로 재정규화. 필터는 타점 알갱이(matchedPks)로 직접.
    // 결손(전일 종가 미수집 → %p 분모 없음)은 **세어서 따로 낸다** — 조용히 빼면 "N개 / M"의 차이가
    // 전부 필터 탓으로 보인다(결손은 수집으로 고칠 일이지 필터를 의심할 일이 아니다).
    //
    // ⚠ 세는 단위는 **타점**이다. 이 뷰의 선도 전체 수도 타점이라 차트를 세면 그 표기만 단위가 달라져
    // "M − N = 필터 + 결손"이 안 맞는다(차트 3개가 빠졌는데 타점은 10개 사라지는 식).
    // ⚠ "선택만 보기"(onlyCharts)는 **여기서 걸지 않는다** — 그건 표시층의 패널 로컬 시야다. 이 목록이
    // 표현가능(drawableKeys)의 재료도 겸하는데, 여기서 걸면 사이드바 결손 판정이 시야에 따라 출렁여
    // 이미 그려진 차트를 "채우러 갈 목록"에 올린다(실측된 결함 — 시야는 아래 lines 에서만 자른다).
    const [pointLines, missingPrevClose] = useMemo<[OverlayLine[], number]>(() => {
        const feed = feedQ.data;
        if (!feed || isDaily) return [[], 0];
        const out: OverlayLine[] = [];
        let missing = 0;
        for (const e of feed.minute) {
            const key = chartKey(e);
            const pts = (pointsByChart.get(key) ?? [])
                .map((rp) => ({ pk: pointKey(rp), time: rp.time }))
                .filter((p) => !matchedPks || matchedPks.has(p.pk));
            if (pts.length === 0) continue;
            if (e.prevClose == null || e.prevClose <= 0) { missing += pts.length; continue; }
            out.push(...pointSkeletons(e.pivots, e.prevClose, pts, { key, stockCode: e.stockCode, date: e.date }));
        }
        return [out, missing];
    }, [feedQ.data, isDaily, pointsByChart, matchedPks]);

    const allLines: OverlayLine[] = isDaily ? shapes : pointLines;
    /** 이 패널이 표현할 수 있는 선 키(시야 무관) — 사이드바의 표현됨/안 됨 술어가 이걸 본다. */
    const drawableKeys = useMemo(() => new Set(allLines.map((l) => l.key)), [allLines]);
    // 표시층 시야 — "선택만 보기"는 여기서만 자른다(분봉 전용, 일봉은 onlyCharts 가 null).
    const lines = useMemo(
        () => (onlyCharts === null ? allLines : allLines.filter((l) => onlyCharts.has(chartKey(l)))),
        [allLines, onlyCharts],
    );

    // 선은 언제나 차트 소유 — 모든 뷰가 같은 목록을 본다(타점 단위 선은 chartKey 로 찾는다).
    const levelsByChart = useMemo(() => {
        const m = new Map<string, SkeletonWireLevel[]>();
        for (const l of feedQ.data?.levels ?? []) m.set(chartKey(l), l.levels);
        return m;
    }, [feedQ.data]);

    // 전체 수 — 일봉은 차트 수, 분봉은 분봉 골격 차트 위의 타점 수(필터 전).
    const population = useMemo(() => {
        const feed = feedQ.data;
        if (!feed) return 0;
        if (isDaily) return feed.daily.length;
        return feed.minute.reduce((n, e) => n + (pointsByChart.get(chartKey(e))?.length ?? 0), 0);
    }, [feedQ.data, isDaily, pointsByChart]);

    // ── 선택(subject)의 정의역 판정 — 이 패널이 "왜 선택이 안 보이나"를 갈라 말할 재료.
    //  · 재료(inData) = 골격이 있고(분봉은 타점·전일 종가까지) 그릴 수 있는 상태.
    //  · shown = 깔때기 필터까지 통과. inData 인데 shown 이 아니면 filtered.
    //  ⚠ "선택만 보기"(onlyCharts)는 여기 안 넣는다 — 그건 사용자가 손으로 좁힌 패널 로컬 시야라,
    //    그것 때문에 안 보이는 걸 "필터 밖"이라 말하면 깔때기를 의심하게 만든다.
    const subject = useSubject();
    const [subjectKeys, subjectState] = useMemo<[ReadonlySet<string>, SubjectStatus]>(() => {
        if (!subject) return [new Set(), "absent"];
        const sck = subjectChartKey(subject);
        if (isDaily) {
            const inData = (feedQ.data?.daily ?? []).some((e) => chartKey(e) === sck);
            const shown = inData && (!chartAllowed || chartAllowed.has(sck));
            return [new Set([sck]), subjectStatus(inData, shown)];
        }
        const entry = (feedQ.data?.minute ?? []).find((e) => chartKey(e) === sck);
        const times = (pointsByChart.get(sck) ?? []).map((p) => p.time);
        const pks = subjectPointKeys(subject, times);
        // 타점 선택 = 그 시각이 저장 타점이어야, 하루 선택 = 그날 타점이 하나라도 있어야 재료다.
        const hasPoints = subject.time !== null ? times.includes(subject.time) : times.length > 0;
        const inData = entry !== undefined && entry.prevClose != null && entry.prevClose > 0 && hasPoints;
        const shownPks = matchedPks ? pks.filter((pk) => matchedPks.has(pk)) : pks;
        return [new Set(pks), subjectStatus(inData, inData && shownPks.length > 0)];
    }, [subject, isDaily, feedQ.data, chartAllowed, matchedPks, pointsByChart]);

    return { feedLoading: feedQ.isLoading, lines, drawableKeys, population, missingPrevClose, levelsByChart, pointsByChart, nameOf, subject, subjectKeys, subjectState };
}
