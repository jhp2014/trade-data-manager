import { describe, it, expect } from "vitest";
import type { ChannelInfo, ChannelMessage } from "#domain";
import type {
    ChannelBounds,
    ChannelCursor,
    ChannelHistoryPage,
    ChannelHistorySource,
    ChannelMessageStore,
} from "#port/collect";
import { ChannelArchiveCollectService } from "../channelArchiveCollectService.js";

const NOW = new Date("2026-10-14T12:00:00Z");
const H = 3600_000;

/** 메시지 id → 시각: id 하나당 1시간 전(100 = NOW, 99 = NOW−1h …). 시간 조건을 id 로 추론하기 쉽게. */
function at(id: number): Date {
    return new Date(NOW.getTime() - (100 - id) * H);
}
function msg(id: number): ChannelMessage {
    return { channelId: 1, msgId: id, postedAt: at(id), text: `m${id}`, entities: [], mediaKind: "none", raw: {} };
}

/**
 * 가짜 방: ids(내림차순 정렬된 존재 id 집합)와 서비스 메시지 집합. page(offsetId) = offsetId 미만 상위 limit 개.
 * failAtPage 를 주면 그 번째 호출에서 던진다(중단 시뮬).
 */
function fakeSource(opts: { ids: number[]; service?: number[]; limit?: number; failAtPage?: number }) {
    const ids = [...opts.ids].sort((a, b) => b - a);
    const service = new Set(opts.service ?? []);
    const limit = opts.limit ?? 3;
    let calls = 0;
    const source: ChannelHistorySource = {
        async resolve(peer) {
            return { channelId: 1, peer, title: "방" };
        },
        async page(_ch: ChannelInfo, q): Promise<ChannelHistoryPage> {
            calls++;
            if (opts.failAtPage !== undefined && calls === opts.failAtPage) throw new Error("boom");
            const below = q.offsetId === undefined ? ids : ids.filter((i) => i < q.offsetId!);
            const pageIds = below.slice(0, limit);
            return { pageIds, messages: pageIds.filter((i) => !service.has(i)).map(msg) };
        },
    };
    return { source, calls: () => calls };
}

function fakeStore(init?: { rows?: number[]; cursor?: ChannelCursor }) {
    const rows = new Map<number, ChannelMessage>((init?.rows ?? []).map((i) => [i, msg(i)]));
    let cursor: ChannelCursor = init?.cursor ?? { syncedMaxId: null, syncedAt: null };
    const marks: Array<{ maxId: number; at: Date }> = [];
    const store: ChannelMessageStore = {
        async upsertChannel() {},
        async saveMessages(ms) {
            for (const m of ms) rows.set(m.msgId, m);
        },
        async bounds(): Promise<ChannelBounds | null> {
            if (rows.size === 0) return null;
            const ids = [...rows.keys()];
            const minId = Math.min(...ids);
            return { minId, maxId: Math.max(...ids), minPostedAt: at(minId) };
        },
        async cursor() {
            return cursor;
        },
        async markSynced(_c, maxId, atTime) {
            cursor = { syncedMaxId: maxId, syncedAt: atTime };
            marks.push({ maxId, at: atTime });
        },
    };
    return { store, rows, marks, cursor: () => cursor };
}

function service(src: ChannelHistorySource, st: ChannelMessageStore, extra?: Partial<ConstructorParameters<typeof ChannelArchiveCollectService>[0]>) {
    return new ChannelArchiveCollectService({
        source: src,
        store: st,
        channels: [{ peer: "@x", label: "방" }],
        pageIntervalMs: 0,
        now: () => NOW,
        rescanWindowMs: 10 * H,
        onError: () => {},
        ...extra,
    });
}

