// RankSections 대사 로직 — fake store/points/derived 주입(derivedCache.test 의 fake 스타일).
// 순위 계산 자체(rankSectionOf)는 core 테스트가 지킨다 — 여기는 **언제 굽고, 언제 안 읽고, 언제 지우나**만.
import { describe, it, expect } from "vitest";
import { kstToUnix, type MinuteDerived, type ReviewPoint } from "@trade-data-manager/market";
import { RankSections, RANK_SECTION_CALC_VERSION } from "../rankSections.js";
import { RANK_SECTION_FILE_VERSION, type RankSectionFile, type RankSectionStore } from "../rankSectionStore.js";
import { SNAPSHOT_SCHEMA_VERSION, type DaySnapshotFile } from "../daySnapshotCache.js";

const D1 = "2026-08-14";
const D2 = "2026-08-20";
const TODAY = "2026-08-28";

const mdOf = (date: string, code: string, bars: [string, number, number][]): MinuteDerived => ({
    code,
    times: bars.map(([t]) => kstToUnix(date, t)),
    rate: bars.map(([, r]) => r),
    cumAmount: bars.map(([, , a]) => a),
    high: bars.map(([, r]) => r),
    low: bars.map(([, r]) => r),
    open: 0,
    minuteOpen: bars.map(([, r]) => r),
    minuteHigh: bars.map(([, r]) => r),
    minuteLow: bars.map(([, r]) => r),
    trailingHighs: { krx: [], un: [] },
    basePrice: { krx: null, un: null },
    baseFactor: { krx: 1, un: 1 },
});

const snapOf = (date: string, codes: string[]): DaySnapshotFile => ({
    v: SNAPSHOT_SCHEMA_VERSION,
    date,
    stocks: codes.map((code, i) => ({
        code,
        marketCap: null,
        stats: { krx: null, un: null },
        minutes: mdOf(date, code, [["09:00:00", i + 1, (i + 1) * 100], ["09:30:00", (i + 1) * 2, (i + 1) * 200]]),
    })),
});

class FakeDerived {
    snapshotCalls: string[] = [];
    readonly sealedDates = new Set<string>();
    constructor(private readonly files: Record<string, DaySnapshotFile>) {}
    async snapshot(date: string): Promise<DaySnapshotFile> {
        this.snapshotCalls.push(date);
        return this.files[date] ?? { v: SNAPSHOT_SCHEMA_VERSION, date, stocks: [] };
    }
    async isSealed(date: string): Promise<boolean> {
        return this.sealedDates.has(date);
    }
}

class FakeSectionStore implements RankSectionStore {
    readonly map = new Map<string, RankSectionFile>();
    writes = 0;
    removed: string[] = [];
    failWrite = false;
    async read(date: string): Promise<RankSectionFile | null> {
        return this.map.get(date) ?? null;
    }
    async write(file: RankSectionFile): Promise<void> {
        if (this.failWrite) throw new Error("disk full");
        this.writes++;
        this.map.set(file.date, file);
    }
    async remove(date: string): Promise<void> {
        this.map.delete(date);
        this.removed.push(date);
    }
    async listDates(): Promise<string[]> {
        return [...this.map.keys()];
    }
}

const pt = (date: string, time: string): ReviewPoint => ({ stockCode: "A", date, time });

function make(points: ReviewPoint[], opts?: { sealed?: string[]; files?: Record<string, DaySnapshotFile>; gate?: () => Promise<void> }) {
    const derived = new FakeDerived(opts?.files ?? { [D1]: snapOf(D1, ["A", "B"]), [D2]: snapOf(D2, ["A", "B", "C"]) });
    for (const d of opts?.sealed ?? [D1, D2]) derived.sealedDates.add(d);
    const store = new FakeSectionStore();
    const list = points;
    let nowMs = 0;
    const sections = new RankSections({
        derived,
        points: {
            listAllPoints: async () => {
                await opts?.gate?.();
                return [...list];
            },
        },
        store,
        today: () => TODAY,
        now: () => nowMs,
    });
    return { sections, derived, store, points: list, setNow: (ms: number) => (nowMs = ms) };
}

