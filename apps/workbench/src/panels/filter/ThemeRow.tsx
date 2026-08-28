// 테마 조건 칸 — **행이 조건의 실체**다(2026-08-28 재편: 미러·스냅샷·N/M 동결 폐지, decisions.md).
//
// 펼침 ≡ 연동: 펼친 행 하나(themeLink)가 곧 테마 순위 패널이 비추는 행이다. 접힌 행은 한 줄 요약 —
// 목록은 조용해야 훑힌다. 카운트 배지도 펼친 행만: 접힌 행마다 정산 밖 독립 계산
// (useThemeStrengthStats — 모수 × 테마 × 멤버)을 돌리면 행 수만큼 곱이 된다.
//
// 값 편집은 전부 이 카드 안이다: 존 N/M·존순위 = 컷 레일(√ 서수 척도, 커밋은 손 뗄 때 한 번),
// 동료·기본순위 = 스텝퍼 칩(1클릭 = 1커밋 — 커밋마다 전 유니버스 재정산이라 길게 누르기 반복은 없다).
// 텍스트 입력칸은 없다(사용자 확정) — 정밀한 자리는 레일 탭·스텝이 이미 정수 단위다.
//
// 탐색 = 행을 꺼두고 만지기: 꺼진 행은 activeStages 에서 빠져 깔때기 불변, 카운트는 독립 계산이
// 계속 대고 "꺼짐" 배지가 그 사실을 말한다(숫자와 화면이 같은 이야기).
import { useEffect, useRef, type CSSProperties } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { anyConditionOn, DEFAULT_THEME_STRENGTH, type ThemeStrengthParams } from "../../lib/themeStrength.js";
import { useThemeStrengthStats } from "../../lib/useThemeStrengthStats.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { FILTER } from "../../styles/palette.js";
import { BoardRow } from "./BoardRow.js";
import { Section } from "./grain.js";
import { rowIdOfStage } from "./boardReveal.js";
import { themeStrengthLabel } from "./label.js";
import { OrdinalCutRail, SmallCutRail } from "./rail/CutRails.js";
import { themeParamsOf, useLinkedThemeStage } from "./themeLink.js";
import type { FilterStage } from "./stage.js";

export function ThemeSection({ registerRow, flash, onlyActive }: {
    registerRow: (id: string) => (el: HTMLElement | null) => void;
    flash: string | null;
    /** "걸린 것만" 모드 — 행은 조건이라 그대로 보이고, 추가 줄만 접는다(옛 미러 줄과 같은 규칙). */
    onlyActive: boolean;
}): JSX.Element | null {
    const { themeStages, linkedId, setLinked } = useLinkedThemeStage();
    const addStage = useWorkbench((s) => s.addFilterStage);

    // ＋ 로 만든 행을 바로 펼친다 — addStage 가 id 를 돌려주지 않아, 클릭 의도를 들고 있다가
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
                return s.id === linkedId
                    ? <ThemeCard key={s.id} stage={s} params={params} first={i === 0}
                        innerRef={registerRow(rowIdOfStage(s))} flash={flash === rowIdOfStage(s)}
                        onCollapse={() => setLinked(null)} />
                    : <CollapsedRow key={s.id} stage={s} params={params} first={i === 0}
                        innerRef={registerRow(rowIdOfStage(s))} flash={flash === rowIdOfStage(s)}
                        onExpand={() => setLinked(s.id)} />;
            })}
            {!onlyActive && (
                <BoardRow label={themeStages.length === 0 ? "테마" : ""}>
                    <button
                        onClick={() => { wantLink.current = true; addStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH } }]); }}
                        title="기본값으로 켜진 조건 행을 만들고 펼칩니다 — 값은 레일·칩으로 조절(탐색만 하려면 행을 끄고 만지세요)"
                        style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                        ＋ 테마 조건
                    </button>
                </BoardRow>
            )}
        </Section>
    );
}

/** 접힌 행 — 요약 한 줄. 클릭 = 펼침(연동). 켜기/끄기는 여기서도 된다(탐색 어휘의 핵심 손잡이). */
function CollapsedRow({ stage, params, first, innerRef, flash, onExpand }: {
    stage: FilterStage;
    params: ThemeStrengthParams;
    first: boolean;
    innerRef: (el: HTMLElement | null) => void;
    flash: boolean;
    onExpand: () => void;
}): JSX.Element {
    return (
        <BoardRow label={first ? "테마" : ""} innerRef={innerRef} flash={flash} dimmed={!stage.enabled}>
            <EnableToggle stage={stage} />
            <button onClick={onExpand} title="펼쳐서 레일로 편집 — 테마 순위 패널이 이 행을 비춥니다"
                style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, height: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {themeStrengthLabel(params)}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>▸ 펼치기</span>
            </button>
        </BoardRow>
    );
}

