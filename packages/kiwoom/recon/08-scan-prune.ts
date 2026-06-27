// 정찰 8: 전종목 일봉 스캔 → 프루닝 후보 측정 (복기 자동스캔 ingest 설계 전제).
// REPLAY-COLLECTION-PLAN §7 "남은 측정" ①②③⑥ + KRX/NXT·kind=Q 결정 근거를 한 번에.
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:scan [기준일 YYYYMMDD=20260626]
// 주의: 라이브 ~4292콜 (~7~10분). 읽기 전용.
import { makeKiwoom, saveExploration, argv, handleError } from "./_shared.js";
import { silentLogger, type Kiwoom } from "../src/index.js";

// 당일 제외(시변 상태). 백필은 적용 안 함 — §1 참고.
const EXCLUDE_AUDIT = new Set(["거래정지", "관리종목", "투자주의환기종목"]);

function parseNum(v: unknown): number {
    const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
}
// pred_pre_sig: 1 상한 · 2 상승 · 3 보합 · 4 하한 · 5 하락
function signFromSig(sig: string): number {
    if (sig === "1" || sig === "2") return 1;
    if (sig === "4" || sig === "5") return -1;
    return 0;
}

interface Univ { code: string; name: string; market: string; kind: string }
interface DayRow {
    code: string; name: string; kind: string;
    close: number; amount: number; changeRate: number; highRate: number; traded: boolean;
}

async function loadUniverse(k: Kiwoom): Promise<Univ[]> {
    const out: Univ[] = [];
    for (const [mrkt, mname] of [["0", "KOSPI"], ["10", "KOSDAQ"]] as const) {
        const lease = k.pool.acquire();
        let contYn = "N", nextKey = "", pages = 0;
        do {
            const res = await k.rest.request<{ list?: any[] }>(
                "ka10099", "/api/dostk/stkinfo", { mrkt_tp: mrkt }, { lease, contYn, nextKey },
            );
            for (const e of res.data.list ?? []) {
                const audit = String(e.auditInfo ?? "");
                const cls = String(e.companyClassName ?? "");
                const name = String(e.name ?? "");
                const kind = String(e.kind ?? "");
                if (EXCLUDE_AUDIT.has(audit)) continue;
                if (kind === "Q") continue; // kind=Q = ETN (코스피 리스트에 섞임). ETF는 별도 시장이라 안 옴.
                if (cls === "스팩" || name.includes("스팩")) continue;
                out.push({ code: String(e.code), name, market: mname, kind });
            }
            contYn = res.contYn; nextKey = res.nextKey; pages++;
        } while (contYn === "Y" && nextKey && pages < 50);
    }
    return out;
}

async function fetchDay(k: Kiwoom, u: Univ, baseDate: string): Promise<DayRow | null> {
    try {
        const res = await k.rest.getDailyChart(u.code, { baseDate });
        const candles = res.data.stk_dt_pole_chart_qry ?? [];
        const c = candles.find((x) => x.dt === baseDate) ?? candles[0];
        if (!c) return null;
        const close = parseNum(c.cur_prc);
        const high = parseNum(c.high_pric);
        const amount = parseNum(c.trde_prica);
        const chg = parseNum(c.pred_pre) * signFromSig(String(c.pred_pre_sig));
        const prev = close - chg;
        const changeRate = prev > 0 ? ((close - prev) / prev) * 100 : 0;
        const highRate = prev > 0 ? ((high - prev) / prev) * 100 : 0;
        return { code: u.code, name: u.name, kind: u.kind, close, amount, changeRate, highRate, traded: c.dt === baseDate };
    } catch {
        return null;
    }
}

