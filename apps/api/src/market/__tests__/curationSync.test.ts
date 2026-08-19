import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 부팅 게이트 — 미러 pull 이 남은 유일한 Supabase egress 원천이라, "언제 당기는가"가 곧 청구서다.
 * persistence 를 통째로 흉내 내 회선 없이 판정만 본다(`syncCurationMirror` 가 불렸는가).
 */
const readLastMirrorSyncAt = vi.fn<() => Promise<Date | null>>();
const syncCurationMirror = vi.fn(() => Promise.resolve({ syncedAt: new Date(), rows: 3, skipped: false }));

vi.mock("@trade-data-manager/persistence", () => ({
    readLastMirrorSyncAt: () => readLastMirrorSyncAt(),
    syncCurationMirror: () => syncCurationMirror(),
    getPgBinDir: () => "",
}));

const { CurationSync } = await import("../curation/curationSync.js");

// 상태 읽기용 풀 대역 — readLastMirrorSyncAt 이 통째로 mock 이라 실제로 query 되진 않는다.
const pool = { query: () => Promise.resolve({ rows: [] }) };

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number): Date => new Date(Date.now() - ms);

describe("CurationSync.runIfStale — 부팅 24시간 게이트", () => {
    beforeEach(() => {
        readLastMirrorSyncAt.mockReset();
        syncCurationMirror.mockClear();
        vi.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("하루 안쪽이면 안 당긴다 — 재시작 스무 번이 스무 번의 덤프가 되지 않는다", async () => {
        readLastMirrorSyncAt.mockResolvedValue(ago(3 * 60 * 60 * 1000));
        expect(await new CurationSync(pool).runIfStale()).toBeNull();
        expect(syncCurationMirror).not.toHaveBeenCalled();
    });

    it("하루 넘으면 당긴다", async () => {
        readLastMirrorSyncAt.mockResolvedValue(ago(DAY + 60_000));
        const r = await new CurationSync(pool).runIfStale();
        expect(r?.rows).toBe(3);
        expect(syncCurationMirror).toHaveBeenCalledTimes(1);
    });

    it("한 번도 안 돌았으면(새 머신) 무조건 당긴다 — 빈 미러로는 읽기가 성립하지 않는다", async () => {
        readLastMirrorSyncAt.mockResolvedValue(null);
        expect(await new CurationSync(pool).runIfStale()).not.toBeNull();
        expect(syncCurationMirror).toHaveBeenCalledTimes(1);
    });

    it("버튼(run)은 게이트를 안 탄다 — 방금 당겼어도 '지금 보고 싶다'가 이긴다", async () => {
        readLastMirrorSyncAt.mockResolvedValue(new Date());
        await new CurationSync(pool).run();
        expect(syncCurationMirror).toHaveBeenCalledTimes(1);
        expect(readLastMirrorSyncAt).not.toHaveBeenCalled();
    });
});
