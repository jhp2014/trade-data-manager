// 평면 위의 표식 — 잎(네모 + 안쪽 텍스트)과 컨테이너(가는 실선 영역) 두 얼굴, 노드 타입은 하나다.
//
// ⚠ 타입 이름이 `"group"` 이면 안 된다. React Flow 에 **같은 이름의 내장 타입**이 있어 그 스타일
// (`.react-flow__node-group` — 테두리·배경·padding 10px·width 150px)이 우리 노드에 그대로 얹힌다.
// 실제로 상자 바깥에 정체불명의 테두리가 하나 더 그려졌었다. CSS 로 덮지 말고 이름을 안 겹치게 둔다.
//
// **잎은 전부 같은 크기·같은 글씨다.** 크기가 아무것도 안 나르므로 차이는 오해거리일 뿐이다 —
// 모집단 수는 상자 안 숫자가, 관계의 세기는 선 위 숫자 크기가 나른다. 컨테이너만 제 크기를 갖는다
// (자식을 담아야 하므로). 잎이 한 줄이고 컨테이너가 헤더+빈 몸통인 건 규칙 하나로 읽힌다:
// **안이 비어 있냐 아니냐 = 하위 그룹이 있냐 없냐.**
//
// Handle 은 **네 변에 하나씩**(source·target 한 쌍씩). 어느 변을 쓸지는 두 노드의 상대 위치가 정하고
// (mapLayout.sidesBetween), 실제로 쓰이는 변에만 점이 보인다 — 네 변에 늘 찍으면 그룹 열 개에 점이
// 마흔 개라 배경이 시끄러워진다.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Group } from "../../api/groups.js";
import type { Side } from "./mapLayout.js";

/** 노드 타입 키 — RF 내장(`group`·`default`·`input`·`output`)과 겹치지 않아야 한다(위 주석). */
export const GROUP_NODE_TYPE = "tdmGroup";

export interface GroupNodeData extends Record<string, unknown> {
    group: Group;
    /** 모집단 소속 수(깔때기 "보는 집합" 기준). */
    count: number;
    /** 자식이 있어 영역으로 그려지는가(mapLayout 이 정한다). */
    container: boolean;
    /** 지금 선이 붙는 변들 — 여기에만 점이 보인다. */
    anchors: readonly Side[];
    /** 체인과 무관해 흐려지는가(교집합 0 = 이리로는 안 퍼진다 · 모집단 0). */
    dimmed: boolean;
    /** 체인에 든 그룹인가 — RF selected 와 별개(체인은 세션 시선). */
    picked: boolean;
    /** 체인의 **마지막**(지금 서 있는 자리) — 실선 화살표가 여기서 나간다. */
    head: boolean;
}

const SIDES: { side: Side; pos: Position }[] = [
    { side: "t", pos: Position.Top },
    { side: "r", pos: Position.Right },
    { side: "b", pos: Position.Bottom },
    { side: "l", pos: Position.Left },
];

/**
 * 네 변의 핸들 — 변마다 source·target 한 쌍이 **같은 자리에** 겹쳐 있다(어느 쪽으로 쓰일지는 그때 정해진다).
 * 점은 **target 핸들만** 그린다: 둘 다 그리면 같은 자리에 똑같은 원이 두 겹으로 쌓인다.
 * 안 쓰이는 변은 투명 — 네 변에 늘 점을 찍으면 그룹 열 개에 점이 마흔 개라 배경이 시끄러워진다.
 */
function SideHandles({ anchors, strong }: { anchors: readonly Side[]; strong: boolean }): JSX.Element {
    return (
        <>
            {SIDES.map(({ side, pos }) => {
                const dot = anchors.includes(side)
                    ? { width: 7, height: 7, borderRadius: "50%", border: "none", background: strong ? "var(--text-primary)" : "var(--text-tertiary)", pointerEvents: "none" as const }
                    : INVISIBLE;
                return (
                    <span key={side}>
                        <Handle id={`${side}-t`} type="target" position={pos} style={dot} />
                        <Handle id={`${side}-s`} type="source" position={pos} style={INVISIBLE} />
                    </span>
                );
            })}
        </>
    );
}

