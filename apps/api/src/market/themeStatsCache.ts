// 테마보드용 EOD 파생(bucketCounts·trailingHighs) in-memory 캐시 — 저수준 get/set + 거래일 LRU(최근 MAX_DAYS 일).
// build 조율(공유 fetch·in-flight dedup)은 DerivedStore. 파일 캐시와 달리 **프로세스 수명 내에서만** 산다 →
// 카운팅정책/trailing 로직을 바꿔도 재시작(재배포)하면 자동으로 최신. 버전/무효화 관리 불필요(변경 잦은 값이라 정답).
// 값이 작아(하루 ~0.5MB, 유니버스 ~350종목) 90일도 ~수십 MB.
import type { DayTheme } from "./dayReplay.js";

/** 거래일 LRU 상한. 테마 파생은 하루 ~0.5MB라 넉넉히 잡아도 무해(브라우징 워킹셋을 통째로 덮음). */
const MAX_DAYS = 90;

// Map 삽입순 = LRU 순서. get hit 시 delete→set 으로 최신으로 옮기고, set 이 넘치면 가장 오래된(첫) 키를 버린다.
const cache = new Map<string, DayTheme>();

/** 메모리 캐시에서 테마 파생 번들을 읽는다(hit 시 LRU 최신화). 없으면 null. */
export function getTheme(date: string): DayTheme | null {
    const hit = cache.get(date);
    if (!hit) return null;
    cache.delete(date);
    cache.set(date, hit); // LRU touch(최신으로)
    return hit;
}

/** 테마 파생 번들을 담는다(넘치면 가장 오래된 거래일부터 evict). */
export function setTheme(date: string, data: DayTheme): void {
    cache.set(date, data);
    while (cache.size > MAX_DAYS) {
        const oldest = cache.keys().next().value; // 가장 오래 안 쓴 키
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}
