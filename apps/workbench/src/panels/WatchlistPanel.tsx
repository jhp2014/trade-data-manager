import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LiveStock } from "@trade-data-manager/wire";
import { useLiveSnapshot } from "../api/live.js";
import {
    fetchWatchlist,
    addWatch,
    removeWatch,
    createAlertRule,
    deleteAlertRule,
    type AlarmPredicateInstance,
    type AlarmRuleView,
    type AlertMarket,
    type CreateRulePayload,
} from "../api/alerts.js";
import { kstTime } from "../lib/date.js";
import { useWorkbench } from "../store/workbench.js";
import { useStockName } from "../lib/useStockName.js";
import { StockRow } from "../components/board/StockRow.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { liveToBoardStock } from "../lib/boardViewModel.js";

// 실시간 모니터링(watchlist) 패널 — 실시간 플레인. 승격한 선택 종목을 항상 폴링·표시하고(2층 구조),
// 종목별 알람 조건(leaf AND 리스트, leaf 2종: 가격 절대임계·테마 등락률순위)을 편집한다. 여러 조건 = OR.
// 발화는 텔레그램+서버. 종목마다 현재 테마 순위(순환)도 표시. 조건·발화·순위 = /live/watchlist 5초 폴링.
const WATCHLIST_KEY = ["live-watchlist"];

// 모니터링 종목 표시 순서 — 로컬(기기별)만 저장. 서버 watchlist 는 코드 집합만, 순서는 이 오버레이가 결정.
const ORDER_KEY = "wb.watchlistOrder";
function loadOrder(): string[] {
    try {
        const v: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}
function saveOrder(o: string[]): void {
    try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(o));
    } catch {
        /* noop */
    }
}

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
    const [order, setOrder] = useState<string[]>(() => loadOrder());
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } })); // 5px 이동해야 드래그 시작(클릭은 선택 유지)

    const view = useQuery({ queryKey: WATCHLIST_KEY, queryFn: ({ signal }) => fetchWatchlist(signal), refetchInterval: 5_000 });
    const invalidate = (): void => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY });

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
        setOrder(next);
        saveOrder(next);
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
            <div style={{ padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--plane-live)", flexShrink: 0 }} />
                <span style={{ color: "var(--plane-live)" }}>실시간 모니터링</span>
                <span className="tabular">{codes.length}종목</span>
                {error && <span style={{ color: "var(--rise)" }}>연결 오류</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }} title="기준 시장(등락률·순위) — 실시간 보드와 공유">
                    <span>시장</span>
                    <button onClick={() => setBoardMarket("live", market === "un" ? "krx" : "un")} style={{ ...miniBtn("var(--accent-primary)"), fontWeight: 600 }}>{market.toUpperCase()}</button>
                </span>
            </div>

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

function miniBtn(color: string): React.CSSProperties {
    return { border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11, color };
}

const mkLabel = (m: AlertMarket): string => (m === "krx" ? "KRX" : "UN");

/** 술어 한 개 → 짧은 텍스트(price·themeRank — watchlist 빌더가 만드는 두 종류). */
function predText(p: AlarmPredicateInstance): string {
    if (p.kind === "price") return `${p.params.op === 1 ? "≤" : "≥"} ${p.params.value.toLocaleString("ko-KR")}`;
    if (p.kind === "themeRank") {
        const mk = p.params.market === 0 ? "KRX" : "UN";
        return `${p.textParams?.theme ?? "테마"}(${mk}) ${p.params.mode === 1 ? `↑${p.params.threshold}계단` : `${p.params.threshold}위 이내`}`;
    }
    return p.kind; // 다른 술어(유니버스 빌더산) — 여기선 요약만
}

/** 조건 한 줄 요약(leaf AND) + 상태 점 + 삭제. */
function RuleLine({ rule, onDelete }: { rule: AlarmRuleView; onDelete: () => void }): JSX.Element {
    const parts = [rule.predicates.map(predText).join(" · ")];
    if (rule.name) parts.push(rule.name);
    // 상태 점 — 조건 안(주황 solid)=재무장 대기 / 무장(회색 테두리)=다음 진입에 발화 / 미평가(옅음).
    const dot = rule.inZone == null ? { border: "1px solid var(--border-default)" } : rule.inZone ? { background: "#e07b1a" } : { border: "1px solid var(--text-tertiary)" };
    const title = rule.inZone == null ? "평가 전(또는 데이터 대기)" : rule.inZone ? "조건 안(재무장 대기)" : "무장 — 다음 진입에 발화";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span title={title} style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, ...dot }} />
            <span className="tabular" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts.join(" · ")}</span>
            {rule.lastFiredAt != null && <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>발화 {kstTime(rule.lastFiredAt)}</span>}
            <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: "auto", flexShrink: 0 }} onClick={onDelete} title="조건 삭제">✕</button>
        </div>
    );
}