describe("RankSections 대사", () => {
    it("① cold — 굽고 파일을 1회 쓴다(sealed)", async () => {
        const { sections, store } = make([pt(D1, "09:30:00")]);
        const b = await sections.bundle();
        expect(b.dates).toHaveLength(1);
        expect(b.dates[0]).toMatchObject({ date: D1, sealed: true, codes: ["A", "B"] });
        expect(b.dates[0].sections[0]).toMatchObject({ time: "09:30", n: 2 });
        expect(store.writes).toBe(1);
    });

    it("② 같은 날 타점 여럿(같은 분 포함) = 스냅샷 read 1회 — 날짜 단위 캐시의 존재 이유", async () => {
        const { sections, derived } = make([pt(D1, "09:00:00"), pt(D1, "09:00:30"), pt(D1, "09:30:00")]);
        const b = await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D1]);
        expect(b.dates[0].sections.map((s) => s.time)).toEqual(["09:00", "09:30"]); // 같은 분 = 단면 공유
    });

    it("③ 타점 추가 — 그 날짜만 다시 굽는다(다른 날짜 스냅샷 호출 0)", async () => {
        const { sections, derived, points } = make([pt(D1, "09:30:00")]);
        await sections.bundle();
        derived.snapshotCalls.length = 0;
        points.push(pt(D2, "09:00:00"));
        sections.invalidate();
        const b = await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D2]); // D1 은 메모 히트
        expect(b.dates.map((d) => d.date)).toEqual([D1, D2]);
    });

    it("④ 타점 삭제만 — 스냅샷 호출 0 으로 단면이 응답에서 빠진다", async () => {
        const { sections, derived, points } = make([pt(D1, "09:00:00"), pt(D1, "09:30:00")]);
        await sections.bundle();
        derived.snapshotCalls.length = 0;
        points.splice(1, 1); // 09:30 삭제
        sections.invalidate();
        const b = await sections.bundle();
        expect(derived.snapshotCalls).toEqual([]);
        expect(b.dates[0].sections.map((s) => s.time)).toEqual(["09:00"]);
    });

    it("⑤ 미완료 날짜(isSealed=false) — 응답에는 있고(sealed:false) 파일·영구 메모에는 없다", async () => {
        const { sections, store, derived, setNow } = make([pt(D1, "09:30:00")], { sealed: [] });
        setNow(0);
        const b = await sections.bundle();
        expect(b.dates[0].sealed).toBe(false);
        expect(store.writes).toBe(0);
        // 영구 메모가 아니라 TTL 메모다 — 창이 지나면 다시 굽는다(수집이 채워지면 자가치유).
        setNow(10 * 60_000);
        derived.snapshotCalls.length = 0;
        sections.invalidate();
        await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D1]);
    });

    it("⑥ 오늘·미래 날짜 타점 — pending 으로 알리고 굽지 않는다", async () => {
        const { sections, derived } = make([pt(TODAY, "09:30:00"), pt("2026-09-01", "10:00:00"), pt(D1, "09:30:00")]);
        const b = await sections.bundle();
        expect(b.pending).toEqual([TODAY, "2026-09-01"]);
        expect(derived.snapshotCalls).toEqual([D1]);
        expect(b.dates.map((d) => d.date)).toEqual([D1]);
    });

    it("⑦ 참조 없는 날짜 파일은 GC", async () => {
        const { sections, store, points } = make([pt(D1, "09:30:00"), pt(D2, "09:00:00")]);
        await sections.bundle();
        expect(store.map.has(D2)).toBe(true);
        points.splice(1, 1); // D2 타점 전부 삭제
        sections.invalidate();
        await sections.bundle();
        expect(store.map.has(D2)).toBe(false);
        expect(store.removed).toEqual([D2]);
    });

    it("⑧ 기대집합이 비면 GC 를 통째로 건너뛴다 — 미러 초기화 순간의 전멸 방지", async () => {
        const { sections, store, points } = make([pt(D1, "09:30:00")]);
        await sections.bundle();
        expect(store.map.has(D1)).toBe(true);
        points.length = 0;
        sections.invalidate();
        await sections.bundle();
        expect(store.map.has(D1)).toBe(true); // 남아 있다
    });

    it("⑨ 계산 버전 상향 = 파일 통째 무효(재굽기)", async () => {
        const { sections, derived, store } = make([pt(D1, "09:30:00")]);
        store.map.set(D1, {
            v: RANK_SECTION_FILE_VERSION,
            version: RANK_SECTION_CALC_VERSION - 1, // 옛 규칙으로 구운 파일
            date: D1,
            codes: ["A", "B"],
            sections: [{ time: "09:30", n: 1, rate: [1, null], amount: [1, null] }],
        });
        const b = await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D1]); // 파일 무시 → 재굽기
        expect(b.dates[0].sections[0].n).toBe(2);
        expect(store.map.get(D1)?.version).toBe(RANK_SECTION_CALC_VERSION);
    });

    it("⑩ store.write 실패 — 응답은 정상(메모리 결과 서빙)", async () => {
        const { sections, store } = make([pt(D1, "09:30:00")]);
        store.failWrite = true;
        const b = await sections.bundle();
        expect(b.dates[0].sections).toHaveLength(1);
    });

    it("동시 bundle() 은 한 비행을 나눠 탄다 / invalidate() 뒤엔 새 비행", async () => {
        const { sections, derived } = make([pt(D1, "09:30:00")]);
        const [a, b] = await Promise.all([sections.bundle(), sections.bundle()]);
        expect(a).toBe(b); // 같은 Promise 결과
        expect(derived.snapshotCalls).toEqual([D1]);
        sections.invalidate();
        await sections.bundle(); // 메모 히트라 스냅샷은 그대로 — 비행만 새로
        expect(derived.snapshotCalls).toEqual([D1]);
    });

    it("낡은 세대의 비행은 GC 를 건너뛴다 — 새 비행이 방금 구운 파일을 지우지 않는다(경합 가드)", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const { sections, store } = make([pt(D1, "09:30:00")], { gate: () => gate });
        const old = sections.bundle(); // 기대집합에 D2 가 없는 낡은 비행 — listAllPoints 에서 대기 중
        // 그 사이 다른(새) 비행의 산물처럼 D2 파일이 생기고, invalidate 가 세대를 올렸다.
        store.map.set(D2, {
            v: RANK_SECTION_FILE_VERSION,
            version: RANK_SECTION_CALC_VERSION,
            date: D2,
            codes: ["A", "B", "C"],
            sections: [{ time: "09:00", n: 3, rate: [1, 2, 3], amount: [3, 2, 1] }],
        });
        sections.invalidate();
        release();
        await old;
        expect(store.map.has(D2)).toBe(true); // 낡은 비행이 안 지웠다
        expect(store.removed).toEqual([]);
    });

    it("미봉인 날짜는 TTL 메모 — 창 안 재요청은 스냅샷을 안 읽고, 창이 지나면 다시 굽는다(자가치유)", async () => {
        const { sections, derived, setNow } = make([pt(D1, "09:30:00")], { sealed: [] });
        setNow(0);
        expect((await sections.bundle()).dates[0].sealed).toBe(false);
        expect(derived.snapshotCalls).toEqual([D1]);
        setNow(60_000); // TTL(5분) 안
        sections.invalidate();
        await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D1]); // 재빌드 없음
        setNow(6 * 60_000); // TTL 밖
        sections.invalidate();
        await sections.bundle();
        expect(derived.snapshotCalls).toEqual([D1, D1]); // 다시 굽는다
    });

    it("쓰기 실패한 sealed 날짜는 다음 대사가 **메모에서** 재시도한다 — 스냅샷 재빌드 없이", async () => {
        const { sections, derived, store } = make([pt(D1, "09:30:00")]);
        store.failWrite = true;
        await sections.bundle();
        expect(store.map.has(D1)).toBe(false);
        store.failWrite = false;
        derived.snapshotCalls.length = 0;
        sections.invalidate();
        await sections.bundle();
        expect(store.map.has(D1)).toBe(true); // 재시도 성공
        expect(derived.snapshotCalls).toEqual([]); // 데이터는 메모에서
    });

    it("파일 쓰기는 기대집합만 싣는다 — 삭제된 분의 단면이 파일에 단조 누적되지 않는다", async () => {
        const { sections, store } = make([pt(D1, "09:30:00")]);
        // 삭제된 옛 단면(08:00)이 남은 파일 + 새 분(09:30)이 빠진 상태.
        store.map.set(D1, {
            v: RANK_SECTION_FILE_VERSION,
            version: RANK_SECTION_CALC_VERSION,
            date: D1,
            codes: ["A", "B"],
            sections: [{ time: "08:00", n: 2, rate: [1, 2], amount: [2, 1] }],
        });
        await sections.bundle();
        expect(store.map.get(D1)?.sections.map((s) => s.time)).toEqual(["09:30"]); // 08:00 프루닝됨
    });

    it("파일과 스냅샷의 유니버스가 갈리면 그 날짜를 통째 다시 굽는다 — 서수는 코드 테이블 순서를 탄다", async () => {
        const { sections, store } = make([pt(D1, "09:00:00"), pt(D1, "09:30:00")]);
        store.map.set(D1, {
            v: RANK_SECTION_FILE_VERSION,
            version: RANK_SECTION_CALC_VERSION,
            date: D1,
            codes: ["A", "X"], // 스냅샷(["A","B"])과 다른 유니버스
            sections: [{ time: "09:00", n: 2, rate: [2, 1], amount: [2, 1] }],
        });
        const b = await sections.bundle();
        expect(b.dates[0].codes).toEqual(["A", "B"]);
        // 09:00 도 스냅샷 기준으로 다시 계산됐다(옛 파일 서수가 새 코드 테이블에 얹히지 않는다).
        expect(b.dates[0].sections.map((s) => s.time)).toEqual(["09:00", "09:30"]);
        expect(store.map.get(D1)?.codes).toEqual(["A", "B"]);
    });
});
