// 시트 그룹 → **한 줄짜리 평탄 배열**(순수). 가상화가 묻는 질문이 "42~78번 줘"라서, 그룹 머리와
// 데이터 행이 **같은 배열의 이웃한 줄**이어야 그 질문에 답할 수 있다(filter/resultRows 와 같은 수법 —
// 문맥을 바깥 구조가 아니라 줄 안으로 옮겨 넣는다).
//
// 높이는 여기 안 둔다: 뷰(SheetRowView 의 ROW_H·GROUP_H)가 정하고 여기선 `kind` 만 알린다.
// 순서는 groups 순회 그대로 — **정렬 계약을 여기서 다시 건드리지 않는다**(sheetSort 가 이미 끝낸 일).
import { rowKey } from "../../lib/pointKey.js";
import type { SheetRow } from "./rankSheet.js";
import type { SheetGroup } from "./sheetSort.js";

export type SheetFlatRow =
    | { kind: "group"; key: string; label: string; count: number }
    | { kind: "row"; key: string; row: SheetRow };

/**
 * 그룹들 → 평탄 줄. `label == null`(통짜 그룹)이면 머리를 **안 만든다** — 그룹이 안 걸린 정렬에서
 * 빈 머리 줄이 서면 안 된다(표 시절 `groups.flatMap` 규칙 그대로).
 *
 * 키 공간 둘은 접두어로 갈라 둔다(`g-` vs 행 키) — 한 배열에 섞이므로 충돌하면 React 가 조용히 오작동한다.
 */
export function flattenSheetGroups(groups: readonly SheetGroup[]): SheetFlatRow[] {
    const out: SheetFlatRow[] = [];
    for (const g of groups) {
        if (g.label != null) out.push({ kind: "group", key: `g-${g.id}`, label: g.label, count: g.rows.length });
        for (const row of g.rows) out.push({ kind: "row", key: rowKey(row), row });
    }
    return out;
}

/**
 * 그 행이 평탄 배열의 몇 번째 줄인가 — 선택 따라가기(`scrollToIndex`)가 쓴다. 없으면 -1.
 * 배열 훑기로 충분하다: 선택이 바뀔 때만 한 번 돈다(행 수만큼 매 렌더 도는 게 아니다).
 */
export function flatIndexOfRow(flat: readonly SheetFlatRow[], key: string): number {
    return flat.findIndex((f) => f.kind === "row" && f.key === key);
}
