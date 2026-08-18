// 그룹 ↔ DB 행 매퍼.
// **id 는 계약을 못 건넌다** — 부모 참조를 이름으로 바꿔 내보내므로, 행 하나만으로는 변환이 안 된다
// (그래서 이름표를 받는다). 멤버십(GroupMembership)은 정션 행들을 항목키로 접은 결과라
// 리포지토리에서 직접 조립한다(단일 행 아님).
import type { Group, GroupScope } from "@trade-data-manager/market";
import type { GroupRow } from "../schema/curation.js";

/** id → 이름 이름표. 키는 String(bigint) — bigint 를 Map 키로 쓰면 호출부마다 형이 갈린다. */
export type NameTable = ReadonlyMap<string, string>;

export function rowToGroup(r: GroupRow, groupNames: NameTable): Group {
    return {
        name: r.name,
        scope: r.scope as GroupScope,
        // 이름표에 없으면 null — 참조가 깨진 경우인데, 여기서 던지면 목록 전체가 죽는다.
        // 화면에는 "최상위"로 보이고, 그건 실제로 복구 가능한 상태다.
        parentName: r.parentId === null ? null : (groupNames.get(String(r.parentId)) ?? null),
    };
}