describe("ChannelArchiveCollectService.sync", () => {
    it("첫 실행(커서·행 없음): 최신부터 재훑기 창 밑까지만 받고 커서를 최신 id 로 찍는다", async () => {
        const { source } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 90, 89, 85, 80] });
        const st = fakeStore();
        const r = await service(source, st.store).sync();
        // floor = NOW−10h = at(90). 90 은 floor 와 같아 < 아님 → 89 까지 받고 멈춘다.
        expect(r.channels[0]).toMatchObject({ completed: true });
        expect([...st.rows.keys()].sort((a, b) => b - a)).toEqual([100, 99, 98, 97, 96, 95, 90, 89, 85]);
        expect(st.cursor()).toEqual({ syncedMaxId: 100, syncedAt: NOW });
    });

    it("커서가 있으면 커서 이하 ∧ 창 밖에서 멈춘다(신규 + 48h 재훑기 한 패스)", async () => {
        const { source, calls } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 80, 70] });
        const st = fakeStore({ rows: [97, 96, 95], cursor: { syncedMaxId: 97, syncedAt: at(97) } });
        const r = await service(source, st.store).sync();
        expect(r.channels[0].completed).toBe(true);
        // 97 이하로 내려간 뒤에도 floor(at 90) 를 지날 때까지 계속 → 89 에서 정지. 80·70 은 안 받는다.
        expect(st.rows.has(89)).toBe(true);
        expect(st.rows.has(80)).toBe(false);
        expect(calls()).toBe(4); // [100..98][97..95][94..92][91..89]
        expect(st.cursor().syncedMaxId).toBe(100);
    });

    it("중간에 끊기면 커서가 안 움직이고, 재실행이 같은 구간을 다시 걷는다(구멍 없음)", async () => {
        const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89];
        const first = fakeSource({ ids, failAtPage: 2 });
        const st = fakeStore({ cursor: { syncedMaxId: 94, syncedAt: at(94) } });
        const r1 = await service(first.source, st.store).sync();
        expect(r1.channels[0]).toMatchObject({ completed: false, error: "boom" });
        expect(st.cursor().syncedMaxId).toBe(94); // 부분 저장(100~98)됐지만 커서 불변
        expect(st.rows.has(97)).toBe(false);

        const second = fakeSource({ ids });
        const r2 = await service(second.source, st.store).sync();
        expect(r2.channels[0].completed).toBe(true);
        expect(st.rows.has(97)).toBe(true); // 첫 실행이 못 받은 구간이 채워졌다
        expect(st.cursor().syncedMaxId).toBe(100);
    });

    it("커서는 없지만 행이 있으면(백필 먼저) 저장된 최대 id 를 하한으로 쓴다", async () => {
        const { source } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88] });
        const st = fakeStore({ rows: [95, 94] });
        await service(source, st.store).sync();
        expect(st.rows.has(89)).toBe(true);
        expect(st.cursor().syncedMaxId).toBe(100);
    });

    it("서비스 메시지만 있는 페이지에서도 커서가 전진한다(원 페이지 id 로)", async () => {
        const { source, calls } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 89], service: [97, 96, 95] });
        const st = fakeStore();
        const r = await service(source, st.store).sync();
        expect(r.channels[0].completed).toBe(true);
        expect(calls()).toBe(3); // [100 99 98] [97 96 95 — 저장 0] [89 → floor 밑]
        expect(st.rows.has(89)).toBe(true);
    });

    it("새 글이 0 이면 커서는 옛 값을 유지한다(0 으로 후퇴 금지)", async () => {
        const { source } = fakeSource({ ids: [] });
        const st = fakeStore({ cursor: { syncedMaxId: 50, syncedAt: at(50) } });
        await service(source, st.store).sync();
        expect(st.cursor().syncedMaxId).toBe(50);
        expect(st.marks[0]).toEqual({ maxId: 50, at: NOW }); // synced_at 은 갱신(coverage 근거)
    });

    it("maxPagesPerChannel 에 닿으면 미완주 — 커서 불변", async () => {
        const { source } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 94] });
        const st = fakeStore();
        const r = await service(source, st.store).sync({ maxPagesPerChannel: 1 });
        expect(r.channels[0]).toMatchObject({ pages: 1, saved: 3, completed: false });
        expect(st.cursor().syncedMaxId).toBeNull();
    });

    it("한 방 실패는 격리 — 다음 방은 계속", async () => {
        const good = fakeSource({ ids: [100, 50] });
        let n = 0;
        const source: ChannelHistorySource = {
            async resolve(peer) {
                if (peer === "@bad") throw new Error("CHANNEL_PRIVATE");
                return good.source.resolve(peer);
            },
            page: (c, q) => {
                n++;
                return good.source.page(c, q);
            },
        };
        const st = fakeStore();
        const r = await service(source, st.store, { channels: [{ peer: "@bad", label: "b" }, { peer: "@x", label: "x" }] }).sync();
        expect(r.channels.map((c) => c.completed)).toEqual([false, true]);
        expect(r.channels[0].error).toContain("CHANNEL_PRIVATE");
        expect(n).toBeGreaterThan(0);
    });
});