const INVISIBLE = { opacity: 0, pointerEvents: "none" as const };

/** 이름(왼쪽) · 수(오른쪽) 한 줄 — 잎의 본문이자 컨테이너의 헤더. 두 자리가 같은 글씨를 쓴다. */
function NameRow({ name, count, strong }: { name: string; count: number; strong: boolean }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 9px", height: LABEL_ROW_H, fontSize: 12, textAlign: "left" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: strong ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {name}
            </span>
            <span style={{ flexShrink: 0, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </div>
    );
}

const LABEL_ROW_H = 22;

export const GroupNode = memo(function GroupNode({ data }: NodeProps & { data: GroupNodeData }) {
    const { group, count, container, anchors, dimmed, picked, head } = data;
    // 체인에 들면 테두리가 진해지고, 그중 **마지막**만 두껍다 — 지금 서 있는 자리가 어디인지가 보이게.
    const border = head ? "2px solid var(--text-primary)" : picked ? "1px solid var(--text-primary)" : null;

    if (container) {
        return (
            <div
                style={{
                    width: "100%", height: "100%", borderRadius: 10, boxSizing: "border-box",
                    border: border ?? "1px solid var(--border-default)",
                    opacity: dimmed ? 0.35 : 1,
                    cursor: "grab",
                }}
                title={`${group.name} · 모집단 ${count} · 하위 그룹 영역(안에 넣으면 하위가 된다)`}
            >
                <SideHandles anchors={anchors} strong={picked} />
                <NameRow name={group.name} count={count} strong={picked} />
            </div>
        );
    }

    return (
        <div
            style={{
                width: "100%", height: "100%", boxSizing: "border-box", borderRadius: 7,
                display: "flex", alignItems: "center",
                border: border ?? "1px solid var(--border-strong)",
                background: "var(--bg-primary)",
                opacity: dimmed ? 0.3 : 1,
                cursor: "grab",
            }}
            title={`${group.name} · 모집단 ${count}`}
        >
            <SideHandles anchors={anchors} strong={picked} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <NameRow name={group.name} count={count} strong />
            </div>
        </div>
    );
});

/**
 * ⚠ **임시 진단 노드 — 확인이 끝나면 통째로 지운다.**
 *
 * 교집합 노드가 실제 마우스로 클릭도 드래그도 안 되던 원인을 가르기 위한 실험용이다. 후보가 셋이라
 * 셋을 각각 세워 어느 것이 안 눌리는지 본다: ① 상태 안 + 평범한 id ② 상태 밖 + 평범한 id
 * ③ 상태 밖 + 특수문자 id(`m:x+y` — `:`·`+` 는 CSS 선택자 메타문자).
 * 누르면 제 라벨에 눌린 횟수를 적고 `window.__mapProbe` 에도 남긴다(사람이 눌러야 판정이 선다).
 */
export const PROBE_NODE_TYPE = "tdmProbe";

export interface ProbeNodeData extends Record<string, unknown> {
    label: string;
    hits: number;
    onHit: () => void;
}

export const ProbeNode = memo(function ProbeNode({ data }: NodeProps & { data: ProbeNodeData }) {
    const { label, hits, onHit } = data;
    return (
        <div
            onClick={onHit}
            style={{
                width: "100%", height: "100%", boxSizing: "border-box", borderRadius: 7,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                border: `2px ${hits > 0 ? "solid" : "dashed"} var(--rise, #e24b4a)`,
                background: "var(--bg-primary)", fontSize: 11, color: "var(--text-primary)", cursor: "pointer",
            }}
            title={`진단용 노드 — 눌러 보세요 (${label})`}
        >
            <Handle id="t-t" type="target" position={Position.Top} style={INVISIBLE} />
            <span>{label}</span>
            <span style={{ fontWeight: 700 }}>{hits}</span>
            <Handle id="b-s" type="source" position={Position.Bottom} style={INVISIBLE} />
        </div>
    );
});

export const MAP_NODE_TYPES = { [GROUP_NODE_TYPE]: GroupNode, [PROBE_NODE_TYPE]: ProbeNode } as const;
