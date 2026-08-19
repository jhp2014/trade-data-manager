// 집합 참조(SetRef) — 패널이 바인딩하고 연동 슬롯에 오르는 **단 하나의 타입**.
//
// 집합 공장 재편(2026-08-20) 이후의 산지:
//   · 영속 3종 : 유니버스(전체) / 최종 생존(작업 깔때기) / 저장 집합 — 패널 바인딩으로 저장할 수 있다.
//     저장 집합만이 이름 있는 저장물이고, 그룹·필터를 직접 가리키는 영속 참조는 폐지됐다
//     (그룹은 깔때기의 재료지 바인딩 대상이 아니다 — 잠깐 탐색은 연동 모드가 담당한다).
//   · 세션 3종 : 짚은 칸(작업 깔때기) / 그룹 체인(교집합) / 항목 목록(시트 밴드 등) — 짚음 채널·내부
//     리졸빙에만 쓰이고 저장되지 않는다. (집합 난립 방지: 이름을 붙일 때만 저장물이 된다.)
//   · 잔해 1종 : orphan — **파서만 만든다.** 폐지된 옛 바인딩(그룹 직접·칸 직접)이 저장소에 남아 있으면
//     여기로 변환되고, 리졸버가 항상 깨진 참조로 푼다. 조용히 연동으로 폴백하지 않는 이유: 실패가
//     소리 없이 다른 집합을 보여주는 방향이라서다("깨진 참조 = 빈 집합 + 라벨" 규칙).
//
// 전부 **라이브 참조**다 — 저장하는 건 정의(어느 집합·어느 칸)지 결과가 아니다. 결과를 얼리면 배치
// 하나만 바뀌어도 이름은 "근접 탈락"인데 내용은 낡은 스냅샷인 물건이 생긴다.
import { funnelKey, type FunnelCell, type FunnelItem } from "@trade-data-manager/market/domain";

export type SetRef =
    | { kind: "universe" }
    | { kind: "survivors" }
    | { kind: "saved"; setId: string }
    | { kind: "orphan"; label: string }
    | { kind: "cell"; stageId: string; cells: FunnelCell[] }
    | { kind: "groupChain"; names: string[] }
    | { kind: "items"; label: string; items: FunnelItem[] };

/** 패널 바인딩으로 저장해도 되는 참조인가 — 세션 3종은 정의가 세션 밖에 없어 저장하면 즉시 깨진 참조다. */
export const isPersistableSetRef = (r: SetRef): boolean =>
    r.kind === "universe" || r.kind === "survivors" || r.kind === "saved";

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
        case "survivors": return "sv";
        case "saved": return `s${JSON.stringify([r.setId])}`;
        case "orphan": return `o${JSON.stringify([r.label])}`;
        case "cell": return `c${JSON.stringify([r.stageId, [...r.cells].sort()])}`;
        case "groupChain": return `gc${JSON.stringify([...r.names].sort())}`;
        case "items": return `it${JSON.stringify([r.label, r.items.map(funnelKey)])}`;
    }
}

/**
 * 영속본 파서 — **영속 3종 + orphan** 만 내놓는다. 옛 형식은 여기서 변환된다:
 *   · `filter(null)`      → 최종 생존 (뜻이 같다 — 무손실)
 *   · `filter("fs…")`     → 저장 집합 (옛 저장 필터가 같은 id 의 집합으로 자동 전환되므로 — 무손실)
 *   · `group` / `cell`    → orphan (직접 바인딩 폐지 — 화면이 "깨진 참조 + 다시 고르기"로 받는다)
 * 참조가 가리키는 대상(저장 집합)이 아직 있는지는 여기서 안 본다 — 그건 리졸버의 일이고,
 * "깨진 참조 = 빈 집합 + 라벨"로 화면이 받는다(자동 폴백 금지).
 */
export function parseSetRef(o: unknown): SetRef | null {
    if (typeof o !== "object" || o === null) return null;
    const r = o as Record<string, unknown>;
    switch (r.kind) {
        case "universe":
            return { kind: "universe" };
        case "survivors":
            return { kind: "survivors" };
        case "saved":
            return typeof r.setId === "string" && r.setId !== "" ? { kind: "saved", setId: r.setId } : null;
        case "orphan":
            return typeof r.label === "string" && r.label !== "" ? { kind: "orphan", label: r.label } : null;
        // ── 옛 형식(집합 공장 이전) — usePersistedState 는 다시 고를 때까지 옛 값을 그대로 두므로,
        //    이 변환은 일회성 이관이 아니라 **읽기 규칙**이다(멱등).
        case "filter":
            if (r.filterId === null) return { kind: "survivors" };
            return typeof r.filterId === "string" ? { kind: "saved", setId: r.filterId } : null;
        case "group":
            return typeof r.name === "string" && r.name !== "" ? { kind: "orphan", label: `그룹 ${r.name}` } : null;
        case "cell": {
            if (typeof r.stageId === "string" && Array.isArray(r.cells) && r.cells.length > 0 && r.cells.every(isCell)) {
                return { kind: "orphan", label: "옛 칸 바인딩" };
            }
            return null;
        }
        default:
            return null;
    }
}
