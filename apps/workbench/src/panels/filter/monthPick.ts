// 달 고르기 — 결과 목록과 집합 사이드바가 **같은 문법**을 쓰게 하는 한 벌.
//
// ## 달은 시선이지 조건이 아니다
// 고른 달은 다른 패널이 구독하는 집합도, 5칸 숫자도 안 바꾼다. 그래서 저장도 안 하고 URL 에도 안 싣는다 —
// "지금 내가 어디를 훑고 있나"일 뿐이다.
//
// ## 왜 여럿을 고를 수 있게 됐나
// 달이 페이지였던 건 목록이 **다 그려졌기** 때문이다(앞 1,000건에서 잘렸다). 목록이 가상화된 뒤로 그
// 제약이 없어졌으므로, 달은 페이지가 아니라 **필터 없는 시선**이 될 수 있다: 7·8월을 나란히 놓고 훑는
// 일이 복기에서는 흔하다.
//
// ## 손짓 (시트·보드와 같은 문법)
//   · 클릭       = 그 달 하나로 갈아탄다
//   · Ctrl/⌘+클릭 = 더하기·빼기(마지막 하나는 안 빠진다 — 빈 화면이 되므로)
//   · Shift+클릭  = 기준부터 여기까지(달은 순서가 있어 범위가 자연스럽다)
import { useCallback, useMemo, useRef, useState } from "react";

/** 손짓에 붙는 안내 — 두 패널의 툴팁이 갈리지 않게 여기서 한 번 쓴다. */
export const MONTH_PICK_HINT = "클릭 = 이 달만 · Ctrl+클릭 = 더하기/빼기 · Shift+클릭 = 범위";

/**
 * 손짓 하나의 순수 결과 — 훅(로컬 시선)과 작업셋(전역 월 시선 스토어)이 **같은 규칙**을 쓴다.
 * anchor 는 호출부가 든다(Shift 범위의 기준 — 상태가 아니라 마지막 맨클릭의 기억).
 */
export function applyMonthClick(
    base: ReadonlySet<string>,
    months: readonly string[],
    anchor: string | null,
    ym: string,
    mods: { ctrl: boolean; shift: boolean },
): ReadonlySet<string> {
    if (mods.shift && anchor !== null) {
        const a = months.indexOf(anchor);
        const b = months.indexOf(ym);
        if (a >= 0 && b >= 0) return new Set(months.slice(Math.min(a, b), Math.max(a, b) + 1));
    }
    if (mods.ctrl) {
        const next = new Set(base);
        // 마지막 하나는 안 뺀다 — 빈 집합은 "아무 달도 안 봄"이라 화면이 사라진다.
        if (next.has(ym)) { if (next.size > 1) next.delete(ym); } else next.add(ym);
        return next;
    }
    return new Set([ym]);
}

/** 죽은 달 정리 + 빈 집합 방지 — 읽을 때 정한다(상태를 고쳐 쓰면 렌더 중 갱신·빈 프레임이 스친다). */
export function normalizeMonths(sel: ReadonlySet<string>, months: readonly string[]): ReadonlySet<string> {
    const live = new Set([...sel].filter((m) => months.includes(m)));
    return live.size > 0 ? live : new Set(months.length > 0 ? [months[0]!] : []);
}

export interface MonthPick {
    /** 고른 달들 — **절대 비지 않는다**(비면 빈 화면이 되고, 그건 아무 뜻도 아니다). */
    picked: ReadonlySet<string>;
    /** 여럿을 고르고 있나 — 목록에 달 구분줄을 세울지의 기준. */
    multi: boolean;
    /** 손짓 하나 처리. `mods` 는 마우스 이벤트에서 그대로 온다. */
    click: (ym: string, mods: { ctrl: boolean; shift: boolean }) => void;
}

/**
 * @param months 존재하는 달(등장 순서 = 최근 먼저). 조건 편집으로 통째로 갈릴 수 있다.
 */
export function useMonthPick(months: readonly string[]): MonthPick {
    const [sel, setSel] = useState<ReadonlySet<string>>(() => new Set());
    /** 범위의 기준점 — Shift 없이 마지막으로 누른 달. */
    const anchor = useRef<string | null>(null);

    // 조건이 바뀌어 사라진 달은 버린다. 남은 게 없으면 가장 최근 달 하나 — **빈 목록을 안 보여준다**.
    // ⚠ 상태를 여기서 고쳐 쓰지 않고 **읽을 때 정한다**: 목록이 바뀔 때마다 setState 하면 렌더 중
    //   상태 갱신이 되거나(경고) 한 프레임 동안 빈 화면이 스친다.
    const picked = useMemo<ReadonlySet<string>>(() => normalizeMonths(sel, months), [sel, months]);

    const click = useCallback((ym: string, mods: { ctrl: boolean; shift: boolean }): void => {
        setSel((cur) => {
            const next = applyMonthClick(normalizeMonths(cur, months), months, mods.shift ? anchor.current : null, ym, mods);
            if (!mods.shift) anchor.current = ym;
            return next;
        });
    }, [months]);

    return { picked, multi: picked.size > 1, click };
}
