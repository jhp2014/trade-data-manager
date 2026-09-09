// 분 단면의 **공용 지연 캐시** — 스크럽 단면(scrubSectionOf)·존 트랙(subjectOrdinalTrack)·꼬리
// (ThemeRankPanel trail)가 같은 분을 서로 모르게 세 번 굽지 않게, 스냅샷(stocks 배열)당 분→단면을
// 한 번만 계산해 나눠 쓴다. 계산 주체는 여전히 core rankSectionOf 하나다(서수 출처 단일화 — 여기는
// 캐시일 뿐 계산이 아니다).
//
// 키가 stocks **배열 참조**인 이유: /day-replay 는 react-query 캐시라 같은 날짜면 같은 배열이 돌아오고,
// 날짜가 바뀌거나 캐시가 밀려나면 참조가 바뀐다 — WeakMap 이 수명을 공짜로 따라간다(지우는 손 없음).
// 전량 선굽기(390분 ≈ 200ms 블로킹)를 안 하는 이유: 꼬리·스크럽은 분 몇 개면 되고, 전 분이 필요한
// 소비자(존 트랙)가 오면 그때 채워진다 — 처음 한 번만 오늘까지의 비용 그대로, 이후는 전부 재사용.
import { rankSectionOf, type RankSection } from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

interface Entry {
    date: string;
    byMinute: Map<number, RankSection>;
}

const cache = new WeakMap<readonly ReplayStock[], Entry>();

/** (스냅샷, 날짜, 자정 기준 분) → 단면. 같은 (스냅샷, 분)은 한 번만 계산된다. */
export function sectionAtMinute(stocks: readonly ReplayStock[], date: string, minute: number): RankSection {
    let entry = cache.get(stocks);
    // 같은 배열에 다른 날짜가 올 일은 없지만(스냅샷은 날짜당 한 벌), 왔다면 낡은 단면을 섞느니 버린다.
    if (!entry || entry.date !== date) {
        entry = { date, byMinute: new Map() };
        cache.set(stocks, entry);
    }
    let section = entry.byMinute.get(minute);
    if (!section) {
        section = rankSectionOf(stocks, date, fmtMin(minute));
        entry.byMinute.set(minute, section);
    }
    return section;
}
