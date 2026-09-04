// 결과 지표 레일 — ComputedAxisRail 의 형제 어댑터(같은 좌표 셈 재사용, 결과 값 맵을 꽂는다).
// 따로 쓴 이유 둘: ① 결과 레일엔 서랍·순서 잡이·값 입력이 없다(축 목록의 일부가 아니라 이 패널의
// 고정 4줄 — 거짓 손잡이 금지) ② 값 맵이 축 피드가 아니라 useOutcomes 의 railValues 다.
// **경계는 값 리터럴이다(계산 축의 타점 앵커와 다르다)** — 앵커로 두면 T 이동으로 그 시그널의 값이
// 맵에서 빠지는 순간 앵커가 소실돼 조건 전체가 결손으로 무너진다(리뷰에서 확인된 사고).
// 값이면 T 가 분포를 움직여도 경계("4% 이상")는 그대로다 — 결과 조건의 뜻으로도 이쪽이 맞다.
// 스냅(가장 가까운 실제 자리의 값)은 유지한다 — 유니버스를 보면서 자르는 손맛은 앵커가 아니라 스냅의 몫.
import { useMemo } from "react";
import { buildFracIndex, nearestPointInIndex, valueDomain, valueToFrac } from "../../lib/computedAxis.js";
import { resolveBound } from "../filter/evaluate.js";
import type { AxisBound, AxisValueRange } from "../filter/stage.js";
import { Rail } from "../filter/rail/Rail.js";
import { toRailRanges, toValueRanges } from "../filter/rail/railBound.js";

const GONE_LABEL = "?"; // 앵커가 사라진 경계 — 숫자를 지어내지 않는다(AxisRails 와 같은 규칙)

const fmtPct = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** 전부이거나 하나도 없으면 오버레이를 접는다 — 전경=배경인 그림은 구분이 아니라 소음이다(AxisRails 와 동일). */
const properSubset = (member: number[], total: number): number[] | undefined =>
    member.length > 0 && member.length < total ? member : undefined;

/** 결과 레일 방향은 전부 "큰 값 = 오른쪽"(연장은 크게, 낙폭은 얕게가 오른쪽) — strongerWhen "higher" 고정. */
export function OutcomeMetricRail({ name, values, ranges, markerKey, memberKeys, onChange }: {
    name: string;
    /** 타점키 → 값(useOutcomes.railValues — 낙폭 2종은 무눌림 행이 빠진다). undefined = 재료 미도착. */
    values: Map<string, number> | undefined;
    ranges: readonly AxisValueRange[];
    markerKey: string | null;
    /** 보는 집합 멤버의 타점 키들 — 강조색 틱·분포 멤버 층(필터 레일 패널과 같은 계약). null = 오버레이 없음. */
    memberKeys: ReadonlySet<string> | null;
    onChange: (ranges: AxisValueRange[] | null) => void;
}): JSX.Element {
    const domain = useMemo(() => (values ? valueDomain(values) : null), [values]);
    const fracIndex = useMemo(
        () => (values && domain ? buildFracIndex(values, domain, "higher") : null),
        [values, domain],
    );

    const frac = (v: number): number => (domain ? valueToFrac(v, domain, "higher") : 0.5);
    const boundFrac = (b: AxisBound): number => {
        const v = resolveBound(b, values);
        return v === undefined ? 0.5 : frac(v);
    };
    const fmt = (b: AxisBound): string => {
        const v = resolveBound(b, values);
        return v === undefined ? GONE_LABEL : fmtPct(v);
    };

    const weakEnd: AxisBound = { kind: "value", value: domain?.min ?? 0 };
    const strongEnd: AxisBound = { kind: "value", value: domain?.max ?? 0 };

    const ticks = useMemo(
        () => (values && domain ? [...values.values()].map((v) => valueToFrac(v, domain, "higher")) : []),
        [values, domain],
    );
    // 멤버 자리 = 같은 값 지도의 부분집합 — 새 기하 없이 기존 틱에 색만 갈린다(AxisRails 와 동일).
    const memberTicks = useMemo(() => {
        if (!memberKeys || !values || !domain) return undefined;
        const out: number[] = [];
        for (const [k, val] of values) if (memberKeys.has(k)) out.push(valueToFrac(val, domain, "higher"));
        return properSubset(out, values.size);
    }, [memberKeys, values, domain]);
    const markerValue = markerKey === null ? undefined : values?.get(markerKey);

    return (
        <Rail<AxisBound>
            label={name}
            ranges={toRailRanges(ranges, weakEnd, strongEnd, "higher")}
            toFrac={boundFrac}
            fromFrac={(f) => {
                const key = fracIndex ? nearestPointInIndex(f, fracIndex) : null;
                const v = key === null ? undefined : values?.get(key);
                if (v === undefined) throw new Error("값 없는 결과 레일 — disabledNote·dist 배선을 확인하세요");
                return { kind: "value", value: v };
            }}
            fmt={fmt}
            minLabel={fmtPct(domain?.min ?? 0)}
            maxLabel={fmtPct(domain?.max ?? 0)}
            ticks={ticks}
            memberTicks={memberTicks}
            dist={{ ticks, member: memberTicks }}
            marker={markerValue === undefined ? null : { frac: frac(markerValue), label: fmtPct(markerValue) }}
            disabledNote={domain ? undefined : "값 없음 — 격자 로딩 중이거나 이 값을 가진 시그널이 없습니다"}
            onChange={(next) => {
                const out = toValueRanges(next, boundFrac, "higher");
                onChange(out.length > 0 ? out : null);
            }}
        />
    );
}
