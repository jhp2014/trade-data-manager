// 계산 축 필터 레일 — 날짜·시간 레일(FilterRail)과 **같은 물건**이다. 도메인만 축의 수치로 바꿔 끼운다.
// 계산 축에는 배치가 없어 레인(드롭 대상)을 그릴 이유가 없고, 대신 값 구간을 긋는 게 이 축을 쓰는 방법이다.
//
// 두 가지가 이 어댑터의 전부:
//  · **스냅** — 드래그 좌표를 가장 가까운 실제 타점으로 붙이고, 경계를 그 타점 앵커로 저장한다.
//    수식을 고쳐 값이 통째로 움직여도 "이 타점보다 위"라는 판단이 따라 움직인다(값으로 굳히면 뜻이 달라진다).
//  · **반열림 채우기** — 저장은 한쪽이 빈 구간을 허용하지만(시트 우클릭 "이 값 이상"), 레일은 양끝이 있어야
//    그린다. 그래서 그릴 때만 도메인 끝으로 채우고, 사용자가 **건드리지 않은 끝은 다시 비워** 돌려놓는다.
import { valueDomain, valueToFrac, nearestPointAt } from "../../lib/computedAxis.js";
import { resolveBound } from "./axisValueFilter.js";
import { FilterRail } from "./FilterRail.js";
import type { AxisBound, AxisValueRange } from "../../store/rankFilterSlice.js";

interface RailRange { from: AxisBound; to: AxisBound }

const sameBound = (a: AxisBound | undefined, b: AxisBound | undefined): boolean =>
    a != null && b != null && a.kind === b.kind && (a.kind === "point" ? a.point === (b as { point: string }).point : a.value === (b as { value: number }).value);

export function ComputedAxisRail({ name, values, strongerWhen, fmtValue, ranges, markerKey, sortDir, onChange }: {
    name: string;
    /** 타점키 → 수치. */
    values: Map<string, number>;
    strongerWhen: "higher" | "lower";
    /** 값 → 라벨. 단위가 축마다 다르므로(%·일…) 축 정의에서 내려온 것을 받는다. */
    fmtValue: (v: number) => string;
    ranges: AxisValueRange[];
    /** 현재 타점 키(마커) — 그 축에 값이 없으면 마커 없음. */
    markerKey: string | null;
    sortDir: 1 | -1 | null;
    onChange: (ranges: AxisValueRange[]) => void;
}): JSX.Element | null {
    const domain = valueDomain(values);
    if (!domain) return null; // 값이 하나도 없는 축 — 그릴 스케일이 없다(재료 미수집 등).

    const minEnd: AxisBound = { kind: "value", value: domain.min };
    const maxEnd: AxisBound = { kind: "value", value: domain.max };
    const railRanges: RailRange[] = ranges.map((r) => ({ from: r.from ?? minEnd, to: r.to ?? maxEnd }));

    const toFrac = (b: AxisBound): number => {
        const v = resolveBound(b, values);
        return v === null ? 0.5 : valueToFrac(v, domain, strongerWhen); // 앵커 소실 = 가운데(라벨은 "?")
    };
    const fromFrac = (f: number): AxisBound => {
        const key = nearestPointAt(f, values, domain, strongerWhen);
        return key ? { kind: "point", point: key } : { kind: "value", value: domain.min + f * (domain.max - domain.min) };
    };
    const fmt = (b: AxisBound): string => {
        const v = resolveBound(b, values);
        return v === null ? "?" : fmtValue(v);
    };

    // 안 건드린 반열림 끝은 다시 비운다 — 한 구간을 드래그했다고 다른 구간이 조용히 닫히면 안 된다.
    const restore = (next: RailRange[]): AxisValueRange[] =>
        next.map((r, i) => {
            const orig = ranges[i];
            return {
                from: orig && orig.from === undefined && sameBound(r.from, minEnd) ? undefined : r.from,
                to: orig && orig.to === undefined && sameBound(r.to, maxEnd) ? undefined : r.to,
            };
        });

    return (
        <FilterRail<AxisBound, RailRange>
            label={name}
            ranges={railRanges}
            toFrac={toFrac}
            fromFrac={fromFrac}
            fmt={fmt}
            minLabel={fmtValue(strongerWhen === "higher" ? domain.min : domain.max)}
            maxLabel={fmtValue(strongerWhen === "higher" ? domain.max : domain.min)}
            marker={markerKey != null && values.has(markerKey) ? { kind: "point", point: markerKey } : null}
            ticks={[...values.values()].map((v) => valueToFrac(v, domain, strongerWhen))}
            sortDir={sortDir}
            onChange={(next) => onChange(restore(next))}
        />
    );
}
