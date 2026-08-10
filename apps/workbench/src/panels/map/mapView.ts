// 유사도 맵 패널의 순수 계산 — 미배치 트레이·뭉치기(LOD)·낙관 이동. 그리기와 제스처는 React Flow 가 진다.
//
// 좌표 변환·확대·이동은 여기 없다: React Flow 가 무한 평면과 등방 변환을 맡는다(맵은 **거리 자체가 뜻**이라
// 축별 확대가 있으면 안 되는데, RF 의 기본이 정확히 등방이다).
import type { CandidateDay, MapItemRef, MapPlacement } from "../../api/map.js";

/** 항목 키 — day 자리는 시각이 없다. 트레이의 뺄셈과 형제 자리 찾기가 이 키로 돈다. */
export const itemKey = (item: MapItemRef): string => `${item.stockCode}|${item.date}${item.time ? `|${item.time}` : ""}`;

/** 후보 하루의 키(= day 자리의 항목 키와 같은 모양이라 그대로 뺄 수 있다). */
export const dayKey = (d: { stockCode: string; date: string }): string => `${d.stockCode}|${d.date}`;

/**
 * 미배치 트레이 = **후보 하루 − 이 맵에 자리가 있는 하루**.
 * 자리가 여럿이어도(징검다리) 하루는 한 번만 빠진다 — 트레이의 질문은 "올렸나"지 "몇 번 올렸나"가 아니다.
 * ⚠ day 맵 전용. point 맵의 트레이는 타점 목록이라 재료가 다르다(다음 슬라이스).
 */
export function unplacedDays(candidates: readonly CandidateDay[], placements: readonly MapPlacement[]): CandidateDay[] {
    const placed = new Set(placements.map((p) => dayKey(p.item)));
    return candidates.filter((c) => !placed.has(dayKey(c)));
}

/** 옮긴 뒤 좌표 — 낙관 갱신(캐시 덮어쓰기)과 서버 요청이 같은 값을 쓰도록. */
export function movedPlacements(
    placements: readonly MapPlacement[],
    moves: readonly { id: string; x: number; y: number }[],
): MapPlacement[] {
    const by = new Map(moves.map((m) => [m.id, m]));
    return placements.map((p) => {
        const m = by.get(p.id);
        return m ? { ...p, x: m.x, y: m.y } : p;
    });
}

// ── 뭉치기(LOD) ─────────────────────────────────────────────────────────────
// 자리를 결국 수천 개 놓을 것이므로 축소 조망이 병목이 된다. `onlyRenderVisibleElements` 는 확대 쪽만
// 답한다 — 축소하면 **전부가 "보이는" 요소**라 하나도 안 걸러진다. 그래서 축소 쪽은 뭉쳐서 답한다.
//
// **칸을 화면 픽셀로 잡는 게 핵심이다**(맵 좌표가 아니라). 규칙이 "화면에서 겹칠 것들은 합친다"가 되고,
// 덤으로 **뭉친 표식 수의 상한이 코퍼스가 아니라 화면 넓이로 정해진다** — 1400×800 에 60px 칸이면
// 자리가 5천이든 5만이든 표식은 300개를 못 넘는다. 따로 상한을 둘 필요가 없다.
//
// 격자는 맵 공간에 고정이므로 **이동(pan)은 뭉침을 바꾸지 않는다** — 배율이 바뀔 때만 다시 계산하면 된다.

/** 화면에서 이만큼 안쪽이면 겹친 것으로 본다(라벨 하나 크기 어림). */
export const CELL_PX = 72;

/** 뭉친 표식 하나 — 위치는 멤버들의 무게중심(칸 중심이 아니라, 실제로 있는 자리에 서게). */
export interface MapBin {
    key: string;
    x: number;
    y: number;
    members: MapPlacement[];
}

/** 이 배율에서 그릴 것 — 혼자 남은 자리는 낱개로, 겹치는 것들만 뭉친다. */
export interface MapLod {
    items: MapPlacement[];
    bins: MapBin[];
}

/**
 * 배율에 따라 자리를 낱개/뭉침으로 가른다.
 * `zoom` 은 React Flow 의 배율(화면px / 맵단위). 칸 크기(맵 단위) = CELL_PX / zoom.
 * 멤버가 하나뿐인 칸은 뭉칠 이유가 없으므로 낱개로 돌린다 — 확대하다 보면 저절로 낱개가 된다.
 */
export function lodOf(placements: readonly MapPlacement[], zoom: number, cellPx = CELL_PX): MapLod {
    const cell = cellPx / Math.max(zoom, 1e-6);
    const cells = new Map<string, MapPlacement[]>();
    for (const p of placements) {
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
        const hit = cells.get(key);
        if (hit) hit.push(p);
        else cells.set(key, [p]);
    }
    const items: MapPlacement[] = [];
    const bins: MapBin[] = [];
    for (const [key, members] of cells) {
        if (members.length === 1) {
            items.push(members[0]!);
            continue;
        }
        let sx = 0;
        let sy = 0;
        for (const m of members) {
            sx += m.x;
            sy += m.y;
        }
        bins.push({ key, x: sx / members.length, y: sy / members.length, members });
    }
    return { items, bins };
}

/**
 * 배율을 계단으로 깎는다 — 뭉침은 배율에만 의존하므로, 이 값이 그대로일 때는 다시 계산할 게 없다.
 * 로그 스케일 1/4 칸 ≈ 19% 변화마다 한 번. 매 프레임 수천 개를 다시 담지 않으려는 것.
 */
export const quantizeZoom = (zoom: number): number => Math.round(Math.log2(Math.max(zoom, 1e-6)) * 4) / 4;

// ── 트레이 묶기 ─────────────────────────────────────────────────────────────
// 미배치가 수천 건(실측 4806)이라 평면 목록으로는 못 찾는다. 자연스러운 계층은 **날짜 → 종목**이다
// (하루에 여러 종목을 그었으므로). 그래서 월로 좁히고 날짜로 묶어 준다.

/** 한 날짜의 미배치들. */
export interface TrayDateGroup {
    date: string;
    days: CandidateDay[];
}

/** YYYY-MM 목록(내림차순) — 월 선택기의 재료. */
export function monthsOf(days: readonly CandidateDay[]): string[] {
    return [...new Set(days.map((d) => d.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
}

/** 날짜별로 묶는다(날짜 내림차순, 날짜 안에서는 종목코드 오름차순 — 서버 정렬과 무관하게 화면이 고정). */
export function groupByDate(days: readonly CandidateDay[]): TrayDateGroup[] {
    const by = new Map<string, CandidateDay[]>();
    for (const d of days) {
        const hit = by.get(d.date);
        if (hit) hit.push(d);
        else by.set(d.date, [d]);
    }
    return [...by.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, list]) => ({ date, days: [...list].sort((a, b) => a.stockCode.localeCompare(b.stockCode)) }));
}
