import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
    Background,
    Controls,
    Handle,
    Position,
    MarkerType,
    useNodesState,
    type Edge,
    type Connection,
    type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { hypothesesForPoint } from "@trade-data-manager/market";
import { useWorkbench } from "../store/workbench.js";
import {
    fetchHypotheses,
    fetchHypothesisLinks,
    fetchHypothesisRelations,
    addRelation,
    removeRelation,
} from "../api/hypotheses.js";
import { buildGraphLayout } from "../lib/graphLayout.js";
import { RELATION_TYPES, relationDef } from "../lib/relationTypes.js";

// 가설 관계 그래프 — reactflow + dagre. 노드=가설, 엣지=관계(종류별 색/점선/화살표).
// 노드 드래그 연결 → 관계 종류 선택 → 저장. 엣지 클릭=삭제. 선택은 store(selectedHypothesisId)로 리스트와 동기.
// 현재 Focus 타점에 연결된 가설은 좌측 accent 바로 강조. 노드 위치는 localStorage 영속.
interface HypNodeData {
    id: string;
    text: string;
    count: number;
    selected: boolean;
    linkedToPoint: boolean;
}

const handleStyle: React.CSSProperties = { width: 8, height: 8, background: "#9aa0ad", border: "none" };

function HypNode({ data }: NodeProps<HypNodeData>): JSX.Element {
    return (
        <div
            style={{
                width: 200,
                padding: "6px 9px",
                borderRadius: 8,
                background: data.selected ? "var(--accent-soft)" : "var(--bg-primary)",
                border: `1.5px solid ${data.selected ? "var(--accent-primary)" : "var(--border-default)"}`,
                boxShadow: data.linkedToPoint ? "inset 3px 0 0 0 var(--accent-primary)" : undefined,
                fontSize: 12,
                color: "var(--text-primary)",
            }}
        >
            <Handle type="target" position={Position.Top} style={handleStyle} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: "var(--accent-hover)" }}>H{data.id}</code>
                {data.count > 0 && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>·{data.count}</span>}
            </div>
            <div style={{ lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{data.text}</div>
            <Handle type="source" position={Position.Bottom} style={handleStyle} />
        </div>
    );
}

const nodeTypes = { hyp: HypNode };

const POS_KEY = "wb.hypGraphPositions";
function loadPositions(): Record<string, { x: number; y: number }> {
    try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) {
            const o: unknown = JSON.parse(raw);
            if (o && typeof o === "object") return o as Record<string, { x: number; y: number }>;
        }
    } catch {
        /* noop */
    }
    return {};
}
function savePositions(p: Record<string, { x: number; y: number }>): void {
    try {
        localStorage.setItem(POS_KEY, JSON.stringify(p));
    } catch {
        /* noop */
    }
}

