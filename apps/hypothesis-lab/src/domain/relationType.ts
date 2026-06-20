/**
 * 가설 관계 종류(relationType)의 "정의" — App(클라이언트) 소유.
 * DB(hypothesisRelations.relationType)에는 정의의 안정 키(value)만 저장한다.
 * 종류를 추가/삭제/이름변경(label)해도 마이그레이션이 필요 없고,
 * 지운 종류의 기존 간선은 안 깨진다(모르는 value 는 중립 폴백).
 *
 * 런타임 종류 목록은 stores/relationTypes(localStorage 영속)가 보유하며,
 * 아래 DEFAULT_RELATION_TYPES 로 시드된다.
 */

/** 선 스타일 → strokeDasharray. */
export type RelationLineStyle = "solid" | "dashed" | "dotted";

/** React Flow edge type. "bezier" 는 빌트인 "default" 로 매핑. */
export type RelationEdgeType = "bezier" | "straight" | "step" | "smoothstep";

/**
 * 방향성. value 는 DB 의 from→to 로 고정이고, 이 값은 "화살촉을 어디 그릴지"를
 * 종류 단위로 통일한다. none = 무방향(화살표 없음 + 순환검사 제외).
 *   forward  → dest(to) 쪽 화살촉 (markerEnd)
 *   backward → source(from) 쪽 화살촉 (markerStart)
 */
export type RelationDirection = "none" | "forward" | "backward";

/** 화살촉 모양. */
export type RelationArrowHead = "closed" | "open";

/** 색 선택 UI 용 색 이름. edge stroke 에 쓸 실제 hex 는 RELATION_COLOR_HEX. */
export type RelationColor =
    | "blue"
    | "violet"
    | "pink"
    | "red"
    | "amber"
    | "green"
    | "teal"
    | "gray";

export type RelationTypeDef = {
    /** DB(hypothesisRelations.relationType)에 저장되는 안정 키. */
    value: string;
    label: string;
    color: RelationColor;
    lineStyle: RelationLineStyle;
    edgeType: RelationEdgeType;
    direction: RelationDirection;
    /** direction !== "none" 일 때만 의미. */
    arrowHead: RelationArrowHead;
};

/** 색 선택 UI(편집 모달)용 전체 색 목록. */
export const RELATION_COLORS: readonly RelationColor[] = [
    "blue",
    "violet",
    "pink",
    "red",
    "amber",
    "green",
    "teal",
    "gray",
];

/** 색 이름 → edge stroke hex. */
export const RELATION_COLOR_HEX: Record<RelationColor, string> = {
    blue: "#5b6cff",
    violet: "#8b5cf6",
    pink: "#c1559b",
    red: "#d9534f",
    amber: "#d99a00",
    green: "#2faa6e",
    teal: "#14b8a6",
    gray: "#9aa0ad",
};

export const EDGE_TYPE_OPTIONS: readonly RelationEdgeType[] = [
    "bezier",
    "straight",
    "step",
    "smoothstep",
];

export const LINE_STYLE_OPTIONS: readonly RelationLineStyle[] = ["solid", "dashed", "dotted"];

export const DIRECTION_OPTIONS: readonly RelationDirection[] = ["none", "forward", "backward"];

/** 종류 스토어의 초기 시드(더미 단계 — 기존 4종과 동일 value 로 호환). */
export const DEFAULT_RELATION_TYPES: readonly RelationTypeDef[] = [
    {
        value: "better_than",
        label: "더 좋음",
        color: "blue",
        lineStyle: "solid",
        edgeType: "bezier",
        direction: "forward",
        arrowHead: "closed",
    },
    {
        value: "parent_of",
        label: "상위",
        color: "pink",
        lineStyle: "dashed",
        edgeType: "bezier",
        direction: "forward",
        arrowHead: "closed",
    },
    {
        value: "similar_to",
        label: "유사",
        color: "gray",
        lineStyle: "dotted",
        edgeType: "bezier",
        direction: "none",
        arrowHead: "closed",
    },
    {
        value: "conflicts_with",
        label: "상충",
        color: "red",
        lineStyle: "dotted",
        edgeType: "straight",
        direction: "none",
        arrowHead: "closed",
    },
];

/** 정의 목록에서 value 로 찾기. null/모르는 value 면 undefined(중립 폴백은 호출측). */
export function findRelationType(
    defs: readonly RelationTypeDef[],
    value: string | null | undefined,
): RelationTypeDef | undefined {
    return value == null ? undefined : defs.find((d) => d.value === value);
}

/** 방향성(화살표 + 순환검사 대상) 종류의 value 집합. */
export function directionalValues(defs: readonly RelationTypeDef[]): Set<string> {
    return new Set(defs.filter((d) => d.direction !== "none").map((d) => d.value));
}

/**
 * label 로 안정 value 키 생성(varchar(40) 이내, 기존 value 와 충돌 회피).
 * ascii slug 가 가능하면 그것을, 아니면(한글 등) 시간기반 키를 쓴다.
 */
export function makeRelationValue(label: string, existing: readonly string[]): string {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32);
    let base = /^[a-z0-9_]+$/.test(slug) && slug.length > 0 ? slug : `r${Date.now().toString(36)}`;
    base = base.slice(0, 40);
    if (!existing.includes(base)) return base;
    for (let i = 2; i < 1000; i++) {
        const cand = `${base.slice(0, 36)}_${i}`;
        if (!existing.includes(cand)) return cand;
    }
    return `r${Date.now().toString(36)}`;
}

/** strokeDasharray 패턴. dotted 는 strokeLinecap:round 와 함께 쓰면 점선처럼 보인다. */
export function dashArray(lineStyle: RelationLineStyle): string | undefined {
    switch (lineStyle) {
        case "dashed":
            return "6 4";
        case "dotted":
            return "1.5 5";
        default:
            return undefined;
    }
}

/** 간선 시각화 원시값(reactflow enum 비의존 — MarkerType 매핑은 컴포넌트에서). */
export type EdgeVisual = {
    edgeType: RelationEdgeType;
    stroke: string;
    dash?: string;
    /** dotted 일 때 둥근 끝(점선 효과). */
    round: boolean;
    /** 화살촉 위치. null = 무방향. */
    arrowSide: "start" | "end" | null;
    arrowHead: RelationArrowHead;
};

/** 정의 → 간선 시각화. 모르는 정의(undefined)는 중립 회색 무방향. */
export function toEdgeVisual(def: RelationTypeDef | undefined): EdgeVisual {
    if (!def) {
        return {
            edgeType: "bezier",
            stroke: RELATION_COLOR_HEX.gray,
            round: false,
            arrowSide: null,
            arrowHead: "closed",
        };
    }
    return {
        edgeType: def.edgeType,
        stroke: RELATION_COLOR_HEX[def.color],
        dash: dashArray(def.lineStyle),
        round: def.lineStyle === "dotted",
        arrowSide: def.direction === "forward" ? "end" : def.direction === "backward" ? "start" : null,
        arrowHead: def.arrowHead,
    };
}
