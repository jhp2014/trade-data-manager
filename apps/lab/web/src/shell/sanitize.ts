// 배치 JSON 정리 — 등록 안 된 컴포넌트의 패널을 걷고, 그 때문에 비거나 외자식이 된 칸을 접는다.
// tdm-work workbench store/dock.ts 의 sanitizeLayout 을 옮겨 왔다(등록 집합은 인자로 받는다).
//
// 왜: 저장 배치·저장 화면에 등록 안 된 컴포넌트가 하나라도 있으면 dockview fromJSON 이 통째로 실패한다
// (패널 이름(base)을 바꾸거나 지운 뒤의 옛 저장물). panels 맵과 grid 트리·플로팅/팝아웃 그룹을 함께
// 고쳐야 정합이 유지된다(한쪽만 지우면 dangling). 고칠 게 없으면 원본을 그대로 돌려준다.
//
// ⚠ 루트가 아닌 칸은 **자식 ≥ 2** 가 dockview 의 불변식이다. 판을 걷어 외자식 칸이 남으면, 불러온 직후엔
//   멀쩡하다가 그 안의 마지막 판을 옮기는 순간 머리줄 없는 빈 자리로 남는다(workbench 2026-10-10 실측).
//   그래서 외자식 칸 걷기는 제거 0건이어도 돈다 — 이미 그렇게 망가진 채 저장된 배치를 고치려면.
import type { SerializedDockview } from "dockview-react";

/* eslint-disable @typescript-eslint/no-explicit-any -- dockview JSON 트리를 모양을 알고 손으로 고친다 */
export function sanitizeLayout(json: SerializedDockview, validComponents: ReadonlySet<string>): { json: SerializedDockview; removed: string[] } {
    const j = structuredClone(json) as Record<string, any>;
    const panels: Record<string, any> = j?.panels ?? {};
    const removed: string[] = [];
    for (const [id, st] of Object.entries(panels)) {
        const comp = st?.contentComponent;
        if (typeof comp !== "string" || !validComponents.has(comp)) {
            removed.push(id);
            delete panels[id];
        }
    }
    const gone = new Set(removed);
    const droppedGroups = new Set<string>();
    // 그룹 데이터(views/activeView/id)에서 제거된 패널을 걸러낸다. 빈 그룹이면 false(폐기 신호) + id 기록.
    const keepGroup = (data: any): boolean => {
        if (!data || !Array.isArray(data.views)) return true;
        data.views = data.views.filter((v: string) => !gone.has(v));
        if (data.activeView && gone.has(data.activeView)) data.activeView = data.views[0];
        if (data.views.length === 0) {
            if (typeof data.id === "string") droppedGroups.add(data.id);
            return false;
        }
        return true;
    };
    // 노드 하나를 부모 줄에 들어갈 노드 목록으로 바꾼다(0개 = 접힘, 여럿 = 부모 줄에 펼침).
    let reshaped = false;
    const pruneNode = (node: any, isRoot: boolean): any[] => {
        if (!node) return [];
        if (node.type === "leaf") {
            if (keepGroup(node.data)) return [node];
            reshaped = true;
            return [];
        }
        if (node.type !== "branch" || !Array.isArray(node.data)) return [node];
        node.data = node.data.flatMap((c: any) => pruneNode(c, false));
        if (isRoot || node.data.length > 1) return [node];
        reshaped = true;
        if (node.data.length === 0) return [];
        const only = node.data[0];
        // 외자식이 그룹이면 그 그룹이 이 칸 자리(크기)를 물려받는다.
        if (only.type !== "branch") return [{ ...only, size: node.size ?? only.size }];
        // 외자식이 칸이면 그 자식들은 부모와 같은 방향이다 — 부모 줄에 펼치고, 크기는 이 칸 몫을 비례 배분.
        const sum = only.data.reduce((a: number, c: any) => a + (c.size ?? 0), 0);
        return only.data.map((c: any) => ({ ...c, size: sum > 0 && node.size != null ? ((c.size ?? 0) * node.size) / sum : c.size }));
    };
    if (j.grid?.root) j.grid.root = pruneNode(j.grid.root, true)[0] ?? { type: "branch", data: [], size: j.grid.root.size };
    const pruneGroupList = (list: any): any => {
        if (!Array.isArray(list)) return list;
        const kept = list.filter((g: any) => keepGroup(g?.data));
        if (kept.length !== list.length) reshaped = true;
        return kept;
    };
    j.floatingGroups = pruneGroupList(j.floatingGroups);
    j.popoutGroups = pruneGroupList(j.popoutGroups);
    if (removed.length === 0 && !reshaped) return { json, removed };
    if (typeof j.activeGroup === "string" && droppedGroups.has(j.activeGroup)) delete j.activeGroup;
    // 최대화 위치는 자식 인덱스 경로라 트리를 고치면 어긋난다(fromJSON 이 "Invalid location" 으로 통째 실패) — 버린다.
    if (j.grid) delete j.grid.maximizedNode;
    return { json: j as SerializedDockview, removed };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
