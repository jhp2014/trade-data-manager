// 골격 겹쳐 그리기의 **손짓** — 선 클릭(이동·캔들)과 그룹 메뉴 열기.
//
// ## 선택 채널은 **없다**(2026-08-22 재편) — 굵은 선은 늘 시선(subject)이다
// 옛 구조는 채널이 둘이었다: 전역 시선(focus/activePoint)과 패널의 선택 집합(Ctrl+클릭·사각 선택).
// 둘이 같은 표기(굵은 파란 선)를 그리는데 갱신 시점이 달라, 평클릭으로 만들어진 1개짜리 선택이
// **시선을 붙박아** 놓고 작업 대상 패널만 앞서 나가는 어긋남이 났다(✕ 로 선택을 비워야 연동이 돌아왔다).
// 고친 방식은 폴백 강화가 아니라 **채널을 하나로 줄이는 것**이다 — 어긋날 수 있는 상태를 없앤다.
//
// 그래서 다중 선택과 그 위에 서 있던 것들(Ctrl+클릭 토글·Ctrl+드래그 사각 선택·"선택 N개 일괄 그룹")도
// 함께 은퇴했다(사용자 확정: "여러 선택이라는 게 애매해진다"). 그룹은 **라벨·마커 우클릭 = 하나씩**.
// 잃은 건 일괄 붙이기 하나고, 얻은 건 "골격에서 굵은 선 = 지금 보는 것"이라는 예외 없는 규칙이다.
//
// 시선이 이 뷰의 선 키로 풀리는 방식은 subject 가 안다(lib/subject.ts): 차트 단위 뷰(일봉)면 차트키
// 하나, 타점 단위 뷰(분봉)면 그 시각의 타점 하나 — **시각이 없는 하루 시선이면 그날 전 타점**이다.
// 그래서 일봉에서 하루를 짚으면 분봉 골격에서 그날 선들이 통째로 굵어진다(패널이 알아서 편다).
import { useCallback, useMemo, useState } from "react";
import { useWorkbench } from "../../store/workbench.js";
import type { OverlayLine } from "./skeletonOverlay.js";
import { shortDate } from "../../lib/date.js";
import type { PointRef } from "../../lib/pointKey.js";
import type { OverlayData } from "./useOverlayData.js";

// ── 그룹 메뉴 — 라벨/마커 우클릭. 어느 정션에 쓰느냐는 여기 규약이다:
// 차트 라벨 → 차트 그룹 / 타점 마커 → 타점 그룹. DB 사전은 하나.
export type GroupMenuState =
    | { kind: "chart"; x: number; y: number; charts: { stockCode: string; date: string }[]; label: string }
    | { kind: "point"; x: number; y: number; points: PointRef[]; label: string };

export interface OverlaySelection {
    /** 이 뷰에서 **굵게 설 선들** = 시선이 가리키는 것 중 지금 그려져 있는 것. 오직 이것뿐이다. */
    effSelected: ReadonlySet<string>;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
    groupMenu: GroupMenuState | null;
    closeGroupMenu: () => void;
    openGroupMenuFor: (s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    openPointGroupMenu: (points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }) => void;
}

export function useOverlaySelection(args: {
    isDaily: boolean;
    byKey: ReadonlyMap<string, OverlayLine>;
    subjectKeys: OverlayData["subjectKeys"];
    nameOf: (code: string) => string;
    /**
     * 캔들 토글 — 이 훅의 **유일한 역방향 의존**: useCandles 는 조사 대상(단일 시선 → 스냅샷)에서
     * 파생되므로 이 훅보다 뒤에 태어난다. 클릭 시점에만 부르는 값이라 패널이 최신 참조로 잇는다.
     */
    toggleCandle: (code: string) => void;
}): OverlaySelection {
    const { isDaily, byKey, subjectKeys, nameOf, toggleCandle } = args;

    const goToPoint = useWorkbench((s) => s.goToPoint);
    const goToDay = useWorkbench((s) => s.goToDay);

    // 굵은 선 = 시선 ∩ 지금 그려진 선. 시선이 필터 밖이면 아무것도 안 굵어진다(머리글 배지가 이유를 말한다).
    const effSelected = useMemo<ReadonlySet<string>>(
        () => new Set([...subjectKeys].filter((k) => byKey.has(k))),
        [subjectKeys, byKey],
    );

    /** 클릭 = 그 선으로 **이동**(시선 발행). 굵은 선을 다시 클릭하면 캔들 토글.
     *
     *  Ctrl 은 더 이상 선택 손짓이 아니다(다중 선택 은퇴) — 평클릭과 같게 두는 게 맞다: Mac 의
     *  Ctrl+클릭은 우클릭 대용이고, 골격 본문에서 Ctrl 은 이제 아무 뜻도 없다(세로 확대 휠은 Shift).
     *
     *  **굵은 선 재클릭 = 캔들 토글**(사용자 확정): 첫 클릭의 일(이동)은 안 뺏고, 원래 아무 일도 안 하던
     *  자리(같은 곳으로 다시 이동)에 얹었다. 굵은 선이 하나일 때만 — 하루 시선이면 주인공이 안 정해진다. */
    const onLabelClick = useCallback((s: OverlayLine): void => {
        // 캔들을 켜는 건 **타점 단위 선(분봉)** 과 **일봉 차트 선** 둘 다(사용자 확정).
        // 분봉 절대 뷰는 빠진다 — 거기 선은 하루 경로 전체라 캔들의 주인공이 정해지지 않는다.
        const candleable = s.kind === "point" || isDaily;
        if (candleable && effSelected.size === 1 && effSelected.has(s.key)) {
            toggleCandle(s.stockCode);
            return;
        }
        if (s.kind === "point") {
            goToPoint({ code: s.stockCode, date: s.date, time: s.time }, "skeleton-overlay");
            return;
        }
        // 차트 라벨 = **day 시선**(사용자 확정 규칙: "골격 선택 = day scope"). 옛 "첫 타점으로 점프"는
        // point 를 발행해 의미론이 갈렸다 — 타점 순회는 w/s 가 있으니 편의 손실은 작다.
        goToDay({ code: s.stockCode, date: s.date }, "skeleton-overlay");
    }, [effSelected, goToPoint, goToDay, toggleCandle, isDaily]);

    const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
    const closeGroupMenu = useCallback(() => setGroupMenu(null), []);
    /** 선 라벨 우클릭 — 이 선의 정션으로 간다: 타점 단위 선은 타점 그룹, 차트 단위 선은 차트 그룹. */
    const openGroupMenuFor = useCallback((s: OverlayLine, ev: { clientX: number; clientY: number; preventDefault: () => void }): void => {
        ev.preventDefault();
        if (s.kind === "point") {
            setGroupMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points: [{ stockCode: s.stockCode, date: s.date, time: s.time }], label: `${nameOf(s.stockCode)} ${s.time.slice(0, 5)}` });
            return;
        }
        setGroupMenu({ kind: "chart", x: ev.clientX, y: ev.clientY, charts: [{ stockCode: s.stockCode, date: s.date }], label: `${nameOf(s.stockCode)} ${shortDate(s.date)}` });
    }, [nameOf]);
    const openPointGroupMenu = useCallback((points: PointRef[], label: string, ev: { clientX: number; clientY: number; preventDefault?: () => void }): void => {
        ev.preventDefault?.();
        if (points.length > 0) setGroupMenu({ kind: "point", x: ev.clientX, y: ev.clientY, points, label });
    }, []);

    return { effSelected, onLabelClick, groupMenu, closeGroupMenu, openGroupMenuFor, openPointGroupMenu };
}
