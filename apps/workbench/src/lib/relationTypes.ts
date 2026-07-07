// 가설 관계 종류 — 클라 config(옛 hypothesis-lab relationType 시드 단순화). value=DB 저장키.
// 방향성(better_than·parent_of)은 화살표 + dagre 상하 랭킹 대상. 비방향(similar_to·conflicts_with)은 선만.
// 필요 시 나중에 설정 UI + localStorage 로 확장(reviewTypePresets 선례).
export interface RelationTypeDef {
    value: string;
    label: string;
    color: string;
    dash?: string; // strokeDasharray (없으면 실선)
    directional: boolean;
}

export const RELATION_TYPES: RelationTypeDef[] = [
    { value: "better_than", label: "더 좋음", color: "#5b6cff", directional: true },
    { value: "parent_of", label: "상위", color: "#c1559b", dash: "6 4", directional: true },
    { value: "similar_to", label: "유사", color: "#9aa0ad", dash: "2 5", directional: false },
    { value: "conflicts_with", label: "상충", color: "#d9534f", dash: "2 5", directional: false },
];

export const DIRECTIONAL: Set<string> = new Set(RELATION_TYPES.filter((r) => r.directional).map((r) => r.value));

export function relationDef(value: string): RelationTypeDef | undefined {
    return RELATION_TYPES.find((r) => r.value === value);
}