/** 동시성 제한 map — 멀티키(2키×5/s) 활용 위해 concurrency≈8. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>, onProgress?: (done: number) => void): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let idx = 0, done = 0;
    async function worker() {
        for (;;) {
            const i = idx++;
            if (i >= items.length) return;
            out[i] = await fn(items[i]);
            if (onProgress && ++done % 300 === 0) onProgress(done);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

async function main() {
    const baseDate = argv(2, "20260626");
    const k = makeKiwoom(silentLogger);

    console.log(`[1/3] 유니버스 로드 (ka10099, KOSPI+KOSDAQ, 제외 적용)...`);
    const univ = await loadUniverse(k);
    console.log(`  제외 후 ${univ.length}종목`);

    console.log(`[2/3] 일봉 스캔 ${baseDate} — ${univ.length}콜 (concurrency 8)...`);
    const t0 = Date.now();
    const rows = (await mapLimit(univ, 8, (u) => fetchDay(k, u, baseDate), (d) => console.log(`  ...${d}/${univ.length}`)))
        .filter((r): r is DayRow => !!r);
    const traded = rows.filter((r) => r.traded && r.amount > 0);
    console.log(`  완료 ${((Date.now() - t0) / 1000).toFixed(0)}s · 거래일 데이터 ${traded.length}종목`);

    // 순위
    const byAmount = [...traded].sort((a, b) => b.amount - a.amount);
    const byRate = [...traded].sort((a, b) => b.changeRate - a.changeRate);
    const amountRank = new Map(byAmount.map((r, i) => [r.code, i + 1]));
    const rateRank = new Map(byRate.map((r, i) => [r.code, i + 1]));

    const cntHigh = (th: number) => traded.filter((r) => r.highRate >= th).length;
    const amtAtRank = (rk: number) => byAmount[rk - 1]?.amount ?? 0;

    // 조건(EOD 근사) 멤버
    const members = traded.filter((r) => {
        const ar = amountRank.get(r.code)!, rr = rateRank.get(r.code)!;
        return (rr <= 50 && ar <= 400) || ar <= 100;
    });
    const qInMembers = members.filter((r) => r.kind === "Q").length;
    // thin 게이너 = 등락률 top50 중 거래대금 rank>400 (등락률 슬롯 점유, §1)
    const thin = byRate.slice(0, 50).filter((r) => amountRank.get(r.code)! > 400);
    // 프루닝 후보수: (거래대금순위 ≤ N) ∪ (고가등락률 ≥ cut)
    const cand = (N: number, cut: number) => traded.filter((r) => amountRank.get(r.code)! <= N || r.highRate >= cut).length;

    console.log("\n📊 분포");
    console.log(`  거래일 데이터: ${traded.length} (전체 ${univ.length})`);
    console.log(`  고가등락률 ≥2%:${cntHigh(2)}  ≥3%:${cntHigh(3)}  ≥5%:${cntHigh(5)}`);
    console.log(`  일거래대금 rank100/400/500 (raw): ${amtAtRank(100)} / ${amtAtRank(400)} / ${amtAtRank(500)}`);
    console.log(`  ↳ 억 환산(÷1e8): ${(amtAtRank(100) / 1e8).toFixed(0)} / ${(amtAtRank(400) / 1e8).toFixed(0)} / ${(amtAtRank(500) / 1e8).toFixed(0)}`);
    console.log(`  최상위 거래대금 raw(단위확인용): ${byAmount[0]?.amount} (${byAmount[0]?.name})`);
    console.log(`  조건(EOD) 멤버수: ${members.length}  (그중 kind=Q: ${qInMembers})`);
    console.log(`  thin 게이너(등락률top50 & 거래대금rank>400): ${thin.length}`);
    console.log("  프루닝 후보수 (거래대금순위 N ∪ 고가등락률 cut):");
    for (const N of [400, 500, 600]) {
        const line = [2, 3, 5].map((cut) => `cut${cut}%=${cand(N, cut)}`).join("  ");
        console.log(`    N=${N}: ${line}`);
    }

    console.log(`\n[3/3] 분봉 base_dt 점프 (상위 5 후보)...`);
    const minuteProbe: any[] = [];
    for (const r of byAmount.slice(0, 5)) {
        try {
            const cs = await k.rest.getMinuteChartsForDate(r.code, baseDate, 10);
            const first = cs[0]?.cntr_tm, last = cs[cs.length - 1]?.cntr_tm;
            console.log(`  ${r.code} ${r.name}: ${cs.length}봉  최신 ${first} ~ 과거 ${last}`);
            minuteProbe.push({ code: r.code, name: r.name, candles: cs.length, first, last });
        } catch (e) {
            console.log(`  ${r.code} ${r.name}: 분봉 실패 ${(e as Error).message}`);
        }
    }

    // KRX vs NXT(_AL) 거래대금 비교 (상위 5 샘플) — 순위 기준 결정 근거
    console.log(`\n[+] KRX vs NXT(_AL) 거래대금 비교 (상위 5)...`);
    const nxtCmp: any[] = [];
    for (const r of byAmount.slice(0, 5)) {
        const al = await fetchDay(k, { code: `${r.code}_AL`, name: r.name, market: "", kind: r.kind }, baseDate);
        console.log(`  ${r.code} ${r.name}: KRX ${r.amount}  /  _AL ${al?.amount ?? "(실패)"}`);
        nxtCmp.push({ code: r.code, krx: r.amount, al: al?.amount ?? null });
    }

    saveExploration({
        apiId: "scan-prune",
        label: baseDate,
        request: { baseDate, universe: univ.length },
        response: {
            tradedCount: traded.length,
            highRate: { "ge2": cntHigh(2), "ge3": cntHigh(3), "ge5": cntHigh(5) },
            amountRankRaw: { r100: amtAtRank(100), r400: amtAtRank(400), r500: amtAtRank(500) },
            topAmountSample: byAmount.slice(0, 3).map((r) => ({ name: r.name, amount: r.amount })),
            conditionMembers: members.length,
            qInMembers,
            thinGainers: thin.length,
            pruningCandidates: Object.fromEntries(
                [400, 500, 600].flatMap((N) => [2, 3, 5].map((cut) => [`N${N}_cut${cut}`, cand(N, cut)])),
            ),
            minuteProbe,
            nxtCmp,
        },
    });
    console.log("\n✅ 끝. logs/raw-samples 에 요약 저장됨.");
}

main().catch(handleError);
