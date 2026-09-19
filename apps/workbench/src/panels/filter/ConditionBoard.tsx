// 조건 보드 — 집합 편성 패널의 본론. **깔때기에 걸린 것 전부가 여기 한 목록으로 선다.**
//
// 이 판이 지는 일은 관리다: 무엇이 걸렸나(요약 줄) · 켜기/끄기 · 삭제 · 생성(＋ 조건).
// **값 편집은 여기 없다** — 종류마다 제일 잘 보여주는
// 편집면이 따로 있다: **1차원(날짜·시간·축 값)과 그룹은 그 자리 팝오버**, 2차원(결과·급타점·테마)만
// 전용 패널이다(분포가 2차원이라 팝오버에 안 들어간다). 줄의 이름을 누르면 그리로 간다.
//
// ⚠ 불변식: **깔때기 참여는 이 목록에서 항상 전부 보인다.** 조건이 어디서 태어나든(레일을 긋든,
// 저장 집합을 갈아 끼우든) 여기 줄로 서야 한다 — 안 보이는데 숫자가 달라지는 사고를 막는 규칙이라
// 새 조건 종류를 더할 때도 이 목록을 지나야 한다.
//
// 목록의 순서는 **표시 순서일 뿐**이다(2026-09-19) — 하루 칸이 앞에 서는 것도 읽기 편의고, 평가
// 순서는 하루 엔진이 비용 오름차순으로 스스로 정한다. 결과 목록은 없다: 멤버 열람은 구독 패널의 몫이다.
import { useCallback, useMemo, useRef, useState } from "react";
import { useDismiss } from "../../ui/useDismiss.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { createPanelSlot, openAndFocus, openPanelExact } from "../../lib/openPanel.js";
import { DEFAULT_THEME_STRENGTH } from "../../lib/themeStrength.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { selectFilterStages, selectFilterUniverse, useWorkbench } from "../../store/workbench.js";
import { useDock } from "../../store/dock.js";
import { slotTitleOf } from "../../shell/panelCatalog.js";
import { parseSlotId } from "../../shell/panelSlots.js";
import { FILTER } from "../../styles/palette.js";
import { FilterRow } from "./FilterRow.js";
import { useFunnel } from "./FunnelContext.js";
import { Note } from "./grain.js";
import type { CellValueRange } from "@trade-data-manager/market/domain";
import { CellStageFields } from "./CellPredicateFields.js";
import { effectiveUniverse, kindDeficiency, stageDeficiency, type Universe } from "./universe.js";
import { GroupEditors, RailEditors, type GroupEditorAnchor, type RailEditor } from "./ConditionEditors.js";
import { ExprTree, type ExprTreeHandlers } from "./ExprTree.js";
import { findNode, leafCount, negOf, negateNode, refsOf, removeNode, toggleOperator } from "./expr.js";
import { useRankAxes } from "../../lib/RankAxesContext.js";
import { PointDefHead } from "./PointDefHead.js";
import { useGroupCreateFlow } from "./useGroupCreateFlow.js";
import { HOT_REVEAL, OUTCOME_REVEAL, useRevealSender } from "./boardReveal.js";
import { OUTCOME_PANEL_ID } from "../outcome/outcomePanelIds.js";
import { HOT_PANEL_ID } from "../hot/hotPanelIds.js";
import { useLinkedHot } from "../hot/hotLink.js";
import { useLinkedOutcome } from "../outcome/outcomeLink.js";
import { stageLabel } from "./label.js";
import { stageKind, type FilterPredicate, type FilterStage, type Grain, type PredicateKind } from "./stage.js";

/** 종류별 편집면 — 줄 이름을 누르면 여기로 데려간다. 결과 패널 id 는 공용 상수(주소가 세 곳이라 잎 모듈). */
/** 조건판 타입 밑동 — 테마 연동 목록·새 조건판 발급이 쓴다(특정 인스턴스는 바인딩이 가리킨다). */
const THEME_RANK_BASE = "theme-rank";
const OUTCOME_PANEL = OUTCOME_PANEL_ID;

