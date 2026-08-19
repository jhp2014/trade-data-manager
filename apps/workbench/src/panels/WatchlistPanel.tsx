import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LiveStock } from "@trade-data-manager/wire";
import { availablePredicates, LIVE_ALARM_FIELDS } from "@trade-data-manager/market/domain";
import { useLiveSnapshot } from "../lib/LiveSnapshotContext.js";
import {
    addWatch,
    removeWatch,
    createAlertRule,
    deleteAlertRule,
    type AlarmPredicateInstance,
    type AlarmRuleView,
    type CreateRulePayload,
} from "../api/alerts.js";
import { kstTime } from "../lib/date.js";
import { liveWatchlistQuery } from "../api/queries.js";
import { optionLabel, predicateText, validatePredicates } from "../lib/predicateUi.js";
import { useWorkbench } from "../store/workbench.js";
import { usePersistedState } from "../store/persist.js";
import { useStockName } from "../lib/useStockName.js";
import { RuleForm, newPredicate } from "../components/RuleForm.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { liveToBoardStock } from "../lib/boardViewModel.js";

// 실시간 모니터링(watchlist) 패널 — 실시간 플레인. 승격한 선택 종목을 항상 폴링·표시하고(2층 구조),
// 종목별 알람 조건(술어 AND 리스트)을 편집한다. 여러 조건 = OR. 조건 편집기는 유니버스 알람과 공용
// (RuleForm, core 레지스트리 구동) — 스코프(code 유무)만 다르고 나머지는 같은 AlarmRule 이다.
// 발화는 서버(apps/live). 종목마다 현재 테마 순위(순환)도 표시. 조건·발화·순위 = /live/watchlist 5초 폴링.

// 모니터링 종목 표시 순서 — 로컬(기기별)만 저장. 서버 watchlist 는 코드 집합만, 순서는 이 오버레이가 결정.
const ORDER_KEY = "wb.watchlistOrder";
const parseOrder = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

