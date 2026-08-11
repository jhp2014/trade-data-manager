// 그룹 ↔ DB 행 매퍼. bigint id 는 무손실 string 계약(도메인)↔bigint(DB) 변환(rank axis 선례).
// GroupAttachment 는 정션 행들을 타점키로 접은 결과라 리포지토리에서 직접 조립(단일 테이블 행 아님).
import type { Group } from "@trade-data-manager/market";
import type { GroupRow } from "../schema/curation.js";

export function rowToGroup(r: GroupRow): Group {
    return { id: String(r.id), name: r.name };
}
