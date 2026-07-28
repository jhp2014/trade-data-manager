// 뉴스 패널 공용 조각 — HTS 뉴스(NewsPanel)와 텔레그램(TelegramNewsPanel)이 같이 쓴다.
// 두 패널은 피드 의미가 정말 다르지만(DB 커서 · KIS 앵커 되감기 · 텔레그램 날짜 페이징)
// **목록을 훑는 방식**은 같다: 페이지 평탄화+dedup, 스크롤 최상단 추적, 키워드 하이라이트.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Plane } from "../../store/usePlaneBus.js";

/** 페이지 배열 → 평탄화 + 키 dedup(순서 유지). 페이징 경계가 겹쳐 오는 소스(앵커 ≤ 포함)를 흡수한다. */
export function dedupPages<T>(pages: T[][] | undefined, keyOf: (item: T) => string): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of pages ?? []) {
        for (const item of page) {
            const k = keyOf(item);
            if (!seen.has(k)) {
                seen.add(k);
                out.push(item);
            }
        }
    }
    return out;
}

/**
 * 스크롤 최상단에 걸린 항목의 data 값 추적 — 헤더 2줄의 "지금 보고 있는 날짜/시각".
 * rAF 스로틀(스크롤마다 setState 하면 목록이 길 때 끊긴다). 컨테이너 상단 8px 안쪽까지를 "지나간" 것으로 본다.
 *
 * @param attr 읽을 data 속성 이름(카멜케이스 dataset 키). 그 속성을 가진 요소만 후보.
 */
export function useTopVisible<T extends HTMLElement>(
    ref: RefObject<T | null>,
    attr: string,
): { current: string | null; onScroll: () => void; reset: () => void } {
    const [current, setCurrent] = useState<string | null>(null);
    const rafRef = useRef(0);

    const onScroll = useCallback((): void => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const c = ref.current;
            if (!c) return;
            const top = c.getBoundingClientRect().top;
            let found = "";
            for (const el of c.querySelectorAll<HTMLElement>(`[data-${camelToData(attr)}]`)) {
                if (el.getBoundingClientRect().top - top <= 8) found = el.dataset[attr] ?? found;
                else break; // 목록은 위→아래 순 — 하나라도 아래면 나머지도 아래
            }
            if (found) setCurrent(found);
        });
    }, [ref, attr]);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
    return { current, onScroll, reset: useCallback(() => setCurrent(null), []) };
}

const camelToData = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * 키워드 매치를 .tg-hl 칩으로. counter 를 주면 매치마다 전역 인덱스를 매겨 data-hl-index 로 심는다
 * (텔레그램의 Ctrl+F 식 좌우탐색이 그 인덱스로 스크롤한다). re 가 없으면 원문 그대로.
 */
export function highlightMatches(
    text: string,
    re: RegExp | null,
    opts?: { counter: { n: number }; activeMatch: number },
): ReactNode[] {
    if (!re) return [text];
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
        const idx = m.index ?? 0;
        if (idx > last) nodes.push(text.slice(last, idx));
        if (opts) {
            const gi = opts.counter.n++;
            nodes.push(
                <span className={gi === opts.activeMatch ? "tg-hl tg-hl-active" : "tg-hl"} data-hl-index={gi} key={`${idx}-${gi}`}>
                    {m[0]}
                </span>,
            );
        } else {
            nodes.push(
                <span className="tg-hl" key={idx}>
                    {m[0]}
                </span>,
            );
        }
        last = idx + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

/** 매치 개수(하이라이트와 같은 정규식 기준) — 좌우탐색 총량 표시용. */
export function countMatches(text: string, re: RegExp | null): number {
    if (!re) return 0;
    let n = 0;
    for (const _m of text.matchAll(re)) n++;
    return n;
}

/** 조회 모드 — 종목(포커스 종목) / 전체(종목 무시). 두 뉴스 패널 공통. */
export type NewsMode = "stock" | "all";

// 모드 세그먼트 — 보드 컨트롤과 같은 가벼운 텍스트 스타일(테두리·채움 없음).
function segBtn(active: boolean): React.CSSProperties {
    return {
        border: "none",
        background: "none",
        padding: "0 3px",
        cursor: "pointer",
        font: "inherit",
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    };
}

export function ModeSegment({ mode, setMode, allTitle }: { mode: NewsMode; setMode: (m: NewsMode) => void; allTitle?: string }): JSX.Element {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <button style={segBtn(mode === "stock")} onClick={() => setMode("stock")} title="포커스 종목 뉴스">종목</button>
            <span style={{ color: "var(--border-default)" }}>·</span>
            <button style={segBtn(mode === "all")} onClick={() => setMode("all")} title={allTitle ?? "전체 시황 뉴스(종목 무시)"}>전체</button>
        </span>
    );
}

/** 플레인 표시 점 — 실시간=앰버 / 복기=teal. 탭 색과 같은 토큰. */
export function PlaneDot({ plane }: { plane: Plane }): JSX.Element {
    const key = plane === "live" ? "live" : "eod";
    return (
        <span
            style={{ width: 7, height: 7, borderRadius: 999, background: `var(--plane-${key})`, flexShrink: 0 }}
            title={plane === "live" ? "실시간 플레인" : "복기 플레인"}
        />
    );
}

/** 본문 가운데 안내(로딩·오류·빈 결과). 문자열이면 기본 톤으로 감싼다. */
export function NewsCenter({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 20px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            {children}
        </div>
    );
}

/** 날짜 구분선 — 목록 중간에 끼는 sticky 라벨. data-date-divider 는 useTopVisible 추적 대상. */
export function DateDivider({ date, label }: { date: string; label: string }): JSX.Element {
    return (
        <div data-date-divider data-date={date} className="tabular" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-secondary)" }}>
            {label}
        </div>
    );
}
