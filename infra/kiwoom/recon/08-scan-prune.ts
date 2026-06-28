// 정찰 8: 전종목 일봉 스캔 → 프루닝 후보 측정 (복기 자동스캔 ingest 설계 전제).
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:scan [기준일 YYYYMMDD=20260626]
// 주의: 라이브 ~4292콜 (~7~10분). 읽기 전용.
//
// [설계 결정] 시변 메타데이터(auditInfo: 거래정지/관리/환기, state)로는 제외하지 않는다.
//   ka10099 의 auditInfo/state 는 익일 새벽(~05시) 갱신이라 호출 시점 기준 항상 ~T-1 상태다(키움 REST Q&A).
//   → 당일이든 과거 baseDate 든 "그 날짜의 진짜 상태"와 시점이 어긋남. 시점 정확한 "일봉"으로만 거른다(traded & amount>0).
// [확정] ETF/ETN 누수 제거: ETF(069500 등)·ETN(kind=Q)이 mrkt_tp 0/10 에 섞여 오지만, marketName 으로 깨끗이 갈린다.
//   실측(20260626): 거래소920+코스닥1822=주식2742, ETF1145·ETN379(=kind Q 379 일치)·리츠23·인프라2·뮤추얼1.
//   → loadUniverse 에서 marketName ∈ {거래소,코스닥} 만 통과(개별주식). marketNameDiag 진단은 회귀감시용으로 유지.
import { makeKiwoom, saveExploration, argv, handleError } from "./_shared.js";
import { silentLogger, type Kiwoom } from "../src/index.js";

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

// marketName/upName/companyClassName 은 거르는 데 안 쓰고, ETF/ETN 정체 식별용으로만 보존(아래 진단).
interface Univ { code: string; name: string; market: string; kind: string; marketName: string; upName: string; companyClassName: string }
interface DayRow {
    code: string; name: string; kind: string;
    close: number; amount: number; changeRate: number; highRate: number; traded: boolean;
}

// 유니버스 로드 = 어댑터 getStockList 가 개별주식(marketName ∈ {거래소,코스닥})만 반환 → 그대로 매핑.
// (ETF/ETN/리츠/펀드 제외는 어댑터가 처리. audit 시변상태는 안 거르고 일봉으로 필터 — 상단 결정.)
async function loadUniverse(k: Kiwoom): Promise<Univ[]> {
    const out: Univ[] = [];
    for (const [mrkt, mname] of [["0", "KOSPI"], ["10", "KOSDAQ"]] as const) {
        for (const e of await k.rest.getStockList(mrkt)) {
            out.push({
                code: e.code, name: e.name, market: mname, kind: e.kind,
                marketName: e.marketName, upName: e.upName, companyClassName: e.companyClassName,
            });
        }
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

/** 문자열 배열 → 값별 카운트(내림차순). 제외 필드 어휘 발굴용. */
function tally(arr: string[]): Record<string, number> {
    const m: Record<string, number> = {};
    for (const v of arr) { const key = v || "(빈값)"; m[key] = (m[key] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

async function main() {
    const baseDate = argv(2, "20260626");
    const k = makeKiwoom(silentLogger);

    console.log(`[1/3] 유니버스 로드 (ka10099, marketName ∈ {거래소,코스닥} 개별주식만)...`);
    const univ = await loadUniverse(k);
    console.log(`  개별주식 ${univ.length}종목 (ETF/ETN/리츠/펀드 제외)`);

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
    // thin 게이너 = 등락률 top50 중 거래대금 rank>400 (등락률 슬롯 점유)
    const thin = byRate.slice(0, 50).filter((r) => amountRank.get(r.code)! > 400);
    // 프루닝 후보수: (거래대금순위 ≤ N) ∪ (고가등락률 ≥ cut)
    const cand = (N: number, cut: number) => traded.filter((r) => amountRank.get(r.code)! <= N || r.highRate >= cut).length;

    // ── ETF/ETN 식별 진단(실측으로 거를 필드 찾기) ──────────────────────────
    const univByCode = new Map(univ.map((u) => [u.code, u]));
    const kindDiag = { universe: tally(univ.map((u) => u.kind)), traded: tally(traded.map((r) => r.kind)) };
    const marketNameDiag = tally(univ.map((u) => u.marketName));
    const upNameDiag = tally(univ.map((u) => u.upName));
    // 거래대금 상위 30 에 분류 필드 동반 → 069500(KODEX 200) 등이 어느 필드로 구분되는지 눈으로.
    const topAmountClassified = byAmount.slice(0, 30).map((r, i) => {
        const u = univByCode.get(r.code);
        return { rank: i + 1, code: r.code, name: r.name, amount: r.amount, kind: r.kind, marketName: u?.marketName ?? "", upName: u?.upName ?? "", cls: u?.companyClassName ?? "" };
    });

    console.log("\n📊 분포");
    console.log(`  거래일 데이터: ${traded.length} (전체 ${univ.length})`);
    console.log(`  고가등락률 ≥2%:${cntHigh(2)}  ≥3%:${cntHigh(3)}  ≥5%:${cntHigh(5)}`);
    console.log(`  일거래대금 rank100/400/500 (raw): ${amtAtRank(100)} / ${amtAtRank(400)} / ${amtAtRank(500)}`);
    console.log(`  최상위 거래대금: ${byAmount[0]?.amount} 백만원 (${byAmount[0]?.name})`);
    console.log(`  조건(EOD) 멤버수: ${members.length}  (그중 kind=Q: ${qInMembers})`);
    console.log(`  thin 게이너(등락률top50 & 거래대금rank>400): ${thin.length}`);
    console.log("  프루닝 후보수 (거래대금순위 N ∪ 고가등락률 cut):");
    for (const N of [400, 500, 600]) {
        const line = [2, 3, 5].map((cut) => `cut${cut}%=${cand(N, cut)}`).join("  ");
        console.log(`    N=${N}: ${line}`);
    }

    console.log("\n🔎 ETF/ETN 식별 진단");
    console.log(`  marketName 분포(universe): ${JSON.stringify(marketNameDiag)}`);
    console.log(`  kind 분포 — universe: ${JSON.stringify(kindDiag.universe)} / traded: ${JSON.stringify(kindDiag.traded)}`);
    console.log("  거래대금 상위 15 분류(kind·marketName·upName·cls):");
    for (const t of topAmountClassified.slice(0, 15)) {
        console.log(`    #${t.rank} ${t.code} ${t.name} | kind=${t.kind} mkt=${t.marketName} up=${t.upName} cls=${t.cls}`);
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
        const al = await fetchDay(k, { code: `${r.code}_AL`, name: r.name, market: "", kind: r.kind, marketName: "", upName: "", companyClassName: "" }, baseDate);
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
            kindDiag,
            marketNameDiag,
            upNameDiag,
            topAmountClassified,
            thinGainers: thin.length,
            pruningCandidates: Object.fromEntries(
                [400, 500, 600].flatMap((N) => [2, 3, 5].map((cut) => [`N${N}_cut${cut}`, cand(N, cut)])),
            ),
            minuteProbe,
            nxtCmp,
        },
        // 전체 raw — 사후 검수용(사이드카 .raw.json). 콘솔엔 안 토함.
        raw: { universe: univ, rows },
    });
    console.log("\n✅ 끝. logs/raw-samples 에 요약 + raw 사이드카 저장됨.");
}

main().catch(handleError);
