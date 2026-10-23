// 아카이브 coverage — "이 KST 하루가 DB 에 통째로 있나"의 판정. api 가 날짜별로 DB/라이브를 가르는 유일한 자.
// from = 방별 min(posted_at) 중 가장 늦은 것(모든 방이 그 이후를 든다) · to = 방별 synced_at 중 가장 이른 것
// (sync 는 완주 시에만 synced_at 을 찍고 그 시각까지의 신규를 다 받았다). 어느 방이든 아직 sync 를 완주한 적이
// 없으면 coverage 는 null(전부 라이브). 등록 방 수보다 적게 동기화됐어도(방이 새로 추가됨) 라이브.
export interface ArchiveCoverage {
    from: Date;
    to: Date;
    /** sync 를 완주한 방 수. */
    channels: number;
    /**
     * 방별 가장 오래된 메시지 시각 — from 은 이 중 최대. 백필 깊이가 방마다 달라(일부 방만 더 내림) from 앞에도
     * "이 방들은 빠짐없다"를 말할 재료. 하루 판정(isDayCovered)은 쓰지 않는다 — 라이브 분기는 전 방 기준 그대로.
     */
    perChannel: { peer: string; from: Date }[];
}

/** KST 하루 [00:00:00, 23:59:59] 절대시각. */
export function kstDayBounds(day: string): { since: Date; until: Date } {
    return { since: new Date(`${day}T00:00:00+09:00`), until: new Date(`${day}T23:59:59+09:00`) };
}

/** 그 하루가 coverage 안에 통째로 드는가. 경계에 걸치면(어제 20:30 이후가 빠진 오늘 등) 거짓 → 라이브. */
export function isDayCovered(day: string, coverage: ArchiveCoverage | null, expectedChannels: number): boolean {
    if (!coverage || coverage.channels < expectedChannels) return false;
    const { since, until } = kstDayBounds(day);
    return coverage.from.getTime() <= since.getTime() && until.getTime() <= coverage.to.getTime();
}
