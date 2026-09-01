// RankSections — 후보 캔들이 존재하는 (날짜, 분)의 순위 단면을 대사(reconcile)로 유지하는 읽기모델.
//
// ## 대사 모델 — 삭제·추가는 이벤트가 아니라 집합 대조다
// 기대집합 = **격자의 후보 캔들**(신고가 목록)에서 뽑은 날짜→분 집합. 요청마다 저장집합(메모·파일)과
// 대조해 **빠진 단면만 계산하고, 참조 없는 날짜 파일은 GC** 한다(분봉 수집 완료 판정과 같은 모델).
// 같은 분 후보 여럿 = 단면 하나 공유 — 그래서 낟알이 종목이 아니라 (날짜, 분)이다.
//
// 왜 타점이 아니라 후보인가(2026-09-01): 타점이 읽기 층 파생물(정의 노브의 함수)이 되면서 서버는 어느
// 분이 타점인지 모른다. `Point ⊆ 신고가 캔들` 이라 후보 전체를 구우면 **정의를 굴려도 서버 왕복이 0** 이다.
//
// ## 서빙은 접어서 — 저장은 유니버스 전 종목, 와이어는 그 분의 후보 + 동료만
// 접기는 테마 멤버십(시트)을 보지만 **저장물은 안 본다** — 그래서 시트를 고치면 재굽기가 아니라 다시
// 접기로 끝난다(멤버십 지문이 접힌 결과의 메모 키다). 규칙 전문은 wire/rankSection.ts 머리 주석.
//
// ## 비용은 단면 수가 아니라 날짜 수가 정한다 (실측: 스냅샷 read ~110ms vs 단면 계산 ~1ms)
// 그래서 캐시 단위 = 날짜 파일이고, 같은 날 단면 여럿은 스냅샷 1회 로드로 전부 나온다.
// 스냅샷 하나가 힙 ~11MB 라 날짜 병렬은 좁게(BUILD_CONCURRENCY) — 130일 전병렬이면 1.4GB 다.
// 삭제만 있는 날짜는 스냅샷을 아예 안 읽는다(파일/메모에서 걸러 서빙하면 끝).
//
// ## 분모(M)가 틀린 값을 영구화하지 않는다
// 오늘 이후 날짜의 타점 = pending(굽지도 서빙하지도 않음 — 잠정 유니버스 위 서수로 필터를 판정하지 않는다).
// 과거인데 스냅샷이 안 굳은 날짜 = 메모리 서빙 + sealed:false(파일·메모에 안 남김 — 수집이 채워지면 자가치유).
import {
    buildThemeIndex,
    kstToday,
    mapWithConcurrency,
    rankSectionOf,
    type RankSection,
    type ThemeMember,
} from "@trade-data-manager/market";
import type { RankSectionBundle, RankSectionDate, WireRankSection } from "@trade-data-manager/wire";
import type { DerivedCache } from "./derivedCache.js";
import { RANK_SECTION_FILE_VERSION, type RankSectionFile, type RankSectionStore } from "./rankSectionStore.js";

/** 계산 규칙 버전 — 서수 정의(정렬·동점·carry-forward)나 재료(원주가 재작성 수리)가 바뀌면 올린다(전량 재굽기). */
export const RANK_SECTION_CALC_VERSION = 1;

/** 날짜 동시 빌드 상한 — 스냅샷 힙 ~11MB/개. */
const BUILD_CONCURRENCY = 2;

/** 미봉인(sealed:false) 날짜의 메모 수명 — 무기한이면 수집이 채워져도 낡은 걸 서빙하고, 없으면 요청마다
 *  스냅샷 full build(~110ms·11MB)를 문다("영영 안 굳는 날짜"에 타점이 하나면 모든 요청이 그 비용). */
const UNSEALED_TTL_MS = 5 * 60_000;

export interface RankSectionsDeps {
    derived: Pick<DerivedCache, "snapshot" | "isSealed">;
    /** 기대집합 공급자 — 격자의 후보 캔들: 날짜 → 분("HH:MM") → 그 분의 후보 종목들. */
    candidates: { candidateMinutes(): Promise<Map<string, Map<string, Set<string>>>> };
    /** 테마 멤버십(시트 캐시) — **서빙 접기에만** 쓴다(저장물은 테마를 모른다). */
    membership: { load(): Promise<ThemeMember[]> };
    store: RankSectionStore;
    /** 오늘(KST) 공급자 — 테스트 주입용. */
    today?: () => string;
    /** 현재 시각(ms) 공급자 — 미봉인 TTL 판정. 테스트 주입용. */
    now?: () => number;
}