export function HypothesisGraphPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);
    const selectedId = useWorkbench((s) => s.selectedHypothesisId);
    const setSelectedHypothesis = useWorkbench((s) => s.setSelectedHypothesis);
    const qc = useQueryClient();

    const hypQ = useQuery({ queryKey: ["hypotheses"], queryFn: fetchHypotheses, staleTime: Infinity });
    const linkQ = useQuery({ queryKey: ["hypothesis-links"], queryFn: fetchHypothesisLinks, staleTime: Infinity });
    const relQ = useQuery({ queryKey: ["hypothesis-relations"], queryFn: fetchHypothesisRelations, staleTime: Infinity });
    const hypotheses = useMemo(() => hypQ.data ?? [], [hypQ.data]);
    const links = useMemo(() => linkQ.data ?? [], [linkQ.data]);
    const relations = useMemo(() => relQ.data ?? [], [relQ.data]);

    const point = code && date && time ? { stockCode: code, date, time } : null;
    const linkedToPoint = useMemo(() => (point ? hypothesesForPoint(links, point) : new Set<string>()), [links, point]);
    const countByHyp = useMemo(() => {
        const m = new Map<string, number>();
        for (const l of links) m.set(l.hypothesisId, (m.get(l.hypothesisId) ?? 0) + 1);
        return m;
    }, [links]);
    const textById = useMemo(() => new Map(hypotheses.map((h) => [h.id, h.text])), [hypotheses]);

    const invalidateRel = (): void => void qc.invalidateQueries({ queryKey: ["hypothesis-relations"] });
    const addMut = useMutation({ mutationFn: addRelation, onSuccess: invalidateRel });
    const removeMut = useMutation({ mutationFn: removeRelation, onSuccess: invalidateRel });

    const [nodes, setNodes, onNodesChange] = useNodesState<HypNodeData>([]);
    const [pending, setPending] = useState<{ source: string; target: string } | null>(null);

    // 가설/관계 "집합"이 바뀔 때만 dagre 재배치(드래그 위치 보존).
    const structureKey = useMemo(
        () => hypotheses.map((h) => h.id).join(",") + "|" + relations.map((r) => r.id).join(","),
        [hypotheses, relations],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const layout = useMemo(() => buildGraphLayout(hypotheses.map((h) => h.id), relations), [structureKey]);

    // 구조 변화 → 저장 위치 우선, 없으면 dagre 위치로 (재)배치.
    useEffect(() => {
        const saved = loadPositions();
        setNodes(
            layout.map((n) => ({
                id: n.id,
                type: "hyp",
                position: saved[n.id] ?? { x: n.x, y: n.y },
                data: {
                    id: n.id,
                    text: textById.get(n.id) ?? "",
                    count: countByHyp.get(n.id) ?? 0,
                    selected: n.id === selectedId,
                    linkedToPoint: linkedToPoint.has(n.id),
                },
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout]);

    // 선택/연결/카운트 변화 → 위치 유지, data 만 갱신.
    useEffect(() => {
        setNodes((prev) =>
            prev.map((n) => ({
                ...n,
                data: {
                    id: n.id,
                    text: textById.get(n.id) ?? "",
                    count: countByHyp.get(n.id) ?? 0,
                    selected: n.id === selectedId,
                    linkedToPoint: linkedToPoint.has(n.id),
                },
            })),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, linkedToPoint, countByHyp, textById]);

    const edges: Edge[] = useMemo(
        () =>
            relations.map((r) => {
                const def = relationDef(r.relationType);
                const stroke = def?.color ?? "#9aa0ad";
                const touches = selectedId != null && (r.fromId === selectedId || r.toId === selectedId);
                return {
                    id: r.id,
                    source: r.fromId,
                    target: r.toId,
                    label: def?.label,
                    labelStyle: { fontSize: 10, fill: "var(--text-tertiary)" },
                    labelBgStyle: { fill: "var(--bg-primary)", fillOpacity: 0.85 },
                    markerEnd: def?.directional ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
                    style: {
                        stroke,
                        strokeDasharray: def?.dash,
                        strokeWidth: touches ? 2.4 : 1.4,
                        opacity: selectedId && !touches ? 0.35 : 1,
                    },
                };
            }),
        [relations, selectedId],
    );

    const onConnect = useCallback((c: Connection) => {
        if (c.source && c.target && c.source !== c.target) setPending({ source: c.source, target: c.target });
    }, []);

    // 드래그 종료 시 현재 전 노드 위치를 localStorage 에 저장(updater 로 최신 상태 읽기).
    const persistPositions = useCallback(() => {
        setNodes((cur) => {
            const p: Record<string, { x: number; y: number }> = {};
            for (const n of cur) p[n.id] = { x: n.position.x, y: n.position.y };
            savePositions(p);
            return cur;
        });
    }, [setNodes]);

    const chooseRelation = (value: string): void => {
        if (pending) addMut.mutate({ fromId: pending.source, toId: pending.target, relationType: value });
        setPending(null);
    };

    if (hypQ.isLoading) return <Center text="불러오는 중…" />;
    if (hypotheses.length === 0) return <Center text="가설이 없습니다 — 가설 패널에서 먼저 추가하세요" />;

    return (
        <div style={{ position: "relative", height: "100%", background: "var(--bg-primary)" }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
                onNodeDragStop={persistPositions}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
                minZoom={0.2}
                onNodeClick={(_, n) => setSelectedHypothesis(n.id)}
                onPaneClick={() => {
                    setSelectedHypothesis(null);
                    setPending(null);
                }}
                onEdgeClick={(_, e) => {
                    if (confirm("이 관계를 삭제할까요?")) removeMut.mutate(e.id);
                }}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={18} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>

            {/* 연결 시 관계 종류 선택 팝오버 */}
            {pending && (
                <div style={overlayStyle} onClick={() => setPending(null)}>
                    <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 600 }}>관계 종류 선택</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {RELATION_TYPES.map((t) => (
                                <button key={t.value} onClick={() => chooseRelation(t.value)} style={pickerBtn}>
                                    <span style={{ width: 20, borderTop: `2px ${t.dash ? "dashed" : "solid"} ${t.color}`, display: "inline-block" }} />
                                    <span style={{ flex: 1, textAlign: "left" }}>{t.label}</span>
                                    {t.directional && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>→</span>}
                                </button>
                            ))}
                            <button onClick={() => setPending(null)} style={{ ...pickerBtn, color: "var(--text-tertiary)", justifyContent: "center" }}>취소</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, background: "var(--bg-primary)", padding: 20, textAlign: "center" }}>
            {text}
        </div>
    );
}

const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.12)",
    zIndex: 10,
};
const cardStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: 10,
    padding: 12,
    minWidth: 180,
    boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
};
const pickerBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 12,
};
