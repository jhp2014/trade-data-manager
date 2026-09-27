// 라벨 술어의 **편집면** — 조건판 라벨 줄에서 여는 팝오버(테마·돌파·캔들과 같은 그릇, 2026-09-27).
// 트리 체크 목록(A안): 입구가 정한 종류의 그룹만(▣ 하루 / ◆ 타점) 계층 들여쓰기로 세우고, 체크 = OR.
// scope 토글은 **없다** — 입구에서 태어날 때 고정(decisions 「라벨 조건」: 같은 그룹이 입구에 따라
// 다른 질문이 되던 옛 혼선을 문법에서 막는다).
//
// · 부모를 고르면 자식 라벨도 통과한다(계층 상속 — 판정은 재료 층 cellMaterials.labelIndexOf).
// · 라벨이 하나도 없는 빈 그룹은 안 세운다(조건으로 걸면 늘 거짓인 잡음 — groupGrain 규칙).
// · 저장물에 있지만 사전에 없는 이름(지워진 그룹)은 맨 아래 흐린 줄로 세운다 — 조용히 숨기면 그 조건이
//   왜 0건인지 아무도 모른다. 체크를 풀면 걷힌다.
import { useMemo, useRef } from "react";
import type { CellPredicate } from "@trade-data-manager/market/domain";
import type { Group } from "../../api/groups.js";
import { useGroups } from "../../lib/GroupsContext.js";
import { useDismiss } from "../../ui/useDismiss.js";
import { FAIL } from "../../styles/palette.js";

type LabelPred = Extract<CellPredicate, { kind: "label" }>;

/** 트리 한 줄 — 깊이만큼 들여쓴다. 순서 = 부모 다음에 자식(이름순). */
interface TreeRow {
    group: Group;
    depth: number;
}

/** 허용된 그룹만으로 트리를 편다 — 부모가 허용 밖이면 그 자식이 최상위로 선다(끊긴 사슬 관대). */
export function labelTreeRows(groups: readonly Group[], allowed: ReadonlySet<string>): TreeRow[] {
    const shown = groups.filter((g) => allowed.has(g.name));
    const names = new Set(shown.map((g) => g.name));
    const kids = new Map<string | null, Group[]>();
    for (const g of shown) {
        const parent = g.parentName !== null && names.has(g.parentName) ? g.parentName : null;
        const list = kids.get(parent);
        if (list) list.push(g);
        else kids.set(parent, [g]);
    }
    const out: TreeRow[] = [];
    const seen = new Set<string>(); // 순환 방어 — 저장 경로가 막지만 깨진 사전으로 무한 재귀하지 않게
    const walk = (parent: string | null, depth: number): void => {
        for (const g of [...(kids.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
            if (seen.has(g.name)) continue;
            seen.add(g.name);
            out.push({ group: g, depth });
            walk(g.name, depth + 1);
        }
    };
    walk(null, 0);
    return out;
}

export function LabelCondEditor({ at, pred, onWrite, onClose }: {
    at: { x: number; y: number };
    pred: LabelPred;
    onWrite: (next: LabelPred) => void;
    onClose: () => void;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useDismiss(ref, onClose, true);
    const g = useGroups();
    const isDay = pred.scope === "day";
    const allowed = isDay ? g.grainSets.dayGrain : g.grainSets.pointGrain;
    const rows = useMemo(() => labelTreeRows(g.groups, allowed), [g.groups, allowed]);
    const countOf = isDay ? g.countOf : g.pointCountOf;
    const picked = new Set(pred.groups);
    const missing = pred.groups.filter((n) => !g.groupByName.has(n));

    const toggle = (name: string): void => {
        const next = picked.has(name) ? pred.groups.filter((n) => n !== name) : [...pred.groups, name];
        onWrite({ ...pred, groups: next });
    };

    const row: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", background: "transparent",
        padding: "3px 4px", cursor: "pointer", font: "inherit", fontSize: 11.5, textAlign: "left", color: "var(--text-primary)",
    };
    const box = (on: boolean, color?: string): JSX.Element => (
        <span aria-hidden style={{
            width: 12, height: 12, flexShrink: 0, borderRadius: 3, fontSize: 9, lineHeight: "11px", textAlign: "center",
            border: `1px solid ${on ? (color ?? "var(--accent-primary)") : "var(--border-strong)"}`,
            background: on ? (color ?? "var(--accent-primary)") : "transparent", color: "#fff",
        }}>{on ? "✓" : ""}</span>
    );

    return (
        <div ref={ref} role="dialog" style={{
            position: "fixed", top: Math.min(at.y + 6, window.innerHeight - 320), left: Math.min(at.x - 6, window.innerWidth - 290),
            zIndex: 300, width: 272, background: "var(--bg-primary)", border: "1px solid var(--border-default)",
            borderRadius: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", padding: "8px 10px 10px",
        }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 2 }}>
                {isDay ? "▣ 라벨 (하루)" : "◆ 라벨 (타점)"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 6, lineHeight: 1.4 }}>
                {isDay
                    ? "그 종목·날에 붙인 하루 그룹 — 그날 모든 분이 물려받는다. 체크 = 하나라도(OR)."
                    : "라벨 찍은 그 분 좌표만. 체크 = 하나라도(OR)."}
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {rows.length === 0 && missing.length === 0 && (
                    <div style={{ padding: "6px 4px", fontSize: 11, color: "var(--text-tertiary)" }}>
                        {isDay ? "하루 라벨이 붙은 그룹이 아직 없습니다 — 차트·목록 우클릭으로 붙입니다"
                            : "타점 라벨이 붙은 그룹이 아직 없습니다 — 차트 봉 우클릭으로 붙입니다"}
                    </div>
                )}
                {rows.map(({ group, depth }) => (
                    <button key={group.name} role="menuitemcheckbox" aria-checked={picked.has(group.name)}
                        onClick={() => toggle(group.name)} style={{ ...row, paddingLeft: 4 + depth * 14 }}
                        title={depth > 0 ? `${group.parentName} 아래 — 부모를 고르면 이 그룹 라벨도 통과합니다` : undefined}>
                        {box(picked.has(group.name))}
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{countOf(group.name)}</span>
                    </button>
                ))}
                {missing.map((name) => (
                    <button key={`missing:${name}`} role="menuitemcheckbox" aria-checked onClick={() => toggle(name)}
                        title="사전에 없는 그룹 — 지워졌거나 이름이 바뀌었습니다. 체크를 풀면 조건에서 걷힙니다"
                        style={{ ...row, color: "var(--text-tertiary)" }}>
                        {box(true, FAIL)}
                        <span style={{ flex: 1, textDecoration: "line-through" }}>{name}</span>
                        <span style={{ fontSize: 10, color: FAIL }}>지워짐</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
