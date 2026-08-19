// 시트 멤버십 캐시 데코레이터 — 시트(sheet)는 date-무관이라 load() 를 프로세스 1회만 호출(시트 호출 dedup).
// ThemeMembershipProvider(outbound 포트)를 구조적으로 만족 → DayBoards 조립에 쓰인다(MEMBERSHIP_CACHE). 시트 편집 시 /theme/refresh 로 refresh().
import type { ThemeMember } from "@trade-data-manager/market";

export class CachedMembership {
    private once: Promise<ThemeMember[]> | null = null;
    // refresh 세대 — 로드 **도중** refresh 가 끼면(배정 직후 등) 그 결과는 옛 시트다. 이번 호출자에게는
    // 주되 캐시로 남기지 않아, 다음 조회가 새로 읽는다.
    private generation = 0;

    constructor(private readonly inner: { load(): Promise<ThemeMember[]> }) {}

    load(): Promise<ThemeMember[]> {
        if (this.once) return this.once;
        const gen = this.generation;
        const p: Promise<ThemeMember[]> = this.inner.load().then(
            (rows) => {
                if (gen !== this.generation && this.once === p) this.once = null; // 로드 중 refresh — 안 굳힘
                return rows;
            },
            (err: unknown) => {
                // 실패는 캐시하지 않는다 — 거부된 Promise 가 영구 캐시되면 이후 모든 요청이 같은 실패를 본다.
                // `this.once === p` 가드: refresh 뒤 새로 시작한 로드를 옛 실패가 지우면 안 된다.
                if (this.once === p) this.once = null;
                throw err;
            },
        );
        this.once = p;
        return p;
    }

    refresh(): void {
        this.generation++;
        this.once = null;
    }
}