// ── 조건 빌더 (leaf AND 리스트) ─────────────────────────────────
type DraftLeaf =
    | { kind: "price"; op: "gte" | "lte"; value: string }
    | { kind: "rank"; theme: string; market: AlertMarket; mode: "reach" | "delta"; threshold: string };

const DEFAULT_MARKET: AlertMarket = "un"; // 순위 기본 잣대(UN)
const newPriceLeaf = (value = ""): DraftLeaf => ({ kind: "price", op: "gte", value });
function newLeafOfKind(kind: DraftLeaf["kind"], themes: string[]): DraftLeaf {
    if (kind === "price") return newPriceLeaf();
    return { kind: "rank", theme: themes[0] ?? "", market: DEFAULT_MARKET, mode: "reach", threshold: "" };
}

/** draft → 검증된 술어 인스턴스(core price/themeRank) 또는 오류 메시지(문자열). */
function toPredicate(d: DraftLeaf): AlarmPredicateInstance | string {
    if (d.kind === "price") {
        const v = Number(d.value);
        if (d.value.trim() === "" || !Number.isFinite(v) || v <= 0) return "가격은 0 초과 숫자로";
        return { kind: "price", params: { op: d.op === "lte" ? 1 : 0, value: v } };
    }
    if (!d.theme) return "순위 조건은 테마를 골라야 함";
    const t = Number(d.threshold);
    if (!Number.isInteger(t) || t < 1) return "순위 임계는 1 이상 정수";
    return {
        kind: "themeRank",
        params: { market: d.market === "krx" ? 0 : 1, mode: d.mode === "delta" ? 1 : 0, threshold: t },
        textParams: { theme: d.theme },
    };
}

