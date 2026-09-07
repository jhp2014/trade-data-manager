// 시선 종목의 **테마 칩 줄** — 다중 테마를 갈라 보는 렌즈이자, 어느 테마가 조건을 통과시키는지 말하는 자리.
//
// 왜 필요한가: 산점의 동료(teal)는 소속 **전 테마의 합집합**이라, 두 테마에 걸친 종목에서는 "teal 3개가
// 보이는데 동료 ≥3 은 불통과" 가 원리적으로 생긴다(판정은 테마 단위 AND · 테마 사이 ∃ — decisions.md).
// 눈과 판정이 어긋나던 그 자리를 이 줄이 메운다: 칩 하나 = 테마 하나 = 판정 단위.
//
// 두 역할이 한 칩에 겹쳐 있다:
//   · 렌즈(택1) — 그 테마 멤버만 동료로 남기고 나머지는 회색으로 내린다(색을 늘리지 않는 갈라 보기).
//   · 진단(✓/✗) — 그 테마 **단독**으로 활성 조건을 다 만족하나. 재료는 themeVerdicts 하나(∃ 접기 전).
// 렌즈는 **조건이 아니다** — 깔때기·저장 집합에 안 들어가고 헤더 카운트를 건드리지 않는다(순수 시선 도구).
import type { CSSProperties } from "react";
import type { ThemeVerdict } from "../../lib/themeStrength.js";
import { FILTER, STRONG } from "../../styles/palette.js";

export function ThemeLensStrip({ themes, lens, onPick, verdicts, colorOf, status }: {
    /** 시선 종목의 소속 테마(읽기 시점 인덱스 순서). */
    themes: readonly string[];
    /** 테마 → 색(themeColorMap). 산점 점 색과 **같은 출처**여야 이 줄이 범례로 선다. */
    colorOf: ReadonlyMap<string, string>;
    /** 켜진 렌즈(= themes 안의 하나) 또는 null(전체 = 합집합). */
    lens: string | null;
    onPick: (theme: string | null) => void;
    /** 테마명 → 진단. null = 진단할 조건이 없다(연동 행 없음·조건 전부 꺼짐) → 표식 없이 이름만. */
    verdicts: ReadonlyMap<string, ThemeVerdict> | null;
    /** 멤버십 재료 상태 — ready 가 아니면 칩을 세우지 않고 그 사실을 말한다(아래 주석). */
    status: "ready" | "loading" | "error";
}): JSX.Element {
    // 재료가 없을 때 빈 칩 줄을 세우면 "이 종목은 테마가 없다"로 읽힌다 — 산점도 점 하나뿐이라
    // 화면 어디에도 반증이 없다. 모름은 모름이라고 말한다(결손은 결손, 이 레포 공통 규칙).
    if (status !== "ready") {
        return (
            <span style={group}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>테마</span>
                <span style={{ ...chip, cursor: "default", ...(status === "error" ? { color: FILTER, borderColor: FILTER } : null) }}>
                    {status === "error" ? "재료 오류 — 동료를 못 셉니다" : "재료 오는 중…"}
                </span>
            </span>
        );
    }
    return (
        <span style={group}>
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>테마</span>
            <button onClick={() => onPick(null)} title="전체 — 소속 테마 동료의 합집합(지금까지의 동작)"
                style={{ ...chip, ...(lens === null ? on : null) }}>
                전체 {themes.length}
            </button>
            {themes.map((t) => {
                const v = verdicts?.get(t) ?? null;
                return (
                    <button key={t} onClick={() => onPick(lens === t ? null : t)} title={titleOf(t, v, lens === t)}
                        style={{ ...chip, ...(lens === t ? on : null), display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {/* 스와치 = 산점에서 그 테마 동료가 갖는 색. 렌즈 밖이어도 색은 안 바뀐다(강도만 바뀐다). */}
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: colorOf.get(t) ?? "var(--neutral)", flexShrink: 0 }} />
                        {t}
                        {v && <span style={{ color: v.pass ? STRONG : "var(--text-tertiary)" }}>{v.pass ? "✓" : "✗"}</span>}
                        {v && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{v.zoneCount}</span>}
                    </button>
                );
            })}
        </span>
    );
}

/** 칩 툴팁 — 통과/불통과와 **그 테마의 셈**(존 동료 수·기본순위·존순위)을 그대로 편다. */
function titleOf(theme: string, v: ThemeVerdict | null, active: boolean): string {
    const lens = active ? "렌즈 켜짐 — 클릭하면 전체로" : `렌즈: ${theme} 멤버만 동료로 본다`;
    if (!v) return lens;
    const rank = (n: number | null): string => (n === null ? "—" : `${n}위`);
    return `${v.pass ? "이 테마 단독으로 통과" : "이 테마 단독으로는 불통과"} · 존 동료 ${v.zoneCount}(자신 포함) · 기본순위 ${rank(v.baseRank)} · 존순위 ${rank(v.zoneRank)}\n${lens}`;
}

const group: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", flexShrink: 0 };
// border 는 낱개 속성으로 — 활성 칩이 borderColor 만 덮는다(축약과 섞이면 React 경고).
const chip: CSSProperties = { fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)", borderRadius: 8, padding: "1px 8px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" };
const on: CSSProperties = { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" };
