// 그룹 ↔ DB 행 매퍼. bigint id 는 무손실 string 계약(도메인)↔bigint(DB) 변환(rank axis 선례).
// 멤버십(GroupMembership)은 정션 행들을 항목키로 접은 결과라 리포지토리에서 직접 조립한다(단일 행 아님).
import type { Group, GroupScope } from "@trade-data-manager/market";
import type { GroupRow } from "../schema/curation.js";

export function rowToGroup(r: GroupRow): Group {
    return {
        id: String(r.id),
        name: r.name,
        scope: r.scope as GroupScope,
        parentId: r.parentId === null ? null : String(r.parentId),
        mapId: r.mapId === null ? null : String(r.mapId),
        x: r.x,
        y: r.y,
    };
}