/** 조건 추가 폼 — leaf(AND) 리스트 빌더. 저장/취소는 폼 상단 헤더 우측. */
function ConditionForm({ code, themes, currentPrice, onClose, onSaved }: {
    code: string;
    themes: string[];
    currentPrice?: number;
    onClose: () => void;
    onSaved: () => void;
}): JSX.Element {
    const [leaves, setLeaves] = useState<DraftLeaf[]>(() => [newPriceLeaf(currentPrice != null ? String(currentPrice) : "")]);
    const [cooldownMin, setCooldownMin] = useState("3");
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [activePrice, setActivePrice] = useState<number | null>(null); // 캡처 대상 가격 leaf 인덱스
    const [showOpts, setShowOpts] = useState(false); // 쿨다운·메모 접기(기본 접힘 — 폼 정돈)

    const arm = useWorkbench((s) => s.armAlertCapture);
    const disarm = useWorkbench((s) => s.disarmAlertCapture);
    const setLiveCode = useWorkbench((s) => s.setLiveCode);
    const captured = useWorkbench((s) => s.alertCapturedPrice);
    const setAlertDraftLines = useWorkbench((s) => s.setAlertDraftLines);
    const originId = useId();
    const seenSeqRef = useRef<number>(-1);

    useEffect(() => () => disarm(), [disarm]); // 폼 닫힘(닫기·저장) → 캡처 해제
    // 배달된 캡처 가격을 활성 가격 leaf 에 주입 — seq 증가 감지, 마운트 시점 값은 기준선으로 무시.
    useEffect(() => {
        const seq = captured?.seq ?? 0;
        if (seenSeqRef.current < 0) {
            seenSeqRef.current = seq;
            return;
        }
        if (!captured || activePrice == null || seq === seenSeqRef.current) return;
        seenSeqRef.current = seq;
        setLeaves((ls) => ls.map((x, j) => (j !== activePrice || x.kind !== "price" ? x : { ...x, value: String(Math.round(captured.price)) })));
    }, [captured, activePrice]);

    // 편집 중인 가격 leaf 를 실시간 차트에 미리보기 선으로 발행(클릭하면 바로 선이 보이게). 폼 닫히면 제거.
    useEffect(() => {
        const lines = leaves.flatMap((l) => {
            if (l.kind !== "price") return [];
            const p = Number(l.value);
            return Number.isFinite(p) && p > 0 ? [{ price: p, up: l.op === "gte" }] : [];
        });
        setAlertDraftLines({ code, lines });
    }, [leaves, code, setAlertDraftLines]);
    useEffect(() => () => setAlertDraftLines(null), [setAlertDraftLines]);

    const armPrice = (i: number): void => {
        setActivePrice(i);
        arm(code);
        setLiveCode(code, originId); // 차트가 이 종목을 보도록(캡처 정합)
    };
    const disarmPrice = (): void => {
        setActivePrice(null);
        disarm();
    };

    const patchLeaf = (i: number, leaf: DraftLeaf): void => setLeaves((ls) => ls.map((x, j) => (j !== i ? x : leaf)));
    const setKind = (i: number, kind: DraftLeaf["kind"]): void => setLeaves((ls) => ls.map((x, j) => (j !== i ? x : newLeafOfKind(kind, themes))));
    const addLeaf = (): void => setLeaves((ls) => [...ls, newPriceLeaf()]);
    const removeLeaf = (i: number): void => setLeaves((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

    const saveM = useMutation({ mutationFn: createAlertRule, onSuccess: onSaved, onError: (e: Error) => setErr(e.message) });

    const submit = (): void => {
        if (saveM.isPending) return;
        setErr(null);
        const out: AlarmPredicateInstance[] = [];
        for (const d of leaves) {
            const r = toPredicate(d);
            if (typeof r === "string") {
                setErr(r);
                return;
            }
            out.push(r);
        }
        const payload: CreateRulePayload = {
            code,
            predicates: out,
            cooldownMs: cooldownMin === "" ? undefined : Math.round(Number(cooldownMin) * 60_000),
            name: note.trim() || undefined,
        };
        saveM.mutate(payload);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 12 }}>
            {/* 상단 헤더 — 쿨다운·메모 접기(좌) + 저장/취소(우) */}
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setShowOpts((v) => !v)} style={{ border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", font: "inherit", fontSize: 11, padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 9 }}>{showOpts ? "▾" : "▸"}</span> 쿨다운 {cooldownMin || "0"}분{note ? " · 메모 ✓" : ""}
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
                            <input style={{ ...numStyle, width: 40 }} className="tabular" value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} title="발화 후 이 시간 안에는 재진입해도 알람 억제(진동 방지)" />
                            <span style={{ color: "var(--text-tertiary)" }}>분 지나야 다시 알람</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 32, flexShrink: 0, color: "var(--text-tertiary)" }}>메모</span>
                            <input style={{ ...numStyle, flex: 1, width: "auto", textAlign: "left" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="알림에 실림" />
                        </div>
                    </div>
                )}
            </div>
            <div style={{ border: "0.5px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                {leaves.map((leaf, i) => (
                    <LeafRow
                        key={i}
                        leaf={leaf}
                        themes={themes}
                        onKind={(k) => setKind(i, k)}
                        onPatch={(l) => patchLeaf(i, l)}
                        onRemove={() => removeLeaf(i)}
                        canRemove={leaves.length > 1}
                        active={activePrice === i && leaf.kind === "price"}
                        onToggleCapture={() => (activePrice === i ? disarmPrice() : armPrice(i))}
                        divider={i > 0}
                    />
                ))}
            </div>
            <button
                onClick={addLeaf}
                style={{ width: "100%", padding: 6, borderRadius: 5, border: "1px dashed var(--border-default)", background: "none", color: "var(--accent-primary)", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}
            >
                ＋ 조건 추가
            </button>
            {err && <div style={{ color: "var(--rise)" }}>{err}</div>}
        </div>
    );
}

/** leaf 편집기(컴팩트 한 줄) — 종류 · 부등호 · 값 정렬. 부등호(≥/≤/↑)는 클릭 토글, 값은 인라인 입력.
 *  가격은 수정(차트 캡처) 토글, 순위는 테마·시장. active=수정 중. divider=위 구분선. */