export function WatchlistPanel(): JSX.Element {
    const { snapshot, error } = useLiveSnapshot();
    const focusCode = useWorkbench((s) => s.liveFocus.code);
    const setCode = useWorkbench((s) => s.setLiveCode);
    const market = useWorkbench((s) => s.boardMarket.live); // 실시간 시장 렌즈(등락률 %·순위 공용) — 보드와 공유
    const setBoardMarket = useWorkbench((s) => s.setBoardMarket);
    const originId = useId();
    const qc = useQueryClient();
    const [ruleFormCode, setRuleFormCode] = useState<string | null>(null); // 조건 추가 폼이 열린 종목
    const [rankThemeByCode, setRankThemeByCode] = useState<Record<string, string>>({}); // 종목별 순위 표시 테마(칩 클릭 선택)
    const [order, setOrder] = usePersistedState<string[]>(ORDER_KEY, parseOrder, []);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } })); // 5px 이동해야 드래그 시작(클릭은 선택 유지)

    const view = useQuery(liveWatchlistQuery());
    const invalidate = (): void => void qc.invalidateQueries({ queryKey: liveWatchlistQuery().queryKey });

    const addM = useMutation({ mutationFn: addWatch, onSettled: invalidate });
    const removeM = useMutation({ mutationFn: removeWatch, onSettled: invalidate });
    const deleteRuleM = useMutation({ mutationFn: deleteAlertRule, onSettled: invalidate });

    const focusName = useStockName(focusCode);
    const codes = view.data?.codes ?? [];
    const ranks = view.data?.ranks ?? {};
    // 표시 순서 = 로컬 순서 오버레이(서버에 없는 코드는 뒤에, 오버레이에 없는 신규 코드는 뒤에 붙임).
    const orderedCodes = useMemo(() => {
        const set = new Set(codes);
        const inOrder = order.filter((c) => set.has(c));
        const seen = new Set(inOrder);
        return [...inOrder, ...codes.filter((c) => !seen.has(c))];
    }, [codes, order]);
    const onDragEnd = (e: DragEndEvent): void => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const from = orderedCodes.indexOf(String(active.id));
        const to = orderedCodes.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        const next = arrayMove(orderedCodes, from, to);
        setOrder(next); // 영속은 usePersistedState 의 effect 가
    };
    const rulesByCode = useMemo(() => {
        const m = new Map<string, AlarmRuleView[]>();
        for (const r of view.data?.rules ?? []) {
            if (r.code == null) continue; // /watchlist 뷰는 스코프 규칙만 주지만 방어적으로
            const list = m.get(r.code);
            if (list) list.push(r);
            else m.set(r.code, [r]);
        }
        return m;
    }, [view.data]);
    // 시세 행 — 스냅샷의 watched 종목. 아직 스냅샷에 없으면(방금 추가·미폴링) 코드만으로 자리 표시.
    const stockOf = useMemo(() => {
        const m = new Map<string, LiveStock>();
        for (const s of snapshot?.stocks ?? []) if (s.watched) m.set(s.code, s);
        return m;
    }, [snapshot]);

    const submitAdd = (code: string): void => {
        if (!/^\d{6}$/.test(code)) return;
        addM.mutate(code);
    };

    if (view.isLoading) return <BoardCenter text="모니터링 로딩중…" />;
    if (view.isError) return <BoardCenter text={`오류: ${(view.error as Error).message} — apps/live 서버 확인`} />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
            {/* 헤더 — 점·건수 + 시장 토글(등락률·순위 공용, 보드와 공유) */}
            <PanelHeader chrome={false} gap={6} padding="3px 10px"
                style={{ fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} />
                <span style={{ color: "var(--plane-live)", flexShrink: 0 }}>실시간 모니터링</span>
                <span className="tabular" style={{ flexShrink: 0 }}>{codes.length}종목</span>
                {error && <span style={{ color: "var(--rise)", flexShrink: 0 }}>연결 오류</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }} title="기준 시장(등락률·순위) — 실시간 보드와 공유">
                    <span>시장</span>
                    <button onClick={() => setBoardMarket("live", market === "un" ? "krx" : "un")} style={{ ...plainBtn("var(--accent-primary)"), fontWeight: 600 }}>{market.toUpperCase()}</button>
                </span>
            </PanelHeader>

            {/* 본문 — 종목별 섹션(시세 행 + 순위줄 + 조건들) */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={orderedCodes} strategy={verticalListSortingStrategy}>
                        {orderedCodes.map((code) => {
                            const s = stockOf.get(code);
                            const rules = rulesByCode.get(code) ?? [];
                            // 순위 등수 = 선택 테마(칩 클릭, 기본=순위 있는 첫 테마)의 현재 순위. 보드처럼 이름 앞 숫자.
                            const selTheme = s ? rankThemeByCode[code] ?? s.themes.find((t) => ranks[`${code}|${t}|${market}`] != null) : undefined;
                            const selRank = selTheme != null ? ranks[`${code}|${selTheme}|${market}`] ?? null : null;
                            const showConditions = rules.length > 0 || ruleFormCode === code;
                            return (
                                <SortableItem key={code} id={code}>
                                    {(dragProps) => (
                                        <>
                                            <MonitorRow dragProps={dragProps} formOpen={ruleFormCode === code} onAddCondition={() => setRuleFormCode(code)} onRemove={() => removeM.mutate(code)}>
                                                {s ? (
                                                    <StockRow s={liveToBoardStock(s, market)} rank={selRank} selectedTheme={selTheme} onThemeClick={(t) => setRankThemeByCode((m) => ({ ...m, [code]: t }))} selected={code === focusCode} onPick={(c) => setCode(c, originId)} />
                                                ) : (
                                                    <div className="tabular" style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-tertiary)" }}>
                                                        {code} — 시세 대기중(다음 틱)
                                                    </div>
                                                )}
                                            </MonitorRow>
                                            {showConditions && (
                                                <div style={{ padding: "2px 10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
                                                    {rules.map((r) => (
                                                        <RuleLine key={r.id} rule={r} onDelete={() => deleteRuleM.mutate(r.id)} />
                                                    ))}
                                                    {ruleFormCode === code && (
                                                        <ConditionForm
                                                            code={code}
                                                            themes={s?.themes ?? []}
                                                            currentPrice={s?.price}
                                                            onClose={() => setRuleFormCode(null)}
                                                            onSaved={() => {
                                                                setRuleFormCode(null);
                                                                invalidate();
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </SortableItem>
                            );
                        })}
                    </SortableContext>
                </DndContext>

                {/* 하단 큰 추가 버튼 — 현재 포커스(보드 선택) 종목을 모니터링에 추가 */}
                <div style={{ padding: 10 }}>
                    <button
                        onClick={() => focusCode && submitAdd(focusCode)}
                        disabled={!focusCode || codes.includes(focusCode)}
                        style={{
                            width: "100%",
                            padding: "9px 10px",
                            borderRadius: 6,
                            border: "1px dashed var(--border-default)",
                            background: "var(--bg-tertiary)",
                            color: focusCode && !codes.includes(focusCode) ? "var(--accent-primary)" : "var(--text-tertiary)",
                            cursor: focusCode && !codes.includes(focusCode) ? "pointer" : "default",
                            font: "inherit",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        {!focusCode ? "실시간 보드에서 종목을 선택하세요" : codes.includes(focusCode) ? `${focusName ?? focusCode} — 이미 모니터링 중` : `+ ${focusName ?? focusCode} 모니터링 추가`}
                    </button>
                </div>

                {/* 발화 목록은 여기 없다 — "알람 로그" 패널이 watchlist·유니버스 발화를 시간순으로 함께 싣는
                    단일 자리다(억제분 포함). 룰이 마지막에 언제 울렸는지는 조건 줄의 "발화 HH:MM:SS" 로 충분. */}
            </div>
        </div>
    );
}

/** 드래그 정렬 아이템 — 섹션(행+조건)을 감싼다. 순서는 로컬 저장. dragProps(리스너)는 행에만 붙여
 *  조건 폼 입력은 드래그 대상에서 제외. */
function SortableItem({ id, children }: { id: string; children: (dragProps: React.HTMLAttributes<HTMLDivElement>) => ReactNode }): JSX.Element {
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    return (
        <div
            ref={setNodeRef}
            style={{
                position: "relative",
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
                borderBottom: "1px solid var(--border-default)",
                background: isDragging ? "var(--bg-active)" : undefined,
            }}
        >
            {children((listeners ?? {}) as unknown as React.HTMLAttributes<HTMLDivElement>)}
        </div>
    );
}

/** 모니터링 행 wrapper — 행 전체가 드래그 핸들(dragProps). hover(폼 닫힘) 시 좌측 그립 힌트 + 우측 추가·해제.
 *  조건 폼이 열리면 저장·취소는 폼 우측 상단에 있으므로 행 액션은 숨긴다. 오버레이는 버튼만 클릭 가능. */
function MonitorRow({ children, formOpen, onAddCondition, onRemove, dragProps }: {
    children: ReactNode;
    formOpen: boolean;
    onAddCondition: () => void;
    onRemove: () => void;
    dragProps: React.HTMLAttributes<HTMLDivElement>;
}): JSX.Element {
    const [hover, setHover] = useState(false);
    return (
        <div {...dragProps} style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {children}
            {hover && !formOpen && (
                <>
                    <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, height: "100%", width: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: "var(--text-tertiary)", fontSize: 12, lineHeight: 1 }}>⋮</div>
                    <div style={{ position: "absolute", top: 0, right: 0, height: "100%", display: "flex", alignItems: "center", gap: 8, paddingRight: 10, pointerEvents: "none" }}>
                        <RowAction label="추가" onClick={onAddCondition} accent wide />
                        <RowAction label="해제" onClick={onRemove} />
                    </div>
                </>
            )}
        </div>
    );
}

/** 행 우측 액션 버튼(글씨) — accent=강조(추가·저장), wide=조금 넓게. 클릭·pointerdown 모두 행(선택·드래그)과 분리. */
function RowAction({ label, onClick, accent = false, wide = false }: { label: string; onClick: () => void; accent?: boolean; wide?: boolean }): JSX.Element {
    return (
        <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            title={label}
            style={{
                pointerEvents: "auto",
                padding: wide ? "3px 14px" : "3px 9px",
                borderRadius: 5,
                border: accent ? "none" : "1px solid var(--border-default)",
                background: accent ? "var(--accent-primary)" : "var(--bg-primary)",
                color: accent ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
            }}
        >
            {label}
        </button>
    );
}

/**
 * 상자 없는 인라인 글자 버튼 — 줄 안에 얹히는 손잡이(✕·시장 토글). 공용 `miniBtn`(테두리 있는 헤더 버튼)과
 * **다른 물건**인데 이름이 같아서, 한쪽을 고치려다 다른 쪽을 집기 쉬웠다. 이름으로 갈라 둔다.
 */
function plainBtn(color: string): React.CSSProperties {
    return { border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11, color };
}

/** 조건 한 줄 요약(leaf AND) + 상태 점 + 삭제. */
function RuleLine({ rule, onDelete }: { rule: AlarmRuleView; onDelete: () => void }): JSX.Element {
    const parts = [rule.predicates.map(predicateText).join(" · ")];
    if (rule.name) parts.push(rule.name);
    // 상태 점 — 조건 안(주황 solid)=재무장 대기 / 무장(회색 테두리)=다음 진입에 발화 / 미평가(옅음).
    const dot = rule.inZone == null ? { border: "1px solid var(--border-default)" } : rule.inZone ? { background: "#e07b1a" } : { border: "1px solid var(--text-tertiary)" };
    const title = rule.inZone == null ? "평가 전(또는 데이터 대기)" : rule.inZone ? "조건 안(재무장 대기)" : "무장 — 다음 진입에 발화";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span title={title} style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, ...dot }} />
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts.join(" · ")}</span>
            {rule.lastFiredAt != null && <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>발화 {kstTime(rule.lastFiredAt)}</span>}
            <button style={{ ...plainBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0 }} onClick={onDelete} title="조건 삭제">✕</button>
        </div>
    );
}

// ── 조건 빌더 — core 술어 레지스트리 구동 ─────────────────────────────
// 종목 알람도 유니버스 알람과 **같은 편집기**(RuleForm/PredicateRow)를 쓴다. 서버는 진작 AlarmRule 하나·
// AlarmEngine 한 벌로 통합돼 있었고(스코프 차이는 code 유무뿐) 프론트만 두 벌이었다.
// 그래서 여기엔 술어 종류별 분기가 없다 — 팔레트는 소스 capability(LIVE_ALARM_FIELDS)가 정하고
// 입력·검증·표시는 ParamSpec/TextParamSpec 에서 파생된다. core 에 술어를 더하면 여기도 함께 열린다.
const ALARM_PREDICATES = availablePredicates(LIVE_ALARM_FIELDS);
const ALARM_KINDS = ALARM_PREDICATES.map((d) => d.kind);

/** 조건 추가 폼 — 술어(AND) 리스트 빌더. 저장/취소는 폼 상단 헤더 우측. */
function ConditionForm({ code, themes, currentPrice, onClose, onSaved }: {
    code: string;
    themes: string[];
    currentPrice?: number;
    onClose: () => void;
    onSaved: () => void;
}): JSX.Element {
    // 첫 조건은 가격 — 가장 흔한 용도. 현재가를 미리 채워 손을 덜어준다.
    const [predicates, setPredicates] = useState<AlarmPredicateInstance[]>(() => {
        const first = newPredicate("price");
        return [currentPrice != null ? { ...first, params: { ...first.params, value: Math.round(currentPrice) } } : first];
    });
    const [cooldownMin, setCooldownMin] = useState("3");
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);
    // 차트 캡처 무장 대상 = (몇 번째 조건, 어느 파라미터). 파라미터 단위라 가격을 가진 술어면 무엇이든 된다.
    const [armedAt, setArmedAt] = useState<{ index: number; key: string } | null>(null);
    const [showOpts, setShowOpts] = useState(false); // 쿨다운·메모 접기(기본 접힘 — 폼 정돈)

    const arm = useWorkbench((s) => s.armAlertCapture);
    const disarm = useWorkbench((s) => s.disarmAlertCapture);
    const setLiveCode = useWorkbench((s) => s.setLiveCode);
    const captured = useWorkbench((s) => s.alertCapturedPrice);
    const setAlertDraftLines = useWorkbench((s) => s.setAlertDraftLines);
    const originId = useId();
    const seenSeqRef = useRef<number>(-1);

    useEffect(() => () => disarm(), [disarm]); // 폼 닫힘(닫기·저장) → 캡처 해제

    const patchParam = (index: number, key: string, value: number): void =>
        setPredicates((ps) => ps.map((x, j) => (j !== index ? x : { ...x, params: { ...x.params, [key]: value } })));

    // 배달된 캡처 가격을 무장된 파라미터에 주입 — seq 증가 감지, 마운트 시점 값은 기준선으로 무시.
    useEffect(() => {
        const seq = captured?.seq ?? 0;
        if (seenSeqRef.current < 0) {
            seenSeqRef.current = seq;
            return;
        }
        if (!captured || armedAt == null || seq === seenSeqRef.current) return;
        seenSeqRef.current = seq;
        patchParam(armedAt.index, armedAt.key, Math.round(captured.price));
    }, [captured, armedAt]);

    // 편집 중 가격 조건을 실시간 차트에 미리보기 선으로. 방향(↑/↓)은 레지스트리 옵션에서 읽는다(0/1 하드코딩 금지).
    useEffect(() => {
        const lines = predicates.flatMap((p) => {
            const v = Number(p.params.value);
            if (p.kind !== "price" || !Number.isFinite(v) || v <= 0) return [];
            return [{ price: v, up: optionLabel("price", "op", p.params) === "\u2265" }];
        });
        setAlertDraftLines({ code, lines });
    }, [predicates, code, setAlertDraftLines]);
    useEffect(() => () => setAlertDraftLines(null), [setAlertDraftLines]);

    const toggleCapture = (index: number, key: string): void => {
        if (armedAt?.index === index && armedAt.key === key) {
            setArmedAt(null);
            disarm();
            return;
        }
        setArmedAt({ index, key });
        arm(code);
        setLiveCode(code, originId); // 차트가 이 종목을 보도록(캡처 정합)
    };

    const saveM = useMutation({ mutationFn: createAlertRule, onSuccess: onSaved, onError: (e: Error) => setErr(e.message) });

    const submit = (): void => {
        if (saveM.isPending) return;
        const problem = validatePredicates(predicates);
        setErr(problem);
        if (problem) return;
        // 쿨다운 검증 — NaN 이면 Math.round(NaN*…)=NaN 이 JSON 에서 null 로 새어 서버에 무검증 전달되던 자리.
        // 빈 값 = 서버 기본값. type="number" 가 대부분 막지만 명시 가드로 최종 방어(음수·비정상 입력).
        const cdNum = Number(cooldownMin);
        if (cooldownMin !== "" && (!Number.isFinite(cdNum) || cdNum < 0)) {
            setErr("쿨다운은 0 이상의 숫자(분)여야 합니다");
            return;
        }
        saveM.mutate({
            code,
            predicates,
            cooldownMs: cooldownMin === "" ? undefined : Math.round(cdNum * 60_000),
            name: note.trim() || undefined,
        } satisfies CreateRulePayload);
    };

    // 상단 헤더 — 쿨다운·메모 접기(좌) + 저장/취소(우)
    const header = (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setShowOpts((v) => !v)} style={{ border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", font: "inherit", fontSize: 11, padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9 }}>{showOpts ? "\u25BE" : "\u25B8"}</span> 쿨다운 {cooldownMin || "0"}분{note ? " · 메모 \u2713" : ""}
                </button>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button onClick={submit} disabled={saveM.isPending} style={{ border: "none", background: "var(--accent-primary)", color: "#fff", borderRadius: 5, padding: "3px 12px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, opacity: saveM.isPending ? 0.6 : 1 }}>{saveM.isPending ? "저장중…" : "저장"}</button>
                    <button onClick={onClose} style={{ border: "1px solid var(--border-default)", background: "var(--bg-primary)", color: "var(--text-secondary)", borderRadius: 5, padding: "3px 10px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}>취소</button>
                </span>
            </div>
            {showOpts && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ width: 32, flexShrink: 0, color: "var(--text-tertiary)" }}>쿨다운</span>
                        <span style={{ color: "var(--text-tertiary)" }}>발화 후</span>
                        <input type="number" min={0} style={{ ...numStyle, width: 40 }} className="tabular" value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} title="발화 후 이 시간 안에는 재진입해도 알람 억제(진동 방지)" />
                        <span style={{ color: "var(--text-tertiary)" }}>분 지나야 다시 알람</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 32, flexShrink: 0, color: "var(--text-tertiary)" }}>메모</span>
                        <input style={{ ...numStyle, flex: 1, width: "auto", textAlign: "left" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="알림에 실림" />
                    </div>
                </div>
            )}
        </div>
    );

    // 조건들(AND) — 유니버스 알람과 같은 폼 골격(RuleForm). 리스트 연산은 공용, 캡처만 이 폼의 배선.
    return (
        <RuleForm
            style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 12 }}
            top={header}
            predicates={predicates}
            onPredicates={setPredicates}
            kinds={ALARM_KINDS}
            addKind="price"
            listStyle={{ display: "flex", flexDirection: "column", gap: 8, border: "0.5px solid var(--border-default)", borderRadius: 6, padding: "7px 10px" }}
            capture={{ activeAt: armedAt, onToggle: toggleCapture }}
            suggest={{ theme: themes }}
            error={err}
        />
    );
}

const numStyle: React.CSSProperties = { width: 62, fontSize: 12, padding: "2px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none", textAlign: "right" };
