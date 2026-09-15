import { useEffect, useState } from "react";
import {
    availablePredicates,
    isBoardFilterActive,
    EOD_FIELDS,
    LIVE_FIELDS,
    type BoardFilterExpr,
    type BoardFilterGroup,
    type BoardFilterMode,
    type BoardPredicateDef,
} from "@trade-data-manager/market/domain";
import { useWorkbench, type BoardFilterActions } from "../../store/workbench.js";
import { AddPredicateBox, PredicateRow } from "../PredicateFormula.js";
import { TrashIcon } from "../icons.js";
import { PanelHeader } from "../ControlChrome.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";

// 보드 필터 에디터 — DNF(그룹 안 AND, 그룹끼리 OR), **그룹별 처리**(배제 흐리게/숨김 · 선택 나머지 흐리게/숨김
// · 강조). 술어는 domain 레지스트리.
// 예전엔 독립 dockview 패널 3개("… 필터")였는데, 필터는 특정 보드의 설정이지 작업면이 아니라서
// 보드 헤더의 필터 버튼 → HeaderPopover 안으로 들어왔다(패널 카탈로그에서 제거).
// 보기/편집 분리: 완료된 그룹 = 수식 텍스트 한 덩어리(클릭하면 그 그룹만 편집 모드).
// 편집 모드 = 같은 수식에서 토큰만 상호작용(종류=클릭 순환, 옵션=클릭 순환, 숫자=인라인 입력) — 셀렉트 없음.
// 상태·액션은 보드마다 별개(store.boardFilter / replayFilter / liveFilter)이고 표현은 이 FilterEditor 하나를 공유한다.
// 수식 렌더(PredicateFormula·FORMULAS)는 유니버스 알람 규칙 빌더와 공유.

const xBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0, font: "inherit" };

// ── 그룹 처리(mode) — 배제 / 선택(나머지) / 강조를 한 목록으로 ─────────────────────────────
// **색은 처리(흐리게·숨김·강조)가 정하고, "나머지"라는 말이 방향을 말한다** — 선택 방향에 새 색을 주면
// 색이 두 가지(처리·방향)를 동시에 말하려다 둘 다 못 말한다. 순환 배지는 5칸이 되어 못 쓰고(택1 3까지가
// 순환의 한계 — 머리글 컨트롤 규칙), 판이면 항목마다 한 줄 설명을 달 수 있다.
const MODE_UI: Record<BoardFilterMode, { label: string; desc: string; bg: string; fg: string }> = {
    dim: { label: "흐리게", desc: "조건에 맞는 종목을 가라앉힘", bg: "var(--accent-soft)", fg: "var(--accent-hover)" },
    hide: { label: "숨김", desc: "조건에 맞는 종목을 치움", bg: "rgba(239,68,68,0.12)", fg: "var(--rise)" },
    dimRest: { label: "나머지 흐리게", desc: "맞는 것만 남기고 나머지를 가라앉힘", bg: "var(--accent-soft)", fg: "var(--accent-hover)" },
    hideRest: { label: "나머지 숨김", desc: "맞는 것만 남김", bg: "rgba(239,68,68,0.12)", fg: "var(--rise)" },
    mark: { label: "🔥 강조", desc: "조건에 맞는 종목을 눈에 띄게", bg: "rgba(245,158,11,0.15)", fg: "#d97706" },
};
const MODE_SECTIONS: { title: string; modes: BoardFilterMode[] }[] = [
    { title: "배제 — 맞는 것을 뺀다", modes: ["dim", "hide"] },
    { title: "선택 — 맞는 것만 남긴다", modes: ["dimRest", "hideRest"] },
    { title: "강조", modes: ["mark"] },
];