interface DateMemo {
    codes: string[];
    byTime: Map<string, RankSection>;
}

/** 접기 **전** 날짜 하나 — 유니버스 전 종목 서수(파일·메모의 모양). 와이어로 나가기 전에 fold 를 지난다. */
interface FullDate {
    date: string;
    sealed: boolean;
    codes: string[];
    sections: RankSection[];
}

/** 접힌 날짜 하나 + 그때 쓴 **내용 지문** — 지문이 그대로면 다시 안 접는다(접기가 요청마다 돌지 않게). */
interface FoldMemo {
    key: string;
    wire: RankSectionDate;
}

/** 멤버십 지문 — 시트가 그대로면 같은 문자열(행 순서 무관). 접힌 결과의 캐시 키 절반. */
const membershipFingerprint = (rows: readonly ThemeMember[]): string =>
    rows.map((m) => `${m.theme}|${m.code}`).sort().join(";");

/**
 * 접기 메모 키 — **내용으로** 잡는다: 멤버십 지문 + 그 날짜의 (분, 후보 종목) 전부.
 * ⚠ "단면 개수"로 대신하면 조용히 낡은 걸 서빙한다: 이미 있는 분에 **후보 종목이 하나 늘면**
 *   개수가 그대로라 그 종목의 행이 영영 안 실린다(기준선을 새로 그은 차트가 깔때기에서 결손으로 남는다).
 */
const foldKey = (fp: string, byMinute: ReadonlyMap<string, Set<string>>): string => {
    const parts: string[] = [];
    for (const [min, codes] of byMinute) parts.push(`${min}:${[...codes].sort().join(",")}`);
    return `${fp}#${parts.sort().join(";")}`;
};

export class RankSections {
    private inFlight: Promise<RankSectionBundle> | null = null;
    /** invalidate 세대 — 낡은 기대집합으로 시작한 비행이 **새 비행이 방금 구운 파일을 GC 로 지우는** 경합을 막는다. */
    private gen = 0;
    /** sealed 날짜의 완성 단면 메모 — 불변이라 무기한. */
    private readonly memo = new Map<string, DateMemo>();
    /** 미봉인 날짜의 짧은 메모(TTL) — 수집이 채워지면 자가치유되도록 오래 들지 않는다. */
    private readonly unsealedMemo = new Map<string, DateMemo & { at: number }>();
    /** 파일 쓰기에 실패한 sealed 날짜 — 다음 대사가 메모에서 재시도한다(스냅샷 재빌드 없이). */
    private readonly unwritten = new Set<string>();
    /** 접힌 와이어 날짜 메모 — 키는 날짜, 값에 멤버십 지문. 시트가 바뀌면 그 지문이 달라져 다시 접힌다. */
    private readonly foldMemo = new Map<string, FoldMemo>();

    constructor(private readonly deps: RankSectionsDeps) {}

    /** 전체 번들 — 요청 시 게으른 대사. 동시 요청은 한 비행을 나눠 탄다. */
    bundle(): Promise<RankSectionBundle> {
        if (this.inFlight) return this.inFlight;
        const p = this.doBundle().finally(() => {
            if (this.inFlight === p) this.inFlight = null;
        });
        this.inFlight = p;
        return p;
    }

    /** 앵커 변경 직후 호출(chartAnchor 컨트롤러) — 변경 **전에** 시작된 in-flight 에 이후 refetch 가
     *  합류하지 않게. 기준선이 곧 격자의 재료이고 격자가 곧 이 읽기모델의 모수라 앵커가 발화점이다. */
    invalidate(): void {
        this.gen++;
        this.inFlight = null;
        // 접힌 결과도 버린다 — 앵커 편집은 후보 집합(기대집합)을 바꾸므로 옛 접기는 재료가 다르다.
        this.foldMemo.clear();
    }

    private async doBundle(): Promise<RankSectionBundle> {
        const gen = this.gen;
        const today = (this.deps.today ?? kstToday)();
        const [candidates, members] = await Promise.all([this.deps.candidates.candidateMinutes(), this.deps.membership.load()]);
        const expected = new Map<string, Map<string, Set<string>>>();
        const pending = new Set<string>();
        for (const [date, byMinute] of candidates) {
            if (date >= today) {
                pending.add(date); // 잠정 유니버스 위 서수로 필터를 판정하지 않는다
                continue;
            }
            if (byMinute.size > 0) expected.set(date, byMinute);
        }
        const dates = [...expected.keys()].sort();
        const t0 = Date.now();
        const built = await mapWithConcurrency(dates, BUILD_CONCURRENCY, (date) =>
            this.dateBundle(date, new Set(expected.get(date)!.keys()), gen));
        const took = Date.now() - t0;
        if (took > 1000) console.log(`[rank-section] 대사 ${dates.length}일 ${took}ms`);
        // GC 는 **자기 세대일 때만** — invalidate 뒤의 새 비행이 구운 날짜를, 낡은 기대집합의 이 비행이 지우면 안 된다.
        if (gen === this.gen) await this.gc(expected);
        const fp = membershipFingerprint(members);
        const index = buildThemeIndex(members);
        const folded = built.map((d) => this.fold(d, expected.get(d.date)!, index, fp));
        return { version: RANK_SECTION_CALC_VERSION, dates: folded, pending: [...pending].sort() };
    }

