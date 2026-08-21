// 필터 화면의 공용 조각 — 같은 뜻의 버튼·입력이 파일마다 다른 값으로 복붙돼 있으면
// 한 곳을 고쳤을 때 나머지가 조용히 어긋난다(점선 버튼 셋이 실제로 그랬다).
//
// ⚠ 어휘: **화면 문구는 "필터"**, 코드 식별자는 `stage`(단계) 그대로다. `stage` 는 core 깔때기 정산이
// 쓰는 모델 낱말이라(상류·새로 죽임이 그 순서에 매여 있다) 표시 이름 때문에 바꾸지 않는다.
import type { CSSProperties } from "react";

/** 점선 보조 버튼(취소·적용·구간 추가) — 화면에서 "덜 중요한 조작"의 공통 표기. */
export const dashedBtn: CSSProperties = {
    fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)",
    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
    // 칩 줄은 가로 스크롤(ScrollRow)이라 — 안 그으면 넘치는 대신 버튼이 쭈그러들어 글자가 뭉개진다.
    flexShrink: 0, whiteSpace: "nowrap",
};

/** 제거(✕) 아이콘 버튼 — 글자만, 배경 없음. */
export const xBtn: CSSProperties = {
    border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
    fontSize: 10, lineHeight: 1, padding: "0 2px",
};

/** 좁은 수치·시각 입력칸(구간 양끝). 숫자는 tabular 로 자리가 안 흔들리게. */
export const numInput: CSSProperties = {
    width: 84, boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "3px 6px", fontSize: 12, outline: "none",
    fontVariantNumeric: "tabular-nums",
};

/** 검색 등 한 줄 텍스트 입력(폭 100%). */
export const textInput: CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "4px 7px", fontSize: 12.5, outline: "none",
};

/** 팝오버 안 목록 행(버튼) — 가장자리까지 차는 좌측정렬. */
export const listRow: CSSProperties = {
    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
    color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 12.5, padding: "6px 10px",
};

/** 행 끝의 작은 아이콘 버튼(끄기·지우기). */
export const iconBtn: CSSProperties = {
    border: "none", background: "transparent", color: "var(--text-tertiary)",
    cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "1px 2px", flexShrink: 0,
};

/** 적용 버튼 — 누를 수 있을 때만 강조색(못 누르는 버튼이 색을 쓰면 눌러도 되는 줄 안다). */
export const commitBtn = (enabled: boolean): CSSProperties => ({
    ...dashedBtn,
    color: enabled ? "var(--accent-primary)" : "var(--text-tertiary)",
    ...(enabled ? { borderColor: "var(--accent-primary)" } : {}),
});
