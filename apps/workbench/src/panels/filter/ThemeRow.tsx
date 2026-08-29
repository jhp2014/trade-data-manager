// 테마 조건 칸 — **행이 조건의 실체**이고, 여기 서는 것은 **요약 줄뿐**이다(2026-08-29 재편).
//
// 값 편집은 전부 테마 순위 패널이 진다: 존 N/M 은 산점 컷선 드래그, 나머지 파라미터는 그 패널의 손잡이
// 줄. 보드가 지는 것은 관리다 — 무엇이 걸려 있나(요약) · 켜짐/꺼짐 · 삭제 · 순서. 편집 판을 두 곳에
// 두면 같은 조건을 두 문법으로 만지게 되고, 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 같은 종류다.
//
// ▸ = 그 행을 패널에 비추기(연동, 세션 수명). 패널이 닫혀 있으면 열고 앞으로 세운다.
//
// 카운트는 **연동 행 하나만** 단다: useThemeStrengthStats 는 모수 × 테마 × 멤버라 행마다 돌리면
// 행 수만큼 곱이 된다(꺼진 행의 독립 계산도 같은 이유로 연동 행에 한정).
import { useEffect, useRef } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { anyConditionOn, DEFAULT_THEME_STRENGTH, type ThemeStrengthParams } from "../../lib/themeStrength.js";
import { useThemeStrengthStats } from "../../lib/useThemeStrengthStats.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { FILTER } from "../../styles/palette.js";
import { BoardRow } from "./BoardRow.js";
import { Section } from "./grain.js";
import { rowIdOfStage } from "./boardReveal.js";
import { themeStrengthLabel } from "./label.js";
import { themeParamsOf, useLinkedThemeStage } from "./themeLink.js";
import type { FilterStage } from "./stage.js";

/** 테마 순위 패널 — 이 조건 종류의 편집면. */
const THEME_PANEL = "theme-rank-1";

export function ThemeSection({ registerRow, flash, onlyActive }: {
    registerRow: (id: string) => (el: HTMLElement | null) => void;
    flash: string | null;
    /** "걸린 것만" 모드 — 행은 조건이라 그대로 보이고, 추가 줄만 접는다. */
    onlyActive: boolean;
}): JSX.Element | null {
    const { themeStages, linkedId, setLinked } = useLinkedThemeStage();
    const addStage = useWorkbench((s) => s.addFilterStage);

    // ＋ 로 만든 행을 바로 비춘다 — addStage 가 id 를 돌려주지 않아, 클릭 의도를 들고 있다가
    // 목록이 자란 다음 렌더에서 마지막 행(append 규약)을 연동한다.
    const wantLink = useRef(false);
    const prevCount = useRef(themeStages.length);
    useEffect(() => {
        if (wantLink.current && themeStages.length > prevCount.current) {
            wantLink.current = false;
            const last = themeStages[themeStages.length - 1];
            if (last) setLinked(last.id);
        }
        prevCount.current = themeStages.length;
    }, [themeStages, setLinked]);

    if (onlyActive && themeStages.length === 0) return null;
    return (
        <Section title="테마" unit="타점 묶음 — 테마 AND · 테마 간 ∃"
            hint="테마 강도 묶음 필터 — 행 정체성은 타점이라 이 필터가 걸리면 깔때기 해상도가 타점으로 내려간다(분모가 바뀌는 게 정상)"
            right={themeStages.length > 0 ? <ThemeMaterialBadge /> : undefined}>
            {themeStages.map((s, i) => {
                const params = themeParamsOf(s);
                if (!params) return null;
                const rowId = rowIdOfStage(s);
                return (
                    <SummaryRow key={s.id} stage={s} params={params} first={i === 0}
                        linked={s.id === linkedId}
                        innerRef={registerRow(rowId)} flash={flash === rowId}
                        onOpen={() => { setLinked(s.id); openAndFocus(THEME_PANEL); }} />
                );
            })}
            {!onlyActive && (
                <BoardRow label={themeStages.length === 0 ? "테마" : ""}>
                    <button
                        onClick={() => {
                            wantLink.current = true;
                            addStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH } }]);
                            openAndFocus(THEME_PANEL);
                        }}
                        title="기본값으로 켜진 조건 행을 만들고 테마 순위 패널에서 엽니다 — 탐색만 하려면 행을 끄고 만지세요"
                        style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                        ＋ 테마 조건
                    </button>
                </BoardRow>
            )}
        </Section>
    );
}

