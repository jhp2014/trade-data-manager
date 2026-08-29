// 계산 축 레일 — Rail 에 도메인을 꽂는 얇은 어댑터. 척도는 실측 최소~최대, 경계는 가장 가까운
// **타점 앵커**로 스냅한다: 앵커로 두면 수식을 고쳐 값이 통째로 움직여도 "이 타점보다 위"라는 판단이
// 따라 움직인다. (옛 판단 축 레일 SlotAxisRail 은 2026-08-25 판단축 폐지로 삭제.)
//
// 방향과 반열림 번역은 railBound(순수·테스트됨)에. 여기는 재료를 프랙션으로 바꾸는 일만 한다.
import { useMemo } from "react";
import type { RankAxis } from "@trade-data-manager/wire";
import { buildFracIndex, nearestPointInIndex, valueDomain, valueToFrac } from "../../../lib/computedAxis.js";
import { rowKeyToChartKey } from "../../../lib/pointKey.js";
import { resolveBound } from "../evaluate.js";
import type { AxisBound, AxisValueRange } from "../stage.js";
import { Rail } from "./Rail.js";
import { toRailRanges, toValueRanges } from "./railBound.js";

const GONE_LABEL = "?"; // 앵커가 사라진 경계 — 숫자를 지어내지 않는다

interface CommonProps {
    axis: RankAxis;
    /**
     * 지금 고른 자리의 **행 키** — 타점을 골랐으면 타점 키(3조각), 하루만 골랐으면 차트 키(2조각).
     * 이 축의 값 맵에 닿으면 마커로 선다. 하루 선택이 point 축에서 안 뜨는 건 그래서다(그 맵엔 차트 키가 없다).
     */
    markerKey: string | null;
    /**
     * 선택 집합 멤버의 타점 키들 — 있으면 그 자리들이 강조색으로 겹쳐진다(선택 집합이 이 축의 어디에
     * 몰리나). null = 오버레이 없음(선택도 필터도 없을 때 — 전부 멤버인 그림은 아무 말도 아니다).
     */
    memberKeys?: ReadonlySet<string> | null;
    /** 순서 잡이(이름 열) — 그대로 레일에 넘긴다. 보드가 층위·저장을 지고 여기는 통로다. */
    dragHandle?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
    /** 서랍 손잡이 — 잡이와 같은 이유로 통로다(서랍 멤버십은 보드가 소유). */
    stow?: { hidden: boolean; onToggle: () => void };
}

/** 전부이거나 하나도 없으면 오버레이를 접는다 — 전경=배경인 그림은 구분이 아니라 소음이다. */
const properSubset = (member: number[], total: number): number[] | undefined =>
    member.length > 0 && member.length < total ? member : undefined;

// ── 계산 축 ────────────────────────────────────────────────────────────────