function LeafRow({ leaf, themes, onKind, onPatch, onRemove, canRemove, active = false, onToggleCapture, divider = false }: {
    leaf: DraftLeaf;
    themes: string[];
    onKind: (kind: DraftLeaf["kind"]) => void;
    onPatch: (leaf: DraftLeaf) => void;
    onRemove: () => void;
    canRemove: boolean;
    active?: boolean;
    onToggleCapture: () => void;
    divider?: boolean;
}): JSX.Element {
    const sym: React.CSSProperties = { border: "none", background: "none", color: "var(--accent-primary)", fontWeight: 600, cursor: "pointer", font: "inherit", fontSize: 14, padding: "0 2px", flexShrink: 0 };
    const kindBtn: React.CSSProperties = { border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", font: "inherit", fontSize: 12, minWidth: 26, textAlign: "left", padding: 0, flexShrink: 0 };
    const mut: React.CSSProperties = { color: "var(--text-tertiary)", flexShrink: 0 };
    // 값 입력 = 밑줄 없이 텍스트처럼(앰버 굵게 — 편집 가능 티는 색으로).
    const valTok: React.CSSProperties = { border: "none", background: "transparent", color: "var(--accent-primary)", padding: "0 2px", font: "inherit", fontWeight: 600, outline: "none", textAlign: "right", flexShrink: 0 };
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 12, minWidth: 0, borderTop: divider ? "0.5px solid var(--border-subtle)" : undefined, background: active ? "var(--accent-soft)" : "transparent" }}>
            <button style={kindBtn} onClick={() => onKind(leaf.kind === "price" ? "rank" : "price")} title="종류 전환(가격/순위)">{leaf.kind === "price" ? "가격" : "순위"}</button>
            {leaf.kind === "price" && (
                <>
                    <button style={sym} onClick={() => onPatch({ ...leaf, op: leaf.op === "gte" ? "lte" : "gte" })} title="이상(≥)/이하(≤)">{leaf.op === "gte" ? "≥" : "≤"}</button>
                    <input style={{ ...valTok, width: 74 }} className="tabular" value={leaf.value} onChange={(e) => onPatch({ ...leaf, value: e.target.value })} placeholder="가격" />
                    <span style={mut}>원</span>
                    <button
                        onClick={onToggleCapture}
                        title="차트 좌클릭으로 가격 입력 (재클릭 시 해제)"
                        style={{ marginLeft: "auto", flexShrink: 0, border: "none", background: active ? "var(--accent-primary)" : "none", color: active ? "#fff" : "var(--accent-primary)", borderRadius: 4, padding: "1px 9px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}
                    >
                        {active ? "완료" : "차트로 입력"}
                    </button>
                </>
            )}
            {leaf.kind === "rank" && (
                <>
                    <button
                        onClick={() => { if (!themes.length) return; const i = themes.indexOf(leaf.theme); onPatch({ ...leaf, theme: themes[(i + 1) % themes.length] }); }}
                        title={themes.length ? "클릭: 다음 테마" : "테마 미배정 — 보드 우클릭으로 배정"}
                        style={{ border: "none", background: "none", color: themes.length ? "var(--text-primary)" : "var(--text-tertiary)", cursor: themes.length ? "pointer" : "default", font: "inherit", fontSize: 12, fontWeight: 500, padding: "0 2px", minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 2 }}
                    >
                        {leaf.theme || "테마"}<span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>▾</span>
                    </button>
                    <button style={{ border: "none", background: "none", color: "var(--text-secondary)", fontWeight: 600, padding: "0 2px", fontSize: 11, cursor: "pointer", font: "inherit", flexShrink: 0 }} onClick={() => onPatch({ ...leaf, market: leaf.market === "un" ? "krx" : "un" })} title="기준 시장 순환(UN↔KRX)">{mkLabel(leaf.market)}</button>
                    <button style={sym} onClick={() => onPatch({ ...leaf, mode: leaf.mode === "reach" ? "delta" : "reach" })} title="도달(≤K위)/상승(↑D단계)">{leaf.mode === "reach" ? "≤" : "↑"}</button>
                    <input style={{ ...valTok, width: 38, textAlign: "center" }} className="tabular" value={leaf.threshold} onChange={(e) => onPatch({ ...leaf, threshold: e.target.value })} placeholder={leaf.mode === "reach" ? "K" : "D"} />
                    <span style={mut}>{leaf.mode === "reach" ? "위" : "단계"}</span>
                </>
            )}
            {canRemove && <button style={{ ...miniBtn("var(--text-tertiary)"), marginLeft: leaf.kind === "rank" ? "auto" : 0, flexShrink: 0, fontSize: 13 }} onClick={onRemove} title="이 조건 삭제">✕</button>}
        </div>
    );
}

const numStyle: React.CSSProperties = { width: 62, fontSize: 12, padding: "2px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none", textAlign: "right" };