/** 요약 줄 — 무엇이 걸려 있나 + 켜기/끄기 + 삭제 + ▸(패널에서 열기). 값은 여기서 안 고친다. */
function SummaryRow({ stage, params, first, linked, innerRef, flash, onOpen }: {
    stage: FilterStage;
    params: ThemeStrengthParams;
    first: boolean;
    /** 지금 패널이 비추는 행 — 카운트는 이 행에만 단다(비용). */
    linked: boolean;
    innerRef: (el: HTMLElement | null) => void;
    flash: boolean;
    onOpen: () => void;
}): JSX.Element {
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    return (
        <BoardRow label={first ? "테마" : ""} innerRef={innerRef} flash={flash} dimmed={!stage.enabled}>
            <EnableToggle stage={stage} />
            <button onClick={onOpen}
                title={linked ? "테마 순위 패널이 이 행을 비추는 중 — 클릭하면 그 패널을 앞으로" : "이 행을 테마 순위 패널에서 열기(값은 거기서 고칩니다)"}
                style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, height: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {themeStrengthLabel(params)}
                </span>
                {!stage.enabled && (
                    <span title="이 행은 꺼져 있어 깔때기에 안 낀다 — 카운트는 켰을 때의 값(탐색용)"
                        style={{ fontSize: 10, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px", flexShrink: 0 }}>
                        꺼짐
                    </span>
                )}
                {linked && <LinkedCount params={params} />}
                <span style={{ marginLeft: "auto", fontSize: 10, color: linked ? "var(--accent-primary)" : "var(--text-tertiary)", flexShrink: 0 }}>
                    {linked ? "◆ 연동" : "▸ 패널에서"}
                </span>
            </button>
            <button onClick={() => removeStage(stage.id)} title="이 조건 삭제"
                style={{ border: "none", background: "transparent", padding: "0 4px", fontSize: 10.5, color: "var(--text-tertiary)", cursor: "pointer", flexShrink: 0 }}>
                ✕
            </button>
        </BoardRow>
    );
}

/** 켜기/끄기 — 막대 목록(FilterRow)과 같은 ◉/○ 어휘. 탐색(꺼두고 만지기)의 핵심 손잡이라 행에 둔다. */
function EnableToggle({ stage }: { stage: FilterStage }): JSX.Element {
    const toggle = useWorkbench((s) => s.toggleFilterStage);
    return (
        <button onClick={(e) => { e.stopPropagation(); toggle(stage.id); }}
            title={stage.enabled ? "이 조건 끄기 — 깔때기에서 빠지고, 카운트로 탐색만 계속" : "다시 켜기"}
            style={{ border: "none", background: "transparent", padding: "0 6px 0 0", fontSize: 12, color: stage.enabled ? "var(--accent-primary)" : "var(--text-tertiary)", cursor: "pointer", flexShrink: 0 }}>
            {stage.enabled ? "◉" : "○"}
        </button>
    );
}

/** 라이브 카운트 — **연동 행 전용**(비용). 로딩·오류·조건 없음을 숫자로 위장하지 않는다. */
function LinkedCount({ params }: { params: ThemeStrengthParams }): JSX.Element {
    const stats = useThemeStrengthStats(params);
    if (stats.error) return <span style={{ fontSize: 10.5, color: FILTER, flexShrink: 0 }}>재료 오류</span>;
    if (stats.isLoading) return <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>…</span>;
    if (!anyConditionOn(params)) return <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>조건 없음</span>;
    return (
        <span title="이 행의 조건을 타점 모수 전체에 적용한 수 — 통과/판정가능. 결손 = 단면 없음(오늘 이후·미수집)"
            style={{ fontSize: 10.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
            통과 {stats.passed.toLocaleString()}/{stats.evaluable.toLocaleString()}
            {stats.missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 결손 {stats.missing}</span>}
        </span>
    );
}

/**
 * 테마 재료 오류 배지 — 재료가 죽으면 테마 행이 멀쩡한 필터처럼 보이면서 결과만 전부 미배치가 된다.
 * 숫자와 화면이 같은 이야기를 해야 하므로(라벨 GONE 규칙과 같은 결) 칸 머리에서 한 번 말한다.
 */
function ThemeMaterialBadge(): JSX.Element | null {
    const sections = useRankSections();
    const themes = useThemeIndex();
    const err = sections.error ?? themes.error;
    if (!err) return null;
    return (
        <span title={`테마 재료 로드 실패 — 이 칸의 필터는 전부 미배치로 세어집니다: ${err.message}`}
            style={{ fontSize: 10, color: FILTER, border: `1px solid ${FILTER}`, borderRadius: 8, padding: "0 6px" }}>
            재료 오류
        </span>
    );
}