export function ComputedAxisRail({
    axis, values, strongerWhen, fmtValue, ranges, markerKey, memberKeys, dragHandle, stow, onType, onChange,
}: CommonProps & {
    /** 타점키 → 수치. */
    values: Map<string, number>;
    strongerWhen: "higher" | "lower";
    /** 값 → 라벨(단위가 축마다 다르다: %·일…). 축 정의에서 내려온 것. */
    fmtValue: (v: number) => string;
    ranges: readonly AxisValueRange[];
    /** 값 직접 입력 입구(이름 아래). */
    onType: (x: number, y: number) => void;
    /** 조건이 안 남으면 null — 호출부가 그 필터를 지운다. */
    onChange: (ranges: AxisValueRange[] | null) => void;
}): JSX.Element {
    const domain = useMemo(() => valueDomain(values), [values]);
    // 스냅 색인 — 드래그(pointermove마다 최근접 스냅)가 매번 전 타점을 선형 스캔하지 않게 렌더당 한 번 정렬.
    const fracIndex = useMemo(
        () => (domain ? buildFracIndex(values, domain, strongerWhen) : null),
        [values, domain, strongerWhen],
    );

    const frac = (v: number): number => (domain ? valueToFrac(v, domain, strongerWhen) : 0.5);
    const boundFrac = (b: AxisBound): number => {
        const v = resolveBound(b, values);
        return v === undefined ? 0.5 : frac(v); // 앵커 소실 = 가운데(라벨은 ?)
    };
    const fmt = (b: AxisBound): string => {
        const v = resolveBound(b, values);
        return v === undefined ? GONE_LABEL : fmtValue(v);
    };

    // 도메인 양 끝(레일 방향) — 반열림을 그릴 때 채우는 값이자, 되돌릴 때의 기준.
    const weakEnd: AxisBound = { kind: "value", value: strongerWhen === "higher" ? (domain?.min ?? 0) : (domain?.max ?? 0) };
    const strongEnd: AxisBound = { kind: "value", value: strongerWhen === "higher" ? (domain?.max ?? 0) : (domain?.min ?? 0) };

    const ticks = useMemo(
        () => (domain ? [...values.values()].map((v) => valueToFrac(v, domain, strongerWhen)) : []),
        [values, domain, strongerWhen],
    );

    // 멤버 자리 = 같은 값 지도의 부분집합 — 새 기하 없이 기존 틱에 색만 갈린다.
    const memberTicks = useMemo(() => {
        if (!memberKeys || !domain) return undefined;
        const out: number[] = [];
        for (const [k, val] of values) if (memberKeys.has(k)) out.push(valueToFrac(val, domain, strongerWhen));
        return properSubset(out, values.size);
    }, [memberKeys, values, domain, strongerWhen]);

    const railRanges = toRailRanges(ranges, weakEnd, strongEnd, strongerWhen);
    // 제 행 키로 먼저 묻고, 없으면 시각을 벗겨 차트 키로(rowLookup 과 같은 폴백) — 타점 선택도 day 축에 선다.
    // 차트 키로 온 하루 선택은 벗길 게 없어 그대로 한 번 더 묻는다(point 축이면 두 번 다 miss = 마커 없음).
    const markerValue = markerKey === null ? undefined : (values.get(markerKey) ?? values.get(rowKeyToChartKey(markerKey)));

    return (
        <Rail<AxisBound>
            label={axis.name}
            ranges={railRanges}
            toFrac={boundFrac}
            // 경계는 늘 **실재하는 타점**에 세운다 — 상대비교(이 타점보다 위)가 이 축을 쓰는 방법이라서.
            fromFrac={(f) => {
                // 값이 없으면 레일이 disabledNote 로 드래그를 막는다 — 여기 null 은 도달 불가라 값을 지어내지
                // 않는다(예전의 값 폴백은 이 잠복 속에서 방향(strongerWhen: "lower")을 무시한 값을 만들었다).
                const key = fracIndex ? nearestPointInIndex(f, fracIndex) : null;
                if (key === null) throw new Error("값 없는 계산 축의 드래그 — disabledNote 배선을 확인하세요");
                return { kind: "point", point: key };
            }}
            fmt={fmt}
            minLabel={fmtValue(strongerWhen === "higher" ? (domain?.min ?? 0) : (domain?.max ?? 0))}
            maxLabel={fmtValue(strongerWhen === "higher" ? (domain?.max ?? 0) : (domain?.min ?? 0))}
            ticks={ticks}
            memberTicks={memberTicks}
            marker={markerValue === undefined ? null : { frac: frac(markerValue), label: fmtValue(markerValue) }}
            dragHandle={dragHandle}
            stow={stow}
            disabledNote={domain ? undefined : "값 없음 — 이 축의 재료가 아직 없습니다"}
            onType={onType}
            onChange={(next) => {
                const out = toValueRanges(next, boundFrac, strongerWhen);
                onChange(out.length > 0 ? out : null);
            }}
        />
    );
}
