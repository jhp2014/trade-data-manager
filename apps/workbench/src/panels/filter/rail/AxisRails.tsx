// 축 레일 둘 — 계산 축(값 구간)과 판단 축(자리 밴드). 둘 다 Rail 에 도메인을 꽂는 얇은 어댑터다.
//
// 갈리는 건 **자리를 무엇이 정하나** 하나뿐이다:
//   · 계산 축 — 수식이 정한 값. 척도는 실측 최소~최대, 경계는 가장 가까운 **타점 앵커**로 스냅한다.
//     앵커로 두면 수식을 고쳐 값이 통째로 움직여도 "이 타점보다 위"라는 판단이 따라 움직인다.
//   · 판단 축 — 사람이 꽂은 자리(slot). 자리끼리 균등 간격이고 경계는 그 자리 자체다.
//
// 방향과 반열림 번역은 railBound(순수·테스트됨)에. 여기는 재료를 프랙션으로 바꾸는 일만 한다.
import { useMemo } from "react";
import type { PlacedPoint, RankAxis } from "@trade-data-manager/wire";
import { assemble } from "../../rank/rankGeometry.js";
import { nearestPointAt, valueDomain, valueToFrac } from "../../../lib/computedAxis.js";
import { pointKey } from "../../../lib/pointKey.js";
import { resolveBound } from "../evaluate.js";
import type { AxisBound, AxisValueRange, RankBand } from "../stage.js";
import { Rail } from "./Rail.js";
import { toRailBand, toRailRanges, toRankBand, toValueRanges } from "./railBound.js";
import type { RailRange } from "./railModel.js";

const GONE_LABEL = "?"; // 앵커가 사라진 경계 — 숫자를 지어내지 않는다
const clampIndex = (i: number, len: number): number => Math.max(0, Math.min(len - 1, i));

interface CommonProps {
    axis: RankAxis;
    /** 현재 타점 키(pointKey) — 이 축에 값·배치가 있으면 마커로 선다. */
    markerKey: string | null;
    highlight?: boolean;
}

// ── 계산 축 ────────────────────────────────────────────────────────────────

export function ComputedAxisRail({
    axis, values, strongerWhen, fmtValue, ranges, markerKey, highlight, onType, onChange,
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

    const railRanges = toRailRanges(ranges, weakEnd, strongEnd, strongerWhen);
    const markerValue = markerKey === null ? undefined : values.get(markerKey);

    return (
        <Rail<AxisBound>
            label={axis.name}
            ranges={railRanges}
            toFrac={boundFrac}
            // 경계는 늘 **실재하는 타점**에 세운다 — 상대비교(이 타점보다 위)가 이 축을 쓰는 방법이라서.
            fromFrac={(f) => {
                const key = domain ? nearestPointAt(f, values, domain, strongerWhen) : null;
                return key ? { kind: "point", point: key } : { kind: "value", value: domain ? domain.min + f * (domain.max - domain.min) : f };
            }}
            fmt={fmt}
            minLabel={fmtValue(strongerWhen === "higher" ? (domain?.min ?? 0) : (domain?.max ?? 0))}
            maxLabel={fmtValue(strongerWhen === "higher" ? (domain?.max ?? 0) : (domain?.min ?? 0))}
            ticks={ticks}
            marker={markerValue === undefined ? null : { frac: frac(markerValue), label: fmtValue(markerValue) }}
            highlight={highlight}
            disabledNote={domain ? undefined : "값 없음 — 이 축의 재료가 아직 없습니다"}
            onType={onType}
            onChange={(next) => {
                const out = toValueRanges(next, boundFrac, strongerWhen);
                onChange(out.length > 0 ? out : null);
            }}
        />
    );
}

// ── 판단 축 ────────────────────────────────────────────────────────────────

export function SlotAxisRail({
    axis, line, band, markerKey, highlight, onChange,
}: CommonProps & {
    /** 이 축의 배치줄(orderKey 오름차). */
    line: readonly PlacedPoint[];
    band: RankBand;
    /** 조건이 안 남으면 null — 호출부가 그 필터를 지운다. */
    onChange: (band: RankBand | null) => void;
}): JSX.Element {
    // 자리는 균등 간격 — 이 축의 좌표는 순서일 뿐 거리가 아니다(값 축과 다른 점).
    const { slots, fracOf, rankOf } = useMemo(() => {
        const list = assemble([...line]);
        const fracs = new Map<string, number>();
        const ranks = new Map<string, number>();
        list.forEach((s, i) => {
            fracs.set(s.slotId, list.length <= 1 ? 0.5 : i / (list.length - 1));
            ranks.set(s.slotId, list.length - i); // 오른쪽(큰 orderKey) = 강 = 1위
        });
        return { slots: list, fracOf: fracs, rankOf: ranks };
    }, [line]);

    const frac = (slotId: string): number => fracOf.get(slotId) ?? 0.5;
    const fmt = (slotId: string): string => {
        const rank = rankOf.get(slotId);
        return rank === undefined ? GONE_LABEL : `${rank}위`;
    };
    const fracs = useMemo(() => [...fracOf.values()], [fracOf]);

    const weakSlot = slots[0]?.slotId;
    const strongSlot = slots[slots.length - 1]?.slotId;
    // 배치는 언제나 타점 키로 저장된다(하루 축도 그날 전 타점에 fanout) — 그래서 키 하나로 두 층위가 다 맞는다.
    const markerSlot = markerKey === null ? undefined : slots.find((s) => s.points.some((p) => pointKey(p) === markerKey));

    return (
        <Rail<string>
            label={axis.name}
            ranges={toRailBand(band, weakSlot, strongSlot)}
            single
            toFrac={frac}
            // 스냅 = 가장 가까운 자리. 자리 사이에는 경계를 세울 수 없다(저장할 자리가 없다).
            // 자리가 균등 간격이라 반올림이 곧 최근접이다.
            fromFrac={(f) => slots[clampIndex(Math.round(f * (slots.length - 1)), slots.length)]?.slotId ?? ""}
            fmt={fmt}
            minLabel="약"
            maxLabel="강"
            ticks={fracs}
            marker={markerSlot ? { frac: frac(markerSlot.slotId), label: fmt(markerSlot.slotId) } : null}
            highlight={highlight}
            disabledNote={slots.length === 0 ? "배치 없음 — 경계로 삼을 자리가 없습니다" : undefined}
            onChange={(next: RailRange<string>[]) => onChange(toRankBand(next, frac))}
        />
    );
}