/** 펼친 카드 — 머리 줄(격자 유지) + 레일 본문(서랍과 같은 들여쓰기 문법). */
function ThemeCard({ stage, params, first, innerRef, flash, onCollapse }: {
    stage: FilterStage;
    params: ThemeStrengthParams;
    first: boolean;
    innerRef: (el: HTMLElement | null) => void;
    flash: boolean;
    onCollapse: () => void;
}): JSX.Element {
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const stats = useThemeStrengthStats(params);
    const patch = (p: Partial<ThemeStrengthParams>): void =>
        setPredicates(stage.id, [{ kind: "themeStrength", params: { ...params, ...p } }]);

    // 레일 도메인 — 번들 유니버스 최대. 값이 그보다 크면(옛 저장물) 값까지 늘려 화면 밖으로 안 밀리게.
    const maxRank = Math.max(stats.ticks.universeMax, params.zoneRateN, params.zoneAmountN, 2);
    const basisName = params.basis === "amount" ? "대금" : "등락";

    return (
        <div ref={innerRef} style={{ borderBottom: "1px solid var(--border-subtle)", background: flash ? "var(--accent-soft)" : "transparent", transition: "background .35s ease" }}>
            <div style={{ display: "flex", alignItems: "center", height: 30, padding: "0 8px 0 0" }}>
                <div style={{ width: 96, flexShrink: 0, padding: "0 6px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {first ? "테마" : ""}
                </div>
                <EnableToggle stage={stage} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {themeStrengthLabel(params)}
                </span>
                {!stage.enabled && (
                    <span title="이 행은 꺼져 있어 깔때기에 안 낀다 — 아래 카운트는 켰을 때의 값(탐색용)"
                        style={{ marginLeft: 6, fontSize: 10, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px", flexShrink: 0 }}>
                        꺼짐
                    </span>
                )}
                <span style={{ marginLeft: 8, flexShrink: 0 }}><CountText stats={stats} params={params} /></span>
                <span style={{ flex: 1 }} />
                <button onClick={onCollapse} title="접기 — 패널 연동도 풀립니다" style={headBtn}>▾ 접기</button>
                <button onClick={() => removeStage(stage.id)} title="이 조건 삭제" style={{ ...headBtn, color: "var(--text-tertiary)" }}>✕</button>
            </div>
            <div style={{ marginLeft: 6, paddingLeft: 10, borderLeft: "2px solid var(--border-default)", opacity: stage.enabled ? 1 : 0.55 }}>
                <OrdinalCutRail label={`존 N · 등락`} value={params.zoneRateN} max={maxRank}
                    ticks={stats.ticks.rateOrds} onChange={(v) => patch({ zoneRateN: v })} />
                <OrdinalCutRail label={`존 M · 대금`} value={params.zoneAmountN} max={maxRank}
                    ticks={stats.ticks.amountOrds} onChange={(v) => patch({ zoneAmountN: v })} />
                {params.zoneRankOn && (
                    <SmallCutRail label={`존순위 · ${basisName}`} value={params.zoneRankMax}
                        ticks={stats.ticks.zoneRanks} onChange={(v) => patch({ zoneRankMax: v })} />
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 8px 8px 0" }}>
                    <StepChip on={params.countOn} text="동료 ≥" value={params.countMin}
                        title="존 내 테마 종목 수 ≥ x (자신 포함)"
                        onToggle={() => patch({ countOn: !params.countOn })}
                        onStep={(d) => patch({ countMin: Math.max(1, params.countMin + d) })} />
                    <StepChip on={params.baseRankOn} text={`기본순위(${basisName}) ≤`} value={params.baseRankMax}
                        title="테마 내 기본 순위 ≤ r (존 무관, 전 멤버 중)"
                        onToggle={() => patch({ baseRankOn: !params.baseRankOn })}
                        onStep={(d) => patch({ baseRankMax: Math.max(1, params.baseRankMax + d) })} />
                    <button onClick={() => patch({ zoneRankOn: !params.zoneRankOn })}
                        title="테마 내 존 순위 ≤ r (존에 든 멤버 중 — 자신이 존 밖이면 불만족). 켜면 위에 레일이 선다"
                        style={{ ...chip, opacity: params.zoneRankOn ? 1 : 0.55, borderStyle: params.zoneRankOn ? "solid" : "dashed" }}>
                        {params.zoneRankOn ? "✓" : "○"} 존순위 ≤ {params.zoneRankMax}
                    </button>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        기준
                        {(["rate", "amount"] as const).map((b) => (
                            <button key={b} onClick={() => params.basis !== b && patch({ basis: b })}
                                title="순위 조건(기본순위·존순위)이 타는 서수"
                                style={{
                                    ...chip, padding: "0 7px",
                                    ...(params.basis === b
                                        ? { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" }
                                        : {}),
                                }}>
                                {b === "amount" ? "대금" : "등락"}
                            </button>
                        ))}
                    </span>
                </div>
            </div>
        </div>
    );
}

/** 켜기/끄기 — 막대 목록(FilterRow)과 같은 ◉/○ 어휘. 탐색(꺼두고 만지기)의 핵심 손잡이라 행에도 둔다. */
function EnableToggle({ stage }: { stage: FilterStage }): JSX.Element {
    const toggle = useWorkbench((s) => s.toggleFilterStage);
    return (
        <button onClick={(e) => { e.stopPropagation(); toggle(stage.id); }}
            title={stage.enabled ? "이 조건 끄기 — 깔때기에서 빠지고, 펼친 카운트로 탐색만 계속" : "다시 켜기"}
            style={{ border: "none", background: "transparent", padding: "0 6px 0 0", fontSize: 12, color: stage.enabled ? "var(--accent-primary)" : "var(--text-tertiary)", cursor: "pointer", flexShrink: 0 }}>
            {stage.enabled ? "◉" : "○"}
        </button>
    );
}

/** 라이브 카운트 — 펼친 행 전용(비용). 로딩·오류·조건 없음을 숫자로 위장하지 않는다. */
function CountText({ stats, params }: { stats: ReturnType<typeof useThemeStrengthStats>; params: ThemeStrengthParams }): JSX.Element {
    if (stats.error) return <span style={{ fontSize: 10.5, color: FILTER }}>재료 오류</span>;
    if (stats.isLoading) return <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>…</span>;
    if (!anyConditionOn(params)) return <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>조건 없음</span>;
    return (
        <span title="이 행의 조건을 타점 모수 전체에 적용한 수 — 통과/판정가능. 결손 = 단면 없음(오늘 이후·미수집)"
            style={{ fontSize: 10.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            통과 {stats.passed.toLocaleString()}/{stats.evaluable.toLocaleString()}
            {stats.missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 결손 {stats.missing}</span>}
        </span>
    );
}

/** 스텝퍼 칩 — 라벨 클릭 = 켜기/끄기, −/＋ = 1스텝 1커밋(커밋 = 전 유니버스 재정산이라 반복 없음). */
function StepChip({ on, text, value, title, onToggle, onStep }: {
    on: boolean;
    text: string;
    value: number;
    title: string;
    onToggle: () => void;
    onStep: (delta: number) => void;
}): JSX.Element {
    return (
        <span style={{ ...chip, display: "inline-flex", alignItems: "center", gap: 4, opacity: on ? 1 : 0.55, borderStyle: on ? "solid" : "dashed", padding: 0 }}>
            <button onClick={onToggle} title={title} style={{ border: "none", background: "transparent", padding: "1px 2px 1px 7px", font: "inherit", fontSize: 10.5, color: "inherit", cursor: "pointer" }}>
                {on ? "✓" : "○"} {text} {value}
            </button>
            {on && (
                <span style={{ display: "inline-flex", borderLeft: "1px solid var(--border-subtle)" }}>
                    <button onClick={() => onStep(-1)} title="1 줄이기" style={stepBtn}>−</button>
                    <button onClick={() => onStep(1)} title="1 늘리기" style={stepBtn}>＋</button>
                </span>
            )}
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

const chip: CSSProperties = {
    fontSize: 10.5, color: "var(--text-secondary)", border: "1px solid var(--border-default)",
    borderRadius: 8, padding: "1px 7px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
};
const stepBtn: CSSProperties = {
    border: "none", background: "transparent", padding: "1px 6px", fontSize: 10.5,
    color: "var(--text-secondary)", cursor: "pointer", lineHeight: 1.4,
};
const headBtn: CSSProperties = {
    border: "none", background: "transparent", padding: "0 5px", fontSize: 10.5,
    color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0,
};
