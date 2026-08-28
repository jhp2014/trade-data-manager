// 컷 레일 — Rail(cut 모드)에 서수 척도를 꽂는 얇은 어댑터 2종. 테마 조건 행(존 N/M·존순위)이 쓴다.
//
// AxisRails 와 달리 앵커가 없다 — 서수는 그 자체가 정수 자리라 값이 곧 경계고, 스냅은
// ordinalScale.fracToOrd 의 반올림이 겸한다. 커밋 규약(손 뗄 때 한 번)은 Rail 이 진다.
import { useMemo } from "react";
import { Rail } from "./Rail.js";
import { ordToFrac, fracToOrd } from "./ordinalScale.js";

/**
 * 서수 상한 컷(√ 척도) — 존 N(등락)·존 M(대금). 도메인 1..max(유니버스 크기), 값은 항상 존재
 * (조건 삭제 없음 — 존 컷은 묶음의 필수 재료다).
 * ticks = 모수 타점들의 자기 서수(∃ 최선 테마 근사·참고용) — 유니버스 서수는 균등이라 분포가
 * 무의미하고, "내 타점들이 대개 몇 위였나"가 이 레일에서 유일하게 의미 있는 분포다.
 */
export function OrdinalCutRail({ label, value, max, ticks, onChange }: {
    label: string;
    value: number;
    /** 도메인 상한(유니버스 크기) — 패널 산점 축과 다를 수 있다(보드엔 시선이 없어 번들 최대값을 쓴다). */
    max: number;
    /** 모수 타점의 서수들(1..max) — 프랙션 변환은 여기서. */
    ticks?: readonly number[];
    onChange: (value: number) => void;
}): JSX.Element {
    const tickFracs = useMemo(() => ticks?.map((o) => ordToFrac(o, max)), [ticks, max]);
    return (
        <Rail<number>
            label={label}
            ranges={[{ from: 1, to: value }]}
            cut
            removable={false}
            toFrac={(v) => ordToFrac(v, max)}
            fromFrac={(f) => fracToOrd(f, max)}
            fmt={(v) => `≤${v}`}
            minLabel="1위"
            maxLabel={`${max} (√)`}
            ticks={tickFracs}
            onChange={(next) => {
                const to = next[next.length - 1]?.to;
                if (typeof to === "number" && to !== value) onChange(to);
            }}
        />
    );
}

/**
 * 작은 정수 컷(선형) — 존순위 ≤ r 처럼 도메인이 한 자릿수인 컷. 기본 상한 10, 저장값이 넘으면
 * 도메인을 늘려 값이 화면 밖으로 밀리지 않게 한다(옛 저장물 보호 — 사용자 확정).
 */
export function SmallCutRail({ label, value, ticks, onChange }: {
    label: string;
    value: number;
    /** 모수 타점의 값들(1..) — 있으면 분포 표식. */
    ticks?: readonly number[];
    onChange: (value: number) => void;
}): JSX.Element {
    const max = Math.max(10, value);
    const linFrac = (v: number): number => (Math.min(Math.max(v, 1), max) - 1) / (max - 1);
    const tickFracs = useMemo(
        () => ticks?.map((o) => linFrac(o)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [ticks, max],
    );
    return (
        <Rail<number>
            label={label}
            ranges={[{ from: 1, to: value }]}
            cut
            removable={false}
            toFrac={linFrac}
            fromFrac={(f) => Math.min(max, Math.max(1, 1 + Math.round(Math.min(Math.max(f, 0), 1) * (max - 1))))}
            fmt={(v) => `≤${v}`}
            minLabel="1위"
            maxLabel={`${max}`}
            ticks={tickFracs}
            onChange={(next) => {
                const to = next[next.length - 1]?.to;
                if (typeof to === "number" && to !== value) onChange(to);
            }}
        />
    );
}