    /**
     * 접기 — 유니버스 전 종목 서수(`FullDate`)에서 **그 분의 후보 ∪ 동료** 행만 남긴다.
     * 동료 = 후보의 소속 테마 멤버 ∩ 그날 유니버스. 자기 서수는 테마가 없어도 항상 싣는다.
     * 분모 `n` 은 접기 전 값 그대로다(유니버스 전체 참가 수 — 접힌 행 수가 아니다).
     */
    private fold(full: FullDate, byMinute: ReadonlyMap<string, Set<string>>, index: ReturnType<typeof buildThemeIndex>, fp: string): RankSectionDate {
        // ⚠ **미봉인 날짜는 메모하지 않는다** — 서수가 부분 유니버스 위라 TTL 뒤 더 채워진 스냅샷으로
        //   다시 계산되는데(자가치유), 키에 그 사실이 안 담겨 옛 서수를 계속 내보내게 된다.
        const key = foldKey(fp, byMinute);
        const hit = full.sealed ? this.foldMemo.get(full.date) : undefined;
        if (hit && hit.key === key) return hit.wire;

        const codeIdx = new Map(full.codes.map((c, i) => [c, i] as const));
        const kept = new Set<string>();
        const perSection = full.sections.map((s) => {
            const want = new Set<string>();
            for (const code of byMinute.get(s.time) ?? []) {
                want.add(code);
                for (const theme of index.themesOf(code)) for (const m of index.codesOf(theme)) if (codeIdx.has(m)) want.add(m);
            }
            for (const c of want) if (codeIdx.has(c)) kept.add(c);
            return want;
        });
        const codes = [...kept].sort();
        // codes 는 이미 오름차순이라 그 순서로 훑으면 정렬이 공짜다 — 임시 튜플을 만들지 않는다
        // (평탄 인코딩의 존재 이유가 "작은 배열 100만 개 회피"인데 서버가 그걸 만들면 앞뒤가 안 맞는다).
        const sections: WireRankSection[] = full.sections.map((s, si) => {
            const want = perSection[si];
            const rows: number[] = [];
            for (let out = 0; out < codes.length; out++) {
                const code = codes[out];
                if (!want.has(code)) continue;
                const src = codeIdx.get(code);
                if (src === undefined) continue; // 유니버스 밖 동료 — 서수가 없다
                rows.push(out, s.rate[src] ?? -1, s.amount[src] ?? -1);
            }
            return { time: s.time, n: s.n, rows };
        });
        const wire: RankSectionDate = { date: full.date, sealed: full.sealed, codes, sections };
        if (full.sealed) this.foldMemo.set(full.date, { key, wire });
        else this.foldMemo.delete(full.date);
        return wire;
    }

