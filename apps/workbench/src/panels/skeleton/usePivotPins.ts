// 피벗 값 붙잡기 — **짚은 점에만** 좌표가 붙는다(사용자 확정).
//
// 예전엔 조사 중인 골격의 점 **전부**에 값이 떴는데, 분봉 골격은 꺾인 점이 많아 화면이 숫자로 뒤덮였다.
// 이제 두 단계다: 손을 올리면 그 하나를 **미리 보고**, 누르면 **붙잡는다**(다시 누르면 뗀다).
// 붙잡은 건 선을 떠나도 남아서 여러 점의 값을 나란히 놓고 볼 수 있다 — 이 패널의 선택/호버 문법 그대로.
//
// ⚠ 이 상태는 **골격선 층도 읽는다**(`shown` 이 점 반지름과 값 라벨을 정한다). 테마의 `lineShown` 과
// 같은 사정이다 — 판정이 이쪽 지식이라 이쪽이 소유하고, 그리는 층은 물어보기만 한다.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NormalizedSkeleton } from "./skeletonOverlay.js";

/** 핀 하나의 식별자 — `선키|점인덱스`. 구분자 `|` 는 선키가 이미 쓰지만 **마지막 것**만 자른다. */
const pinId = (key: string, i: number): string => `${key}|${i}`;
const lineOfPin = (id: string): string => id.slice(0, id.lastIndexOf("|"));
const indexOfPin = (id: string): number => Number(id.slice(id.lastIndexOf("|") + 1));

export interface PivotPins {
    /** 이 점의 값을 지금 그리나 — 붙잡았거나(핀) 손이 올라가 있거나. */
    shown: (key: string, i: number) => boolean;
    /** 붙잡힌 것인가 — 스치는 미리보기와 진하기가 갈린다. */
    isPinned: (key: string, i: number) => boolean;
    toggle: (key: string, i: number) => void;
    clear: () => void;
    count: number;
    /**
     * 지금 화면에 있는 선의 핀 수 — 작업줄 표기용. 저장엔 사라진 선의 핀(유령)이 남는다(일부러 —
     * 필터를 풀면 되살아난다. selectedCharts 와 같은 규칙). 세는 것만 현재 목록으로 거른다.
     * ⚠ clear 는 여전히 **전부** 비운다 — 유령만 남기면 비웠는데 개수가 살아나는 이상한 그림이 된다.
     */
    countIn: (present: (lineKey: string) => boolean) => number;
    /** 값을 그리는 점이 하나라도 있는 선 — 그 선은 손잡이를 계속 내줘야 핀을 뗄 수 있다. */
    linesWithPins: ReadonlySet<string>;
    setHoveredPivot: (at: { key: string; i: number } | null) => void;
    /**
     * 앵커 골격에서 붙잡은 피벗의 x(뷰 공간, 시각 순) — 테마 값을 펼치는 세로선이 서는 자리.
     * 테마 선도 뷰 공간이라 이 x 로 바로 값을 찾는다(벽시계는 표시할 때만 + t₀).
     */
    pinnedXs: number[];
    /**
     * 지금 테마 값을 펼쳐 보는 x — 상시가 아니라 **손을 올렸을 때만**(사용자 확정).
     * 두 손짓이 같은 자리로 들어온다: 앵커 골격의 **어느 피벗에든 호버**(붙잡은 것이 아니어도)와,
     * 붙잡은 핀의 세로선 호버. 값을 보려고 굳이 먼저 클릭해야 할 이유가 없다.
     */
    openReadingX: number | null;
    setHoveredPinLine: (x: number | null) => void;
    /** 앵커 골격의 피벗 시각(벽시계 분) — 거래대금 라벨의 세그먼트 경계이자 테마 점이 설 수 있는 자리 전부. */
    anchorMinutes: number[];
}

export function usePivotPins({ target, resetKey, anchorKey }: {
    /** 지금 조사 중인 선(단일 선택) — 핀의 x 좌표와 피벗 시각의 출처. */
    target: NormalizedSkeleton | null;
    /** 이게 바뀌면 세로선 호버를 접는다(테마가 갈리면 펼칠 값도 갈린다). */
    resetKey: string | undefined;
    /** 좌표계가 갈리는 축(정규화 기준) — 바뀌면 붙잡은 값을 버린다. */
    anchorKey: string;
}): PivotPins {
    const [hoveredPivot, setHoveredPivot] = useState<{ key: string; i: number } | null>(null);
    const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
    const [hoveredPinLine, setHoveredPinLine] = useState<number | null>(null);

    // 붙잡아 둔 값은 **기준(앵커)이 바뀌면** 버린다 — 좌표계가 갈리면 같은 인덱스가 다른 뜻이 된다.
    // 척도 변경(확대·필터)엔 안 건드린다: 같은 그림을 다르게 볼 뿐이라 값이 남아야 한다.
    useEffect(() => { setPinned(new Set()); }, [anchorKey]);
    useEffect(() => { setHoveredPinLine(null); }, [resetKey]);

    const toggle = useCallback((key: string, i: number): void => {
        setPinned((prev) => {
            const next = new Set(prev);
            const id = pinId(key, i);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const linesWithPins = useMemo(() => {
        const s = new Set<string>();
        for (const id of pinned) s.add(lineOfPin(id));
        return s;
    }, [pinned]);

    const pinnedXs = useMemo(() => {
        if (!target) return [];
        return [...pinned]
            .filter((id) => lineOfPin(id) === target.key)
            .map(indexOfPin)
            .filter((i) => Number.isInteger(i) && i >= 0 && i < target.points.length)
            .map((i) => target.points[i].x)
            .sort((a, b) => a - b);
    }, [target, pinned]);

    const openReadingX = useMemo(() => {
        if (hoveredPinLine !== null) return hoveredPinLine;
        if (!target || !hoveredPivot || hoveredPivot.key !== target.key) return null;
        const p = target.points[hoveredPivot.i];
        return p ? p.x : null;
    }, [hoveredPinLine, target, hoveredPivot]);

    const anchorMinutes = useMemo(
        () => (target ? target.points.map((p) => p.x + target.baseT) : []),
        [target],
    );

    return {
        shown: (key, i) => pinned.has(pinId(key, i)) || (hoveredPivot?.key === key && hoveredPivot.i === i),
        isPinned: (key, i) => pinned.has(pinId(key, i)),
        toggle,
        clear: () => setPinned(new Set()),
        count: pinned.size,
        countIn: (present) => {
            let n = 0;
            for (const id of pinned) if (present(lineOfPin(id))) n++;
            return n;
        },
        linesWithPins,
        setHoveredPivot,
        pinnedXs,
        openReadingX,
        setHoveredPinLine,
        anchorMinutes,
    };
}
