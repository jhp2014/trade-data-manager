// 집합 참조(SetRef) — 패널이 바인딩하고 연동 슬롯에 오르는 **단 하나의 타입**.
//
// 산지 여섯, 성질 둘:
//   · 영속 4종 : 유니버스 / 그룹 / 필터(저장 or 활성 슬롯) / 깔때기 칸 — 패널 바인딩으로 저장할 수 있다.
//   · 세션 2종 : 그룹 체인(교집합) / 항목 목록(시트 밴드 등) — 연동 슬롯에만 올라타고 저장되지 않는다.
//     (집합 난립 방지: 짚기·바인딩은 무명·세션 한정, 이름을 붙일 때만 저장물이 된다.)
//
// 전부 **라이브 참조**다 — 저장하는 건 정의(어느 그룹·어느 필터의 어느 칸)지 결과가 아니다. 결과를
// 얼리면 배치 하나만 바뀌어도 이름은 "근접 탈락"인데 내용은 낡은 스냅샷인 물건이 생긴다.
//
// ⚠ 칸 참조는 단계의 **정체(id)** 로 잡는다(인덱스 아님) — 재배열해도 같은 단계를 가리킨다. 칸의 내용이
// 재배열로 바뀌는 건 버그가 아니라 라이브의 뜻이다(근접 탈락은 "어느 단계 기준이냐"에 따라 다른 집합).
import { funnelKey, type FunnelCell, type FunnelItem } from "@trade-data-manager/market/domain";

/** 필터 지목 — null = 활성 슬롯(이름 없는 작업면), 문자열 = 저장한 깔때기의 id. */
export type FilterRefId = string | null;

export type SetRef =
    | { kind: "universe" }
    | { kind: "group"; name: string }
    | { kind: "filter"; filterId: FilterRefId }
    | { kind: "cell"; filterId: FilterRefId; stageId: string; cells: FunnelCell[] }
    | { kind: "groupChain"; names: string[] }
    | { kind: "items"; label: string; items: FunnelItem[] };

/** 패널 바인딩으로 저장해도 되는 참조인가 — 세션 2종은 정의가 세션 밖에 없어 저장하면 즉시 깨진 참조다. */
export const isPersistableSetRef = (r: SetRef): boolean =>
    r.kind === "universe" || r.kind === "group" || r.kind === "filter" || r.kind === "cell";

const CELLS: readonly FunnelCell[] = ["survive", "nearMiss", "upstreamPending", "fail", "pending"];
const isCell = (v: unknown): v is FunnelCell => typeof v === "string" && (CELLS as readonly string[]).includes(v);

/**
 * 정규화 키 — 같은 집합을 가리키는 참조는 같은 키(리졸버 캐시·React 메모의 기준).
 *
 * ⚠ **키는 캐시 키다** — 충돌하면 낭비가 아니라 **다른 집합을 돌려준다**(캐시 오염). 그룹 이름·라벨은
 * 자유 텍스트라(도메인이 일부러 허용) 구분자 이어붙이기로는 안전할 수 없다 — 실제로 `names.join("&")` 는
 * 그룹 "A&B" 하나짜리 체인과 [A,B] 체인을 같은 키로 만들었다. JSON 배열 인코딩은 모든 문자를
 * 이스케이프하므로 이 구조들에 대해 단사(injective)다.
 *
 * 순서가 집합을 바꾸지 않는 자리(칸 목록·체인 교집합)는 정렬해 싣는다 — 같은 집합은 한 번만 푼다.
 */
export function setRefKey(r: SetRef): string {
    switch (r.kind) {
        case "universe": return "u";
        case "group": return `g${JSON.stringify([r.name])}`;
        case "filter": return `f${JSON.stringify([r.filterId])}`;
        case "cell": return `c${JSON.stringify([r.filterId, r.stageId, [...r.cells].sort()])}`;
        case "groupChain": return `gc${JSON.stringify([...r.names].sort())}`;
        case "items": return `it${JSON.stringify([r.label, r.items.map(funnelKey)])}`;
    }
}

/**
 * 영속본 파서 — **영속 4종만** 받는다. 세션 2종이 들어 있으면(옛 버그·손편집) 깨진 저장이므로 null.
 * 참조가 가리키는 대상(그룹·필터)이 아직 있는지는 여기서 안 본다 — 그건 리졸버의 일이고,
 * "깨진 참조 = 빈 집합 + 라벨"로 화면이 받는다(자동 폴백 금지).
 */
export function parseSetRef(o: unknown): SetRef | null {
    if (typeof o !== "object" || o === null) return null;
    const r = o as Record<string, unknown>;
    switch (r.kind) {
        case "universe":
            return { kind: "universe" };
        case "group":
            return typeof r.name === "string" && r.name !== "" ? { kind: "group", name: r.name } : null;
        case "filter":
            return r.filterId === null || typeof r.filterId === "string"
                ? { kind: "filter", filterId: (r.filterId as FilterRefId) }
                : null;
        case "cell": {
            if (r.filterId !== null && typeof r.filterId !== "string") return null;
            if (typeof r.stageId !== "string" || r.stageId === "") return null;
            if (!Array.isArray(r.cells) || r.cells.length === 0 || !r.cells.every(isCell)) return null;
            return { kind: "cell", filterId: r.filterId as FilterRefId, stageId: r.stageId, cells: r.cells };
        }
        default:
            return null;
    }
}