    private async dateBundle(date: string, times: ReadonlySet<string>, gen: number): Promise<FullDate> {
        const wanted = [...times].sort();
        const memo = this.memo.get(date);
        if (memo && wanted.every((t) => memo.byTime.has(t))) {
            // 지난 대사에서 디스크 쓰기가 실패한 날짜면 여기서 재시도 — 데이터는 메모에 있으니 스냅샷 재빌드 없이.
            if (this.unwritten.has(date)) await this.writeFile(date, memo, wanted, gen);
            return { date, sealed: true, codes: memo.codes, sections: wanted.map((t) => memo.byTime.get(t)!) };
        }
        const soft = this.unsealedMemo.get(date);
        if (soft && (this.deps.now ?? Date.now)() - soft.at < UNSEALED_TTL_MS && wanted.every((t) => soft.byTime.has(t))) {
            return { date, sealed: false, codes: soft.codes, sections: wanted.map((t) => soft.byTime.get(t)!) };
        }

        let codes: string[] | null = null;
        const byTime = new Map<string, RankSection>();
        const file = await this.deps.store.read(date);
        if (file && file.version === RANK_SECTION_CALC_VERSION) {
            codes = file.codes;
            for (const s of file.sections) byTime.set(s.time, s);
        }

        const missing = wanted.filter((t) => !byTime.has(t));
        let sealed = true; // 전부 파일에서 왔다면 굳은 날짜다 — 파일은 sealed 일 때만 쓴다
        if (missing.length > 0) {
            const snap = await this.deps.derived.snapshot(date);
            const stocks = snap.stocks.map((s) => s.minutes);
            const snapCodes = stocks.map((s) => s.code);
            // 파일과 스냅샷의 유니버스가 갈렸으면(스냅샷 스키마 상향 재빌드 등) 통째 다시 굽는다 —
            // 서수 배열이 코드 테이블 순서를 타므로 섞어 이어 붙이면 조용히 틀린다.
            if (codes && !sameCodes(codes, snapCodes)) byTime.clear();
            codes = snapCodes;
            const rebuild = byTime.size === 0 ? wanted : missing;
            for (const t of rebuild) byTime.set(t, rankSectionOf(stocks, date, t));
            sealed = await this.deps.derived.isSealed(date);
            if (sealed) {
                await this.writeFile(date, { codes, byTime }, wanted, gen);
            } else {
                console.warn(`[rank-section] ${date} 굳히기 보류 — 스냅샷 미완료, 메모리 서빙(sealed:false)`);
            }
        } else if (codes && byTime.size > wanted.length) {
            // 순수 삭제만 있는 날짜 — 서빙은 정확하지만 파일이 단조 증가한다. 한 번 프루닝해 파일 = 기대집합으로.
            await this.writeFile(date, { codes, byTime }, wanted, gen);
        }

        // 메모 반영도 자기 세대일 때만 — 낡은 비행이 새 비행의 (더 넓은) 메모를 좁은 것으로 덮지 않게(GC 가드와 대칭).
        if (codes && gen === this.gen) {
            if (sealed) {
                this.memo.set(date, { codes, byTime: new Map(byTime) });
                this.unsealedMemo.delete(date); // sealed 로 승격 — 낡은 미봉인 메모를 치운다
            } else {
                this.unsealedMemo.set(date, { codes, byTime: new Map(byTime), at: (this.deps.now ?? Date.now)() });
            }
        }
        return { date, sealed, codes: codes ?? [], sections: wanted.map((t) => byTime.get(t)!) };
    }

    /** sealed 날짜의 파일 쓰기(best-effort) — 단면은 **기대집합만** 싣는다(삭제된 분이 파일에 단조 누적되지 않게). */
    private async writeFile(date: string, from: DateMemo, wanted: readonly string[], gen: number): Promise<void> {
        if (gen !== this.gen) return; // 낡은 비행의 좁은 wanted 가 새 비행이 써 둔 단면을 프루닝으로 지우지 않게
        const out: RankSectionFile = {
            v: RANK_SECTION_FILE_VERSION,
            version: RANK_SECTION_CALC_VERSION,
            date,
            codes: from.codes,
            sections: wanted.map((t) => from.byTime.get(t)!), // 호출측이 wanted ⊆ byTime 을 보장한다
        };
        try {
            await this.deps.store.write(out);
            this.unwritten.delete(date);
        } catch (err) {
            this.unwritten.add(date);
            console.warn(`[rank-section] ${date} 캐시 쓰기 실패 — 메모리 결과는 그대로 서빙, 다음 대사에서 재시도`, err);
        }
    }

    /** 참조 없는 날짜 파일 GC. 기대집합이 비면 통째 skip — 미러 초기화 순간에 전부 지우는 사고 방지. */
    private async gc(expected: ReadonlyMap<string, unknown>): Promise<void> {
        if (expected.size === 0) return;
        // 파일과 무관한 메모류도 여기서 같이 턴다 — TTL 만료·모수 이탈이 "읽기에서 무시"로만 남아 영원히 쌓이지 않게.
        const nowMs = (this.deps.now ?? Date.now)();
        for (const [d, m] of this.unsealedMemo) {
            if (!expected.has(d) || nowMs - m.at >= UNSEALED_TTL_MS) this.unsealedMemo.delete(d);
        }
        for (const d of this.unwritten) if (!expected.has(d)) this.unwritten.delete(d);
        for (const d of this.foldMemo.keys()) if (!expected.has(d)) this.foldMemo.delete(d); // 모수를 떠난 날짜의 wire 잔류 방지
        try {
            const stored = await this.deps.store.listDates();
            for (const d of stored) {
                if (expected.has(d)) continue;
                await this.deps.store.remove(d);
                this.memo.delete(d);
            }
        } catch (err) {
            console.warn("[rank-section] GC 실패 — 무해(다음 대사에서 재시도)", err);
        }
    }
}

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