/** 처리 배지 + 택1 판. 판을 여는 앵커는 배지 아래 모서리. */
function ModeBadge({ mode, onPick }: { mode: BoardFilterMode; onPick: (m: BoardFilterMode) => void }): JSX.Element {
    const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
    const ui = MODE_UI[mode] ?? MODE_UI.dim; // 모르는 mode(옛 저장물·손편집) 는 흐리게로 읽는다

    // 판이 열려 있는 동안 Esc 는 **안쪽 판이 먹는다** — 캡처 단계로 가로채 바깥 HeaderPopover(필터 편집 판)까지
    // 같이 닫히는 걸 막는다. 필터 판은 "열어둔 채 뒤의 보드를 확인"이 본론이라 함께 닫히면 그 자체로 손해다.
    // (둘 다 document 에 거는 구조라 React 핸들러의 stopPropagation 으로는 못 막는다.)
    useEffect(() => {
        if (!anchor) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            setAnchor(null);
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [anchor]);
    return (
        <>
            <button
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAnchor({ x: r.left, y: r.bottom + 4 }); }}
                title="매칭 종목을 어떻게 할지"
                style={{ border: "none", borderRadius: 8, padding: "1px 9px", font: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer", background: ui.bg, color: ui.fg, display: "inline-flex", alignItems: "center", gap: 3 }}
            >
                {ui.label}<span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
            </button>
            {anchor && (
                <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} minWidth={248} padding={0}>
                    {MODE_SECTIONS.map((sec, si) => (
                        <div key={sec.title} style={si > 0 ? { borderTop: "1px solid var(--border-subtle)" } : undefined}>
                            <MenuLabel>{sec.title}</MenuLabel>
                            {sec.modes.map((m) => (
                                <MenuItem key={m} onClick={() => { onPick(m); setAnchor(null); }} style={m === mode ? { background: "var(--bg-secondary)" } : undefined}>
                                    <span style={{ fontWeight: 600, color: m === mode ? "var(--accent-primary)" : undefined }}>{MODE_UI[m].label}</span>
                                    <span style={{ display: "block", fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>{MODE_UI[m].desc}</span>
                                </MenuItem>
                            ))}
                        </div>
                    ))}
                </AnchoredPopover>
            )}
        </>
    );
}

/** 그룹 카드 — 헤더(처리 배지 좌 · 완료/삭제 우) + 수식 줄들(AND=그리고). 보기 모드에선 수식 클릭=편집. */
function GroupCard({ g, gi, actions, predicates, editing, onEdit, onDone, onRemoveGroup }: {
    g: BoardFilterGroup;
    gi: number;
    actions: BoardFilterActions;
    predicates: BoardPredicateDef[];
    editing: boolean;
    onEdit: () => void;
    onDone: () => void;
    onRemoveGroup: () => void;
}): JSX.Element {
    const kinds = predicates.map((d) => d.kind);
    return (
        <div style={{ border: `1px solid ${editing ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 8, background: "var(--bg-secondary)", padding: "6px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <ModeBadge mode={g.mode} onPick={(m) => actions.setGroupMode(gi, m)} />
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {editing && (
                        <button onClick={onDone} style={{ border: "none", background: "var(--accent-primary)", color: "#fff", borderRadius: 5, padding: "2px 11px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600 }}>완료</button>
                    )}
                    <button onClick={onRemoveGroup} title="조건 삭제" style={xBtn}>✕</button>
                </span>
            </div>
            <div onClick={editing ? undefined : onEdit} title={editing ? undefined : "클릭: 편집"} style={{ cursor: editing ? undefined : "pointer", display: "flex", flexDirection: "column", gap: editing ? 9 : 3, fontSize: 12, color: "var(--text-primary)" }}>
                {g.predicates.map((p, pi) => (
                    <PredicateRow
                        key={pi}
                        p={p}
                        edit={editing}
                        last={pi === g.predicates.length - 1}
                        kinds={kinds}
                        onKind={(next) => actions.setPredicateKind(gi, pi, next)}
                        onParam={(k, v) => actions.setPredicateParam(gi, pi, k, v)}
                        onText={(k, v) => actions.setPredicateText(gi, pi, k, v)}
                        onRemove={g.predicates.length > 1 ? () => actions.removePredicate(gi, pi) : undefined}
                    />
                ))}
            </div>
            {editing && <AddPredicateBox onAdd={() => actions.addPredicate(gi, kinds[0])} />}
        </div>
    );
}

function FilterEditor({
    title,
    subtitle,
    emptyHelp,
    filter,
    actions,
    predicates,
    onClose,
}: {
    title: string;
    subtitle: string;
    emptyHelp: React.ReactNode;
    filter: BoardFilterExpr;
    actions: BoardFilterActions;
    predicates: BoardPredicateDef[]; // 이 소스가 제공할 술어(capability = requires⊆provides). 소스마다 다름.
    onClose: () => void;
}): JSX.Element {
    const active = isBoardFilterActive(filter);
    const firstKind = predicates[0].kind;
    const [editing, setEditing] = useState<number | null>(null); // 편집 중인 그룹 인덱스(한 번에 하나)

    return (
        // 크기는 부모(HeaderPopover: 고정 폭 + maxHeight 플렉스 컬럼)가 정한다 — 본문이 넘치면 안에서 스크롤.
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 13 }}>
            <PanelHeader>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>{subtitle}</span>
                <button
                    onClick={() => { if (active && confirm("필터를 모두 지울까요?")) { actions.clear(); setEditing(null); } }}
                    disabled={!active}
                    title="필터 지우기"
                    style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: 5, background: "var(--bg-primary)", color: active ? "var(--text-secondary)" : "var(--text-tertiary)", padding: "3px 6px", cursor: active ? "pointer" : "default", lineHeight: 0, opacity: active ? 1 : 0.5 }}
                >
                    <TrashIcon />
                </button>
                <button onClick={onClose} title="닫기 (Esc)" style={{ ...xBtn, fontSize: 14, padding: "0 2px" }}>✕</button>
            </PanelHeader>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {!active && (
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.7, padding: "6px 2px" }}>
                        {emptyHelp}
                        <br />조건 안 <b style={{ color: "var(--text-secondary)" }}>그리고(AND)</b> · 조건끼리 <b style={{ color: "var(--text-secondary)" }}>또는(OR)</b>. 완료된 조건은 클릭해서 편집.
                        <br />배지로 처리를 고른다 — 맞는 것을 빼거나(흐리게·숨김), 맞는 것만 남기거나(나머지 …), 강조.
                        <br /><span style={{ fontSize: 11.5 }}>「나머지」 조건이 여럿이면 <b style={{ color: "var(--text-secondary)" }}>전부 만족</b>해야 남는다(또는가 아니다).</span>
                    </div>
                )}

                {filter.groups.map((g, gi) => (
                    <div key={gi}>
                        {gi > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>또는</span>
                                <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                            </div>
                        )}
                        <GroupCard
                            g={g}
                            gi={gi}
                            actions={actions}
                            predicates={predicates}
                            editing={editing === gi}
                            onEdit={() => setEditing(gi)}
                            onDone={() => setEditing(null)}
                            onRemoveGroup={() => { actions.removeGroup(gi); setEditing(null); }}
                        />
                    </div>
                ))}

                <button
                    onClick={() => { actions.addGroup(firstKind); setEditing(filter.groups.length); }}
                    style={{ border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "6px 8px", cursor: "pointer", font: "inherit", fontSize: 12.5 }}
                >
                    ＋ 또는(OR) 조건
                </button>
            </div>
        </div>
    );
}

// 이슈정리 보드(EOD) 배제 필터. 상태=store.boardFilter.
export function BoardFilterEditor({ onClose }: { onClose: () => void }): JSX.Element {
    const filter = useWorkbench((s) => s.boardFilter);
    const actions = useWorkbench((s) => s.boardFilterActions);
    return (
        <FilterEditor
            title="이슈 필터"
            subtitle="종목 제외·선택"
            filter={filter}
            actions={actions}
            predicates={EOD_BOARD_PREDICATES}
            onClose={onClose}
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>이슈정리</b> 보드에서 종목을 빼거나 그것만 남기기.</>}
        />
    );
}

// 복기 보드(시점 t 스냅샷) 배제 필터. 상태=store.replayFilter. 술어는 시점 t 지표(누적 대금·시점 등락률·t까지 버킷·매물대)에 재평가.
export function ReplayFilterEditor({ onClose }: { onClose: () => void }): JSX.Element {
    const filter = useWorkbench((s) => s.replayFilter);
    const actions = useWorkbench((s) => s.replayFilterActions);
    return (
        <FilterEditor
            title="복기 필터"
            subtitle="종목 제외·선택"
            filter={filter}
            actions={actions}
            predicates={EOD_BOARD_PREDICATES}
            onClose={onClose}
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>복기</b> 보드에서 현재 시점 종목을 빼거나 그것만 남기기.</>}
        />
    );
}

// 술어 팔레트 = 소스 capability(requires⊆provides)로 자동 산출. 라이브는 buckets 없어 "분봉 대금" 자동 제외
// (옛 수동 필터 대체). deltas·marketCap·themeRanks 는 조각 3 에서 LIVE_FIELDS 확장 시 자동으로 열린다.
const EOD_BOARD_PREDICATES = availablePredicates(EOD_FIELDS);
const LIVE_BOARD_PREDICATES = availablePredicates(LIVE_FIELDS);

// 실시간 보드 배제 필터. 상태=store.liveFilter.
export function LiveFilterEditor({ onClose }: { onClose: () => void }): JSX.Element {
    const filter = useWorkbench((s) => s.liveFilter);
    const actions = useWorkbench((s) => s.liveFilterActions);
    return (
        <FilterEditor
            title="실시간 필터"
            subtitle="종목 제외·선택"
            filter={filter}
            actions={actions}
            predicates={LIVE_BOARD_PREDICATES}
            onClose={onClose}
            emptyHelp={<>조건을 만들어 <b style={{ color: "var(--text-secondary)" }}>실시간</b> 보드에서 종목을 빼거나 그것만 남기기(매물대·시그널·시총·테마순위·고가·일봉대금).</>}
        />
    );
}
