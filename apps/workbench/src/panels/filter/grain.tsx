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

/** 층위 한 칸 — 머리 띠 + 그 층위에 속한 줄들을 잇는 세로선. */
export function GrainSection({ grain, sticky = false, right, children }: {
    grain: Grain;
    /** 스크롤되는 목록에서는 머리 띠가 붙어 있어야 어느 칸인지 계속 보인다. */
    sticky?: boolean;
    right?: ReactNode;
    children: ReactNode;
}): JSX.Element {
    return (
        <div style={{ marginBottom: 4 }}>
            <div style={{
                position: sticky ? "sticky" : "static", top: 0, zIndex: 2,
                display: "flex", alignItems: "center", gap: 7, padding: "3px 8px",
                background: "var(--bg-tertiary)", borderLeft: `3px solid ${STRIPE}`,
            }}>
                <span title={GRAIN_HINT[grain]} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                    {GRAIN_TITLE[grain]}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{GRAIN_UNIT[grain]}</span>
                {right && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>{right}</span>}
            </div>
            <div style={{ borderLeft: `3px solid ${STRIPE}` }}>{children}</div>
        </div>
    );
}
