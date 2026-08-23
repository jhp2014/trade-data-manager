// 골격 겹쳐 그리기의 **칩 어휘** — 그림 위에 얹히는 작은 글자 손잡이의 공통 모양.
//
// 어느 한 층의 소유가 아니다: 선 라벨(LabelLayer)과 테마 이름 거터가 같은 칩을 쓴다. 한쪽에 두고
// 다른 쪽이 가져다 쓰면 "왜 저기 있나"가 생기므로 어휘만 따로 세운다.
import type { CSSProperties } from "react";

/**
 * 상자 없이 후광 글자 + 그 선 색의 점. **색 점은 언제나 끝점을 마주 보는 쪽**에 서서 이 글자가
 * 어느 선의 것인지 가리킨다(칩이 점 바깥에 서므로 칩의 안쪽 끝이 곧 점 쪽이다).
 */
export const chip: CSSProperties = {
    position: "absolute", pointerEvents: "auto", cursor: "pointer", whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 3,
    fontFamily: "var(--font-sans)", fontSize: 9, lineHeight: "11px", fontVariantNumeric: "tabular-nums",
    padding: 0, border: "none", background: "none", color: "var(--text-primary)",
    textShadow: "0 0 3px var(--bg-primary), 0 0 3px var(--bg-primary), 0 0 2px var(--bg-primary)",
};

/**
 * 얽힌 선 **위에 얹히는** 칩의 판독 배경 — 후광 글자만으로는 선이 밀집한 자리에서 글자가 묻힌다
 * (사용자 지적: 테마 값·타점 라벨이 골격 선에 가려 안 읽힘). 반투명 배경이 뒤 선을 죽이지 않으면서
 * 글자 자리만 비워 준다. **거터처럼 빈 자리에 서는 라벨은 이걸 안 얹는다** — 후광만으로 충분하다.
 */
export const labelBg: CSSProperties = {
    background: "color-mix(in srgb, var(--bg-primary) 85%, transparent)",
    borderRadius: 3, padding: "0 3px", textShadow: "none",
};

/** 뱃지는 상자 유지 — 누르면 목록이 열리는 컨트롤이라 그렇게 보여야 한다. */
export const badgeChip: CSSProperties = {
    padding: "0 4px", borderRadius: 6, background: "var(--bg-secondary)",
    border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textShadow: "none",
};

/** 선택된 라벨만 상자를 되받는다 — 클릭이 실제로 먹었다는 신호가 색만으로는 약하다. */
export const selectedChip = (color: string): CSSProperties => ({
    background: "var(--bg-secondary)", border: `1px solid ${color}`, borderRadius: 3,
    padding: "1px 4px", textShadow: "none",
});

/** 칩이 가리키는 선의 색 점. */
export const labelDot = (color: string): CSSProperties => ({ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 });