describe("ChannelArchiveCollectService.backfill", () => {
    const SINCE = at(90); // 경계

    it("행이 없으면 최신부터 since 경계를 넘을 때까지 — 경계 걸친 이전 행도 저장", async () => {
        const { source } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 70] });
        const st = fakeStore();
        const r = await service(source, st.store).backfill(SINCE);
        expect(r.channels[0].completed).toBe(true);
        // [91 90 89] 페이지에서 89 < since → 멈춤. 89 는 since 이전이지만 저장된다(상태 없는 완료 판정 재료).
        expect(st.rows.has(89)).toBe(true);
        expect(st.rows.has(88)).toBe(false);
        expect(st.cursor().syncedMaxId).toBeNull(); // 백필은 일일 커서를 안 건드린다
    });

    it("행이 있으면 min id 아래로 이어 내려간다(중단 후 재개)", async () => {
        const { source, calls } = fakeSource({ ids: [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88] });
        const st = fakeStore({ rows: [100, 99, 98, 97] });
        const r = await service(source, st.store).backfill(SINCE);
        expect(r.channels[0].completed).toBe(true);
        expect(calls()).toBe(3); // [96 95 94] [93 92 91] [90 89 88]
        expect(st.rows.has(96)).toBe(true);
        expect(st.rows.has(88)).toBe(true);
    });

    it("이미 since 를 넘긴 방은 호출 0 으로 완료", async () => {
        const { source, calls } = fakeSource({ ids: [100, 80] });
        const st = fakeStore({ rows: [100, 80] }); // min posted = at(80) < since
        const r = await service(source, st.store).backfill(SINCE);
        expect(r.channels[0]).toMatchObject({ completed: true, pages: 0 });
        expect(calls()).toBe(0);
    });

    it("방의 시작(빈 페이지)에 닿으면 완료 — 2023 이전에 개설된 방이 아니어도 끝난다", async () => {
        const { source } = fakeSource({ ids: [100, 99, 98] });
        const st = fakeStore();
        const r = await service(source, st.store).backfill(at(50));
        expect(r.channels[0]).toMatchObject({ completed: true, pages: 2, saved: 3 });
    });

    it("중단되면 미완주, 재실행이 min id 에서 잇는다", async () => {
        const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89];
        const st = fakeStore();
        const r1 = await service(fakeSource({ ids, failAtPage: 2 }).source, st.store).backfill(SINCE);
        expect(r1.channels[0].completed).toBe(false);
        expect([...st.rows.keys()].sort()).toEqual([100, 98, 99].sort());
        const second = fakeSource({ ids });
        const r2 = await service(second.source, st.store).backfill(SINCE);
        expect(r2.channels[0].completed).toBe(true);
        expect(second.calls()).toBe(3); // 97 미만부터: [97 96 95][94 93 92][91 90 89]
    });
});
