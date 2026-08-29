// 층위(하루·타점)의 시각 표기 — **필터 목록과 보드가 같은 언어로** 층위를 말해야 한다.
// 두 화면이 같은 개념을 다르게 그리면 "위의 하루"와 "아래의 하루"가 같은 것인지 눈이 매번 확인한다.
//
// 색은 **한 가지 회색**이다. 이 앱은 색이 이미 의미로 꽉 차 있어서(빨강=필터 · 파랑=활성 · 보라=핀 ·
// 앰버=호버) 층위에 새 색을 주면 그 색이 다른 뜻으로 읽힌다.
//
// ⚠ 처음엔 두 층위를 **밝기로** 갈랐다가 되돌렸다: 옅은 쪽(타점)이 통째로 **비활성처럼** 보였다.
// 이 화면에서 옅음은 이미 "꺼짐"의 뜻이라 층위 구분에 쓸 수 없다. 구분은 머리 띠의 이름이 하고,
// 세로선은 그 칸이 어디까지인지만 말한다(그래서 두 층위가 같은 색이어도 헷갈리지 않는다).
import type { ReactNode } from "react";
import type { Grain } from "./stage.js";

export const GRAIN_TITLE: Record<Grain, string> = { day: "하루", point: "타점" };
export const GRAIN_UNIT: Record<Grain, string> = { day: "종목 · 날짜", point: "종목 · 날짜 · 시각" };
export const GRAIN_HINT: Record<Grain, string> = {
    day: "종목·날짜 단위 — 차트 그룹 · 하루 축 · 날짜",
    point: "종목·날짜·시각 단위 — 타점 그룹 · 타점 축 · 시간",
};

/** 층위 칸의 세로선 — 두 층위가 같은 값이다(밝기 차이는 비활성으로 읽힌다). */
const STRIPE = "var(--text-tertiary)";

/**
 * 칸 껍데기 — 머리 띠 + 그 칸의 줄들을 잇는 세로선. 층위 칸(GrainSection)과 테마 칸(UI 그룹핑 —
 * 행 정체성은 타점이라 grain 이 아니다)이 같은 겉을 써야 보드가 목록 하나로 읽힌다.
 *
 * ⚠ 머리 띠는 **안 붙인다**(sticky 폐지). 보드에서만 붙어 있었는데, 스크롤 중에도 "하루/타점"이 보이는
 * 이득보다 띠가 레일 위에 겹쳐 지나가는 손해가 컸다 — 어느 칸인지는 세로선이 이미 말한다.
 */
export function Section({ title, unit, hint, right, footer, children }: {
    title: string;
    unit: string;
    hint: string;
    right?: ReactNode;
    /** 칸의 **맨 아래** 줄(서랍) — 세로선 안에 든다. 그 칸에 속한 것이지 다음 칸의 머리가 아니라서. */
    footer?: ReactNode;
    children: ReactNode;
}): JSX.Element {
    return (
        <div style={{ marginBottom: 4 }}>
            <div style={{
                display: "flex", alignItems: "center", gap: 7, padding: "3px 8px",
                background: "var(--bg-tertiary)", borderLeft: `3px solid ${STRIPE}`,
            }}>
                <span title={hint} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                    {title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{unit}</span>
                {right && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>{right}</span>}
            </div>
            <div style={{ borderLeft: `3px solid ${STRIPE}` }}>
                {children}
                {footer}
            </div>
        </div>
    );
}

/** 칸 안의 안내 한 줄(불러오는 중·축 없음) — 조건 줄과 밝기·크기로 갈린다. 두 화면이 같은 말투를 쓴다. */
export function Note({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ padding: "4px 10px 8px", fontSize: 10.5, color: "var(--text-tertiary)" }}>{children}</div>;
}

/** 층위 한 칸 — Section 의 층위 어휘 래퍼(기존 소비자 시그니처 유지). */
export function GrainSection({ grain, right, footer, children }: {
    grain: Grain;
    right?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}): JSX.Element {
    return (
        <Section title={GRAIN_TITLE[grain]} unit={GRAIN_UNIT[grain]} hint={GRAIN_HINT[grain]} right={right} footer={footer}>
            {children}
        </Section>
    );
}