export function ConditionBoard({ panelId }: {
    /** 접힘 상태(보기)가 사는 자리 — 슬롯 낟알이라 같은 집합을 두 패널이 다르게 접을 수 있다. */
    panelId: string;
}): JSX.Element {
    const v = useFunnel();
    const axes = useRankAxes();
    const stages = useWorkbench(selectFilterStages);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const setStage = useWorkbench((s) => s.setFilterStage);
    // 편집 대상의 **타입** — 팔레트 회색·결손 배지·칸 층위가 전부 이 하나로 갈린다(모드 스위치가 아니다).
    // 우주는 **파생**이다(2026-09-19 9단계). null = 아직 안 정해짐 — 그때는 팔레트에서 **아무것도
    // 회색이 아니다**(어느 쪽도 아니므로). 한쪽-전용 조건이 처음 들어오면 그때부터 반대편이 결손으로 선다.
    const universe = useWorkbench(selectFilterUniverse);
    const setUniverse = effectiveUniverse(universe);

    // ── 편집면으로 데려가기 ──
    const sendOutcomeReveal = useRevealSender(OUTCOME_REVEAL);
    const sendHotReveal = useRevealSender(HOT_REVEAL);
    const { setLinked: setLinkedOutcome } = useLinkedOutcome(); // 결과 줄 클릭 = 그 조건으로 연동 이동(판의 T 가 따라온다)
    const { setLinked: setLinkedHot, canAdd: canAddHot, nextParams: nextHot } = useLinkedHot(); // 급타점도 같은 규칙(판의 (W,r) 이 따라온다)
    // ── 테마 연동(pull·1:1·영속) — 이 보드가 유일한 연동 손잡이다(decisions 2026-09-17).
    const bindings = useWorkbench((s) => s.themeBindings);
    const bindTheme = useWorkbench((s) => s.bindTheme);
    const unbindTheme = useWorkbench((s) => s.unbindTheme);
    const dockSlots = useDock((s) => s.slots);
    const [themeLink, setThemeLink] = useState<{ stageId: string; x: number; y: number } | null>(null);
    // 바인딩이 가리키는 판이 **슬롯 대장에 살아 있을 때만** 연동으로 읽는다 — 판을 ×로 소멸해도
    // 바인딩은 남는데(고아 = 읽기 시점 해석 규칙), 카탈로그가 이름을 지어내(slotTitleOf) 죽은 판을
    // 배지에 계속 말하고 이름 클릭이 그 판을 되살리는 사고가 났다(2026-09-17 실사용).
    // ⚠ `useCallback` 인 이유: 아래 `treeHandlers` 의 의존성에 들어간다. 매 렌더 새로 만들면 메모가
    //   사실상 무효가 되어 트리 전체가 렌더마다 새 핸들러를 받는다.
    const livePanelOf = useCallback((stageId: string): string | undefined => {
        const pid = bindings[stageId];
        return pid !== undefined && dockSlots.includes(pid) ? pid : undefined;
    }, [bindings, dockSlots]);
    const [groupEditor, setGroupEditor] = useState<GroupEditorAnchor | null>(null);
    // 1차원 조건(날짜·시간·축 값)의 편집면 — 2026-09-19 부터 **이 보드가 직접 연다**(레일 패널 철거).
    const [railEditor, setRailEditor] = useState<RailEditor | null>(null);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    // 식과 그 편집 손 — 노드 편집(부정·연산자·묶음 삭제)은 전부 setExpr 하나를 지난다.
    const expr = useWorkbench((s) => s.filterExpr);
    const setExpr = useWorkbench((s) => s.setFilterExpr);
    const addStageAt = useWorkbench((s) => s.addFilterStageAt);
    const savedSets = useWorkbench((s) => s.savedSets);
    const openSet = useWorkbench((s) => s.openSet);
    const promoteNode = useWorkbench((s) => s.promoteNodeToSet);
    /** 이름을 받는 중인 묶음 — 세션 한정(입력 중 새로고침이면 그냥 없던 일). */
    const [promoting, setPromoting] = useState<string | null>(null);
    /** 짚은 노드 = **삽입 지점**. 세션 한정 — 새로고침 뒤 "어디에 붙더라"를 기억하게 두지 않는다. */
    const [pickedRaw, setPicked] = useState<string | null>(null);
    /** 접힘은 **보기**라 저장물이 아니라 패널 UI 에 산다(식과 함께 저장하면 저장물이 화면 사정으로 더러워진다). */
    const [flipped, setFlipped] = usePanelUi<string[]>(panelId, "exprFlipped", []);
    /** 다음 조건을 **어떤 연산자로** 붙일까 — "AND 로 추가 / OR 로 추가" 두 버튼이 정한다(괄호는 그 결과). */
    const [addMode, setAddMode] = useState<"and" | "or">("and");
    // 짚은 노드가 지워졌으면 루트로 되돌린다(유령 삽입 지점 금지).
    const picked = pickedRaw !== null && findNode(expr, pickedRaw) !== null ? pickedRaw : null;
    /** 식이 비었나 — 조건 잎도 참조도 없을 때만 참(위 게이트 주석). */
    const exprIsEmpty = leafCount(expr) === 0 && refsOf(expr).length === 0;
    /** 삽입 지점의 사람 말 — 팝오버가 "여기에 붙는다"를 늘 적는다(모르는 채 누르지 않게). */
    const atLabel = picked === null ? "루트" : (findNode(expr, picked)?.kind === "or" ? "짚은 OR 묶음" : "짚은 AND 묶음");
    // 그룹 생성 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다(이중 커밋 가드 포함).
    const groupCreate = useGroupCreateFlow(addStage, setGroupEditor);

    /**
     * 줄 이름 클릭 — 그 **종류의 편집면**으로. 1차원(날짜·시간·축 값)과 그룹은 **그 자리 팝오버**고,
     * 2차원(결과·급타점·테마)만 전용 패널로 데려간다(분포가 2차원이라 팝오버에 안 들어간다).
     */
    const openEditor = (stage: FilterStage, e: React.MouseEvent): void => {
        switch (stageKind(stage)) {
            case "themeStrength": {
                // 연동돼 있으면 그 판으로(특정 인스턴스 — 타입 리졸버가 아니라 정확 열기), 아니면 연동 목록.
                const bound = livePanelOf(stage.id);
                if (bound !== undefined && parseSlotId(bound)?.base === THEME_RANK_BASE) openPanelExact(bound);
                else setThemeLink({ stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            }
            case "group": {
                const gp = stage.predicates.find((p): p is Extract<FilterPredicate, { kind: "group" }> => p.kind === "group");
                setGroupEditor({ stageId: stage.id, scope: gp?.scope ?? "day", x: e.clientX, y: e.clientY });
                return;
            }
            // ⚠ 결과·급타점은 전용 판이 진다 — 팝오버로 흘리면 그릴 분포가 없다(조용한 무반응).
            case "outcome":
                // 연동을 이 조건으로 옮긴다 — 판의 표시 T 가 그 조건의 T 가 돼야 레일에 그 컷이 보인다.
                setLinkedOutcome(stage.id);
                sendOutcomeReveal(stage.id);
                openAndFocus(OUTCOME_PANEL);
                return;
            case "outcomeRecovery": // 편집면 = 결과 패널 머리글 칩(레일 줄이 없어 되짚기 신호는 안 보낸다)
                setLinkedOutcome(stage.id);
                openAndFocus(OUTCOME_PANEL);
                return;
            case "hotPoints":
                // 연동을 이 조건으로 옮긴다 — 판의 표시 (W,r) 이 그 조건의 것이라야 레일에 그 컷이 보인다.
                setLinkedHot(stage.id);
                sendHotReveal(stage.id);
                openAndFocus(HOT_PANEL_ID);
                return;
            case "date":
                setRailEditor({ kind: "date", stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            case "time":
                setRailEditor({ kind: "time", stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            case "axisValue": {
                const ap = stage.predicates.find((p): p is Extract<FilterPredicate, { kind: "axisValue" }> => p.kind === "axisValue");
                if (ap) setRailEditor({ kind: "axisValue", axisId: ap.axisId, stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            }
            default:
                // 배치줄(axisBand)·셀 술어 등 — 줄 안에서 만지거나 아직 전용 편집면이 없는 종류.
                return;
        }
    };

    const hasTheme = useMemo(() => stages.some((s) => stageKind(s) === "themeStrength"), [stages]);
    const labelOf = useCallback(
        (id: string) => {
            const st = stages.find((x) => x.id === id);
            return st ? stageLabel(st, v.labelLook) : "(지워진 조건)";
        },
        [stages, v.labelLook],
    );
    const treeHandlers = useMemo<ExprTreeHandlers>(() => ({
        renderLeaf: (stage, no) => (
            <FilterRow
                key={stage.id}
                no={no}
                stage={stage}
                label={stageLabel(stage, v.labelLook)}
                dead={v.deadStageIds.includes(stage.id)}
                deficiency={stageDeficiency(stage, setUniverse)}
                cellFields={<CellStageFields stage={stage} onPatch={setStage} />}
                neg={negOf(expr, stage.id)}
                linked={false}
                linkedLabel={stageKind(stage) === "themeStrength" ? (livePanelOf(stage.id) !== undefined ? slotTitleOf(livePanelOf(stage.id)!) : "미연동") : undefined}
                onLinkedClick={(e) => setThemeLink({ stageId: stage.id, x: e.clientX, y: e.clientY })}
                onOpen={(e) => openEditor(stage, e)}
                onToggle={() => toggleStage(stage.id)}
                onNegate={() => setExpr(negateNode(expr, stage.id))}
                onRemove={() => removeStage(stage.id)}
            />
        ),
        labelOf,
        pickedId: picked,
        onPick: (id) => setPicked((cur) => (cur === id ? null : id)),
        flippedIds: flipped,
        onToggleOpen: (id) => setFlipped(flipped.includes(id) ? flipped.filter((x) => x !== id) : [...flipped, id]),
        onToggleOperator: (id) => setExpr(toggleOperator(expr, id)),
        onNegate: (id) => setExpr(negateNode(expr, id)),
        onRemoveNode: (id) => setExpr(removeNode(expr, id)),
        onOpenLeaf: (id, e) => {
            const st = stages.find((x) => x.id === id);
            if (st) openEditor(st, e);
        },
        refInfo: (setId) => {
            const set = savedSets.find((x) => x.id === setId);
            // "쓰는 곳" = 이 집합을 참조하는 **저장 집합 수** + 지금 작업 중인 식(그것도 한 곳이다).
            const usedBy = savedSets.filter((x) => refsOf(x.expr).includes(setId)).length
                + (refsOf(expr).includes(setId) ? 1 : 0);
            return { name: set?.name ?? "(지워진 집합)", broken: set === undefined, usedBy };
        },
        // 열기 = **편집 대상 전환**(그 집합의 식이 작업 깔때기로 온다). 그 자리에서 고치게 두지
        // 않는 이유: 참조는 남의 것이라, 여기서 고치면 그 집합을 쓰는 다른 식이 전부 따라 바뀐다.
        onOpenRef: (setId) => openSet(setId),
        promotingId: promoting,
        onPromoteStart: (id) => setPromoting(id),
        onPromoteCommit: (id, name) => { promoteNode(id, name); setPromoting(null); },
        onPromoteCancel: () => setPromoting(null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [expr, stages, savedSets, v.labelLook, v.deadStageIds, setUniverse, picked, flipped, promoting, livePanelOf]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }} onClick={() => setPicked(null)}>
                <PointDefHead />
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && hasTheme && <ThemeMaterialBadge />}
                {/* ⚠ 게이트는 **잎 수가 아니라 식이 비었나**다 — 참조는 잎이 아니라서(leavesOf 주석)
                    잎 수로 재면 `OR(참조…)`(승계된 옛 조립·루트 통째 승격)가 "없음"이라 말하면서
                    트리도 안 그려 **참조를 지울 손이 사라진다**. */}
                {!v.isLoading && exprIsEmpty && (
                    <Note>없음 — 아래 <b>＋ 조건</b> 으로 만듭니다</Note>
                )}
                {!v.isLoading && !exprIsEmpty && <ExprTree expr={expr} handlers={treeHandlers} />}

                {!v.isLoading && (
                    <AddCondition
                        setUniverse={universe}
                        onCell={(p) => addStageAt([p], picked, addMode)}
                        mode={addMode}
                        onMode={setAddMode}
                        atLabel={atLabel}
                        axes={axes.axes}
                        onRail={(ed) => setRailEditor(ed)}
                        onOutcome={() => openAndFocus(OUTCOME_PANEL)}
                        onHot={() => {
                            // 행을 만든다(테마형) — (W,r) 기본값이 뜻을 갖고, **행이 있어야 축이 서고
                            // 열이 서서** "조건 없이 여러 (W,r) 을 열로 펼쳐 비교"가 성립한다.
                            if (nextHot === null) return; // 빈 자리 없음 — 겹치는 행을 만들지 않는다
                            addStage([{ kind: "hotPoints", w: nextHot.w, r: nextHot.r, ranges: [] }]);
                            // **연동을 새 행으로 옮긴다** — 사다리가 매번 다른 (W,r) 을 집으므로 안 옮기면
                            // 메뉴 라벨이 약속한 자리와 판이 실제로 보여주는 자리가 확정적으로 어긋난다
                            // (addFilterStage 가 id 를 안 돌려줘 방금 append 된 마지막 행을 읽는다).
                            const made = selectFilterStages(useWorkbench.getState()).at(-1);
                            if (made) setLinkedHot(made.id);
                            openAndFocus(HOT_PANEL_ID);
                        }}
                        canAddHot={canAddHot}
                        nextHot={nextHot}
                        onGroup={(scope, e) => groupCreate.open(scope, e.clientX, e.clientY)}
                        onTheme={(e) => {
                            // 행만 만든다 — 판 연동은 별도 결정(pull). 방금 만든 행의 연동 목록을 바로 펼쳐
                            // 손이 이어지게 한다(무시하면 미연동 행으로 남는다 — 허용 상태).
                            addStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH } }]);
                            const made = selectFilterStages(useWorkbench.getState()).at(-1);
                            if (made) setThemeLink({ stageId: made.id, x: e.clientX, y: e.clientY });
                        }}
                    />
                )}
                <div style={{ height: 8 }} />
            </div>

            {/* 테마 연동 메뉴 — 이 보드가 유일한 연동 손잡이(pull). 목록 = 미연동 조건판 + 새 조건판(관찰판 제외). */}
            {themeLink !== null && (
                <ThemeLinkMenu anchor={themeLink}
                    boundId={livePanelOf(themeLink.stageId)}
                    candidates={dockSlots.filter((id) => {
                        if (parseSlotId(id)?.base !== THEME_RANK_BASE) return false;
                        // "다른 행이 쓰는 판" 제외는 **살아 있는 테마 행**만 센다 — 고아 바인딩(행 삭제·
                        // 집합 적용의 통째 교체)이 판을 영구 점유하면 기본 판이 목록에서 사라진다(실사용 버그).
                        return !Object.entries(bindings).some(([sid, pid]) => pid === id && sid !== themeLink.stageId
                            && stages.some((st) => st.id === sid && st.predicates[0]?.kind === "themeStrength"));
                    })}
                    onPick={(panelId) => {
                        bindTheme(themeLink.stageId, panelId);
                        openPanelExact(panelId);
                        setThemeLink(null);
                    }}
                    onNew={() => {
                        const id = createPanelSlot(THEME_RANK_BASE);
                        bindTheme(themeLink.stageId, id);
                        openPanelExact(id);
                        setThemeLink(null);
                    }}
                    onUnbind={() => {
                        unbindTheme(themeLink.stageId);
                        setThemeLink(null);
                    }}
                    onClose={() => setThemeLink(null)} />
            )}

            {/* 1차원 조건 팝오버 — 날짜·시간·축 값. 쓰기는 applyFilterRail 한 줄.
                ⚠ 주소(stageId)를 **반드시** 준다 — `undefined` 로 보내면 "그 레일 키의 첫 잎" 이라는
                옛 1:1 규칙으로 떨어져 `날짜A ∨ 날짜B` 를 못 만든다(stageBinding 의 주소 주석). */}
            <RailEditors editor={railEditor} stages={stages}
                write={(key, predicate, stageId) => applyRail(key, predicate, picked, addMode, stageId ?? null)}
                onClose={() => setRailEditor(null)} />

            {/* 그룹 팔레트(팝오버) — 그룹도 같은 층. 2차원(결과·급타점·테마)만 전용 패널이 진다. */}
            <GroupEditors editor={groupEditor} stages={stages}
                draft={groupCreate.draft} onDraftChange={groupCreate.setDraft} onCloseCreate={groupCreate.close}
                removeStage={removeStage} setPredicates={setPredicates}
                onClose={() => setGroupEditor(null)} />
        </div>
    );
}

/**
 * ＋ 조건 — 조건이 태어나는 입구 하나. 고르면 그 종류의 편집면이 열린다.
 *
 * ⚠ 1차원(날짜·시간·축 값)은 **행을 안 만든다**: 계산 축·날짜에는 "기본값"이 없고("5% 위"가 상위
 * 3건인지 300건인지는 분포를 봐야 안다), 이 앱의 규칙은 빈 술어 필터를 남기지 않는 것이다. 그래서
 * 팝오버를 열고 **거기서 값이 커밋되는 순간** 조건이 된다. 테마·그룹은 기본값이 뜻을 갖거나
 * 팔레트에서 곧바로 식을 쓰므로 행을 만든다.
 *
 * 계산 축은 수십 개라 메뉴에 다 못 편다 — "계산 축"을 고르면 **같은 팝오버 안에서** 축 목록으로
 * 한 겹 들어간다(팝오버를 겹쳐 띄우면 바깥 클릭 해제가 서로를 먹는다).
 */
function AddCondition({ setUniverse, onCell, axes, onRail, onOutcome, onGroup, onTheme, onHot, canAddHot, nextHot, mode, onMode, atLabel }: {
    /**
     * 편집 대상의 우주 — **파생값**이라 `null`(아직 안 정해짐)이 있다. 팔레트는 숨기지 않고
     * **회색**으로 세우고(대수는 한 벌, 결손은 사실), `null` 이면 아무것도 회색이 아니다 —
     * 그때는 어느 쪽 조건이든 처음 하나가 우주를 정한다.
     */
    setUniverse: Universe | null;
    /** 셀 조건 만들기 — 전용 편집 판이 없는 종류라 기본 payload 로 줄을 만들고 그 자리에서 만진다. */
    onCell: (p: FilterPredicate) => void;
    /** 계산 축 목록 — "계산 축" 을 고르면 이 목록으로 한 겹 들어간다(팝오버 안에서 화면을 바꾼다). */
    axes: readonly { key: string; name: string }[];
    /** 1차원 조건 편집면 열기 — 그 자리에서 긋는 순간 조건이 된다(빈 조건은 안 만든다). */
    onRail: (ed: RailEditor) => void;
    onOutcome: () => void;
    /** 그룹 입구 둘(하루/타점) — scope 는 태어나는 자리에서 확정된다(편집 판에 토글이 없다). */
    onGroup: (scope: Grain, e: React.MouseEvent) => void;
    onTheme: (e: React.MouseEvent) => void;
    onHot: () => void;
    /** 급타점 인스턴스 상한(3) — **생성 지점에서만** 막는다(밖에서 온 저장물은 안 자른다). */
    canAddHot: boolean;
    /** 다음에 만들 자리 — 라벨이 **무엇이 생길지** 미리 말한다(늘 같은 값이 아니라서). */
    nextHot: { w: number; r: number } | null;
    /** 붙이는 연산자 — 이 둘이 **괄호를 손으로 안 치게 하는 장치**다(decisions 「집합 편성 재설계」). */
    mode: "and" | "or";
    onMode: (m: "and" | "or") => void;
    /** 어디에 붙는지 사람 말로 — 모르는 채 누르지 않게 판이 늘 적는다. */
    atLabel: string;
}): JSX.Element {
    /** 팝오버 안의 한 겹 — null = 종류 목록, "axis" = 계산 축 목록. 트리거를 누를 때마다 되돌린다. */
    const [pane, setPane] = useState<null | "axis">(null);
    /** 메뉴 한 줄. `keepOpen` 은 **판 안에서 한 겹 들어가는** 항목뿐이다(계산 축 목록) — 나머지는
     *  고르는 순간 편집면이 열리므로 메뉴가 닫혀야 한다. */
    const item = (close: () => void, label: string, hint: string, run: (e: React.MouseEvent) => void, kind?: PredicateKind, keepOpen = false): JSX.Element => {
        // 결손은 **숨기지 않는다** — 회색 + 이유. 숨기면 "그 우주엔 그런 문법이 없다"가 되어, 나중에
        // 재료가 생겨도 합치는 공사가 다시 필요해진다(decisions 「집합」: 대수는 한 벌).
        // 우주가 미정이면 회색이 없다 — 첫 한쪽-전용 조건이 우주를 정할 자유를 남긴다.
        const why = kind && setUniverse !== null ? kindDeficiency(kind, setUniverse) : null;
        return (
            <button onClick={(e) => { if (why) return; if (!keepOpen) close(); run(e); }} title={why ?? hint} disabled={why !== null}
                style={{
                    display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                    color: why ? "var(--text-tertiary)" : "var(--text-primary)", cursor: why ? "default" : "pointer",
                    font: "inherit", fontSize: 11.5, padding: "5px 10px",
                }}>
                {label}{why ? " — 이 우주에선 결손" : ""}
            </button>
        );
    };
    const atLeast = (value: number): CellValueRange => ({ from: { kind: "value", value } });
    return (
        <div style={{ padding: "6px 2px 2px" }}>
            {/* ⚠ 이 판은 **포털 + fixed** 여야 한다(HeaderPopover). 옛 방식(스크롤 컨테이너 안의
                absolute + bottom:100%)은 항목이 늘자 판이 패널 위로 솟아 dockview 탭 스트립에
                덮였다 — 위쪽 항목들이 클릭 자체가 안 됐다(2026-09-19 실측). 같은 패널의 집합 관리
                판이 이미 이 물건을 쓴다(뷰포트 클램프·탈착 감지가 거기 들어 있다). */}
            <HeaderPopover width={230} align="start" closeOnOutside
                trigger={(open, toggle) => (
                    <button onClick={() => { setPane(null); toggle(); }}
                        title="조건 만들기 — 종류를 고르면 그 조건의 편집면이 열립니다"
                        style={{ fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>
                        ＋ 조건 {open ? "▴" : "▾"}
                    </button>
                )}>
                {(close) => (
                <div style={{ overflowY: "auto", padding: "3px 0" }}>
                    {/* ⚠ 괄호는 손으로 치지 않는다 — 이 두 버튼이 중첩을 만든다. AND 묶음에서 "OR 로 추가"를
                        누르면 그 자리에 OR 묶음이 생기며 기존 조건과 새 조건이 담긴다(expr.addLeafAt). */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px 5px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {(["and", "or"] as const).map((m) => (
                            <button key={m} onClick={() => onMode(m)}
                                title={m === "and" ? "지금 자리에 AND 로 붙인다(모두 만족)" : "지금 자리에 OR 로 붙인다(하나라도) — 자리가 AND 면 OR 묶음이 새로 생긴다"}
                                style={{
                                    font: "inherit", fontSize: 10, padding: "1px 7px", borderRadius: 3, cursor: "pointer",
                                    border: `1px solid ${mode === m ? "var(--accent-primary)" : "var(--border-default)"}`,
                                    background: mode === m ? "var(--accent-soft)" : "transparent",
                                    color: mode === m ? "var(--accent-primary)" : "var(--text-secondary)",
                                }}>
                                {m === "and" ? "AND 로 추가" : "OR 로 추가"}
                            </button>
                        ))}
                        <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--text-tertiary)" }}>{atLabel}</span>
                    </div>
                    {/* 하루·셀 우주의 종류들 — 전용 판이 없어 **여기서 만들고 줄에서 만진다**.
                        ⚠ **숨기지 않는다**(decisions 「집합」: 대수는 한 벌, 결손은 사실) — 우주가 종단으로
                        파생되면 `item` 이 결손 지도를 물어 **회색 + 이유**로 세운다. 숨기면 "그 우주엔 그런
                        문법이 없다"가 되어, 왜 못 고르는지도 안 보이고 재료가 생겨도 합치는 공사가 다시 든다. */}
                    {item(close, "등락률", "그 분의 등락률(UN %) — 값은 줄에서 만집니다", () => onCell({ kind: "cellValue", field: "ratePct", ranges: [atLeast(5)] }), "cellValue")}
                    {item(close, "누적대금", "그 분까지의 세션 누적 거래대금(억)", () => onCell({ kind: "cellValue", field: "cumAmountEok", ranges: [atLeast(100)] }), "cellValue")}
                    {item(close, "분봉고가", "그 분 봉의 고가(UN %)", () => onCell({ kind: "cellValue", field: "minuteHighPct", ranges: [atLeast(5)] }), "cellValue")}
                    {item(close, "존순위", "테마 존 안 순위(작을수록 위) — 분 단면을 굽는 비싼 재료입니다", () => onCell({ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }] }), "cellValue")}
                    {item(close, "전고 돌파", "직전 W 거래일 고가를 분봉 고가가 넘는 분(당일 제외)", () => onCell({ kind: "priorHighBreak", days: 20 }), "priorHighBreak")}
                    {item(close, "격자 Point", "기준선 있는 차트의 격자 파생 Point 좌표", () => onCell({ kind: "gridPoint" }), "gridPoint")}
                    {/* 시각은 **중립 종류**다(양쪽 우주에 산다) — 종단에선 아래 「시간」이 같은 종류를 레일
                        편집면으로 연다. 여기서만 안 보이는 것이지 문법이 사라지는 게 아니라 조건부로 둔다. */}
                    {setUniverse !== "longitudinal" && item(close, "시각", "장중 시각 창 — 09:00~10:30 처럼", () => onCell({ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }), "time")}
                    {pane === "axis" ? (
                        <>
                            <button onClick={() => setPane(null)}
                                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", font: "inherit", fontSize: 10.5, padding: "4px 10px" }}>
                                ◂ 종류
                            </button>
                            <div style={{ maxHeight: 220, overflowY: "auto" }}>
                                {axes.length === 0
                                    ? <span style={{ display: "block", fontSize: 11, padding: "5px 10px", color: "var(--text-tertiary)" }}>축이 아직 없습니다</span>
                                    : axes.map((a) => (
                                        <button key={a.key} onClick={(e) => { close(); onRail({ kind: "axisValue", axisId: a.key, x: e.clientX, y: e.clientY }); }}
                                            title={`${a.name} — 분포를 보며 값 구간을 정합니다`}
                                            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "4px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {a.name}
                                        </button>
                                    ))}
                            </div>
                        </>
                    ) : (
                        <>
                    {item(close, "날짜", "날짜 구간 — 26.07.01~26.07.31 처럼", (e) => onRail({ kind: "date", x: e.clientX, y: e.clientY }), "date")}
                    {/* 하루 우주엔 위에 이미 "시각"(기본값으로 줄을 만든다)이 있다 — 같은 종류의 입구를
                        둘 세우지 않는다. 종단에는 기본값이 뜻이 없어 팝오버로만 만든다. */}
                    {setUniverse !== "daily" && item(close, "시간", "장중 시각 창 — 09:00~10:30 처럼", (e) => onRail({ kind: "time", x: e.clientX, y: e.clientY }), "time")}
                    {item(close, "계산 축 — 값 구간", "축을 고르면 분포를 보며 값 구간을 정합니다(빈 조건은 안 만듭니다)", () => setPane("axis"), "axisValue", true)}
                    {item(close, "결과 — 시그널 이후", "시그널 결과 판으로 — 연장 고점·저가(미래 값) 분포를 보며 그으면 조건이 됩니다", onOutcome, "outcome")}
                    {/* 그룹은 입구가 둘 — scope(질문의 층위)가 여기서 확정된다. 팔레트는 그 낟알의
                        그룹만 보여준다(그룹의 낟알 = 조건의 scope, 1:1 — 같은 그룹이 입구에 따라 다른
                        질문이 되는 모호함을 입구에서 끊는다). */}
                    {item(close, "그룹 (하루)", "그룹 식 — 하루가 행. 하루 그룹만 고를 수 있습니다", (e) => onGroup("day", e), "group")}
                    {item(close, "그룹 (타점)", "그룹 식 — 좌표 라벨이 붙은 타점이 행이 됩니다(타점 그룹만 고를 수 있습니다)", (e) => onGroup("point", e), "group")}
                    {item(close, "테마 강도", "기본값으로 켜진 행을 만들고, 어느 조건판에 연동할지 고릅니다(pull)", onTheme, "themeStrength")}
                    {canAddHot
                        ? item(close, nextHot === null ? "급타점 수" : `급타점 수 (${nextHot.w}분/${nextHot.r}%)`,
                            "아직 안 쓰인 자리로 행을 만들고 급타점 판에서 엽니다 — 짧은 시간에 급한 재돌파가 몇 번 지나갔나", onHot)
                        : <span style={{ display: "block", fontSize: 11.5, padding: "5px 10px", color: "var(--text-tertiary)" }}
                            title="급타점 인스턴스는 3개까지입니다 — 열이 늘면 화면이 먼저 무너집니다. 하나 지우고 다시 만드세요">
                            급타점 수 (3개 한도)
                        </span>}
                        </>
                    )}
                </div>
                )}
            </HeaderPopover>
        </div>
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
        <span title={`테마 재료 로드 실패 — 테마 필터는 전부 미배치로 세어집니다: ${err.message}`}
            style={{ fontSize: 10, color: FILTER, border: `1px solid ${FILTER}`, borderRadius: 8, padding: "0 6px" }}>
            재료 오류
        </span>
    );
}

/**
 * 테마 행의 연동 메뉴 — 미연동 조건판 목록 + "＋ 새 조건판" + (연동 중이면) 해제. 관찰판은 목록에
 * 원리적으로 안 나온다(후보 = theme-rank 밑동 슬롯뿐). 다른 행이 쓰는 판도 안 나온다(1:1).
 */
function ThemeLinkMenu({ anchor, boundId, candidates, onPick, onNew, onUnbind, onClose }: {
    anchor: { x: number; y: number };
    boundId: string | undefined;
    candidates: readonly string[];
    onPick: (panelId: string) => void;
    onNew: () => void;
    onUnbind: () => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose, true);
    const item = (label: string, hint: string, run: () => void, accent = false): JSX.Element => (
        <button key={label} onClick={run} title={hint}
            style={{
                display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                color: accent ? "var(--accent-primary)" : "var(--text-primary)", cursor: "pointer", font: "inherit",
                fontSize: 11.5, padding: "5px 10px", whiteSpace: "nowrap",
            }}>
            {label}
        </button>
    );
    return (
        <div ref={ref}
            style={{
                position: "fixed", top: Math.min(anchor.y + 4, window.innerHeight - 200), left: Math.min(anchor.x, window.innerWidth - 190),
                zIndex: 300, minWidth: 180, background: "var(--bg-primary)", border: "1px solid var(--border-default)",
                borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "4px 0",
            }}>
            <div style={{ padding: "3px 10px", fontSize: 10, color: "var(--text-tertiary)" }}>연동할 조건판 — 관찰판은 연동 불가</div>
            {candidates.map((id) =>
                item(`${boundId === id ? "◉ " : "○ "}${slotTitleOf(id)}`,
                    boundId === id ? "지금 이 행이 연동된 판" : "이 판에 연동하고 연다",
                    () => onPick(id), boundId === id))}
            {item("＋ 새 조건판", "빈 조건판을 만들어 연동하고 연다(설정 사본 없음)", onNew)}
            {boundId !== undefined && item("연동 해제", "판은 남고 십자선이 자유 자가 된다(마지막 N/M 스냅샷)", onUnbind)}
        </div>
    );
}
