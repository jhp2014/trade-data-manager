// 정찰 1: 분봉 다중소스 동등성 비교 — 같은 (종목,날)을 키움·KIS 양쪽에서 떠 시장(KRX/UN)별로 대조.
// 목적: MinuteCandleProvider 뒤에 키움/KIS 라우팅(유량 ~2배)이 안전한지 = 두 소스 분봉이
//       OHLC·거래량·시간·NXT 프리마켓까지 일치하는지 실측한다(문서≠실응답).
// 일치 → 라우팅 안전 / 드리프트 → KIS 정본 + 키움 오버플로(또는 폴백).
//
// 시장 매핑: KRX = 키움 평문코드 + KIS div "J" / UN(통합) = 키움 "코드_AL" + KIS div "UN".
// 사용: pnpm --filter @trade-data-manager/broker recon:minute-compare [종목코드] [날짜YYYYMMDD]
import fs from "node:fs";
import path from "node:path";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";

/** 키움은 가격에 전일대비 시각표시 "+/-"를 붙인다 — 비교 전 제거(실값은 절댓값). */
const strip = (s: string | undefined): string => (s ?? "").replace(/^[+-]/, "");

interface Bar {
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
}

/** 키움 분봉 raw → HHMMSS 키 맵. cntr_tm = YYYYMMDDHHMMSS, 해당 날짜만. */
function kiwoomMap(
    rows: Array<{
        cntr_tm: string;
        open_pric: string;
        high_pric: string;
        low_pric: string;
        cur_prc: string;
        trde_qty: string;
    }>,
    date: string,
): Map<string, Bar> {
    const m = new Map<string, Bar>();
    for (const r of rows) {
        if (r.cntr_tm.substring(0, 8) !== date) continue;
        const t = r.cntr_tm.substring(8, 14);
        m.set(t, {
            o: strip(r.open_pric),
            h: strip(r.high_pric),
            l: strip(r.low_pric),
            c: strip(r.cur_prc),
            v: strip(r.trde_qty),
        });
    }
    return m;
}

/** KIS 분봉 raw → HHMMSS 키 맵. (collectDayMinutes 가 이미 해당 날짜·오름차순으로 줌) */
function kisMap(
    rows: Array<{
        stck_cntg_hour: string;
        stck_oprc: string;
        stck_hgpr: string;
        stck_lwpr: string;
        stck_prpr: string;
        cntg_vol: string;
    }>,
): Map<string, Bar> {
    const m = new Map<string, Bar>();
    for (const r of rows) {
        m.set(r.stck_cntg_hour, {
            o: strip(r.stck_oprc),
            h: strip(r.stck_hgpr),
            l: strip(r.stck_lwpr),
            c: strip(r.stck_prpr),
            v: strip(r.cntg_vol),
        });
    }
    return m;
}

function diff(kw: Map<string, Bar>, kis: Map<string, Bar>) {
    const kwKeys = [...kw.keys()].sort();
    const kisKeys = [...kis.keys()].sort();
    const common = kwKeys.filter((k) => kis.has(k));
    const onlyKw = kwKeys.filter((k) => !kis.has(k));
    const onlyKis = kisKeys.filter((k) => !kw.has(k));

    const mismatches: Array<{ t: string; field: string; kw: string; kis: string }> = [];
    for (const t of common) {
        const a = kw.get(t)!;
        const b = kis.get(t)!;
        for (const f of ["o", "h", "l", "c", "v"] as const) {
            if (a[f] !== b[f]) mismatches.push({ t, field: f, kw: a[f], kis: b[f] });
        }
    }
    const pre = (keys: string[]) => keys.filter((k) => k < "090000").length; // 09:00 이전 = 프리마켓

    return {
        countKiwoom: kw.size,
        countKis: kis.size,
        rangeKiwoom: kwKeys.length ? [kwKeys[0], kwKeys[kwKeys.length - 1]] : null,
        rangeKis: kisKeys.length ? [kisKeys[0], kisKeys[kisKeys.length - 1]] : null,
        commonCount: common.length,
        onlyKiwoomCount: onlyKw.length,
        onlyKiwoomSample: onlyKw.slice(0, 10),
        onlyKisCount: onlyKis.length,
        onlyKisSample: onlyKis.slice(0, 10),
        mismatchCount: mismatches.length,
        mismatchSample: mismatches.slice(0, 12),
        premarketKiwoom: pre(kwKeys),
        premarketKis: pre(kisKeys),
        verdict:
            mismatches.length === 0 && onlyKw.length === 0 && onlyKis.length === 0
                ? "IDENTICAL"
                : "DRIFT",
    };
}

function today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function main() {
    const stockCode = process.argv[2] || "005930";
    const date = process.argv[3] || today();
    const kw = createKiwoom();
    const kis = createKis();

    const markets = [
        { name: "KRX", kiwoomCode: stockCode, kisDiv: "J" },
        { name: "UN", kiwoomCode: `${stockCode}_AL`, kisDiv: "UN" },
    ];

    const result: Record<string, ReturnType<typeof diff>> = {};
    const raw: Record<string, unknown> = {};
    for (const mk of markets) {
        // 풀데이 비교: 프리마켓(08:00)~애프터장(~20:00)까지 양쪽 동일 윈도우로 수집.
        const kwRows = await kw.rest.getMinuteChartsForDate(mk.kiwoomCode, date, 15);
        const kisRows = await kis.rest.collectDayMinutes(stockCode, date, {
            marketDiv: mk.kisDiv,
            startTime: "200000",
            earliestTime: "080000",
            maxPages: 20,
        });
        result[mk.name] = diff(kiwoomMap(kwRows, date), kisMap(kisRows));
        raw[mk.name] = { kiwoom: kwRows, kis: kisRows };
    }

    const dir = path.resolve(process.cwd(), "logs/raw-samples");
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts =
        `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
        `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const base = path.join(dir, `minute-compare-${stockCode}-${date}-${ts}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ stockCode, date, result }, null, 2), "utf-8");
    fs.writeFileSync(`${base}.raw.json`, JSON.stringify({ stockCode, date, raw }, null, 2), "utf-8");

    console.log("─".repeat(80));
    console.log(`분봉 비교  종목=${stockCode}  날짜=${date}`);
    for (const mk of markets) {
        const r = result[mk.name];
        console.log(`\n[${mk.name}]  ⇒  ${r.verdict}`);
        console.log(`  개수      키움=${r.countKiwoom}  KIS=${r.countKis}`);
        console.log(`  범위      키움=${JSON.stringify(r.rangeKiwoom)}  KIS=${JSON.stringify(r.rangeKis)}`);
        console.log(`  공통=${r.commonCount}  키움only=${r.onlyKiwoomCount}  KISonly=${r.onlyKisCount}  값불일치=${r.mismatchCount}`);
        console.log(`  프리마켓(09:00전)  키움=${r.premarketKiwoom}  KIS=${r.premarketKis}`);
        if (r.mismatchCount) console.log(`  불일치샘플: ${JSON.stringify(r.mismatchSample)}`);
        if (r.onlyKiwoomCount) console.log(`  키움only샘플: ${JSON.stringify(r.onlyKiwoomSample)}`);
        if (r.onlyKisCount) console.log(`  KISonly샘플: ${JSON.stringify(r.onlyKisSample)}`);
    }
    console.log(`\n💾 Saved: ${base}.json  (+ .raw.json)`);
    console.log("─".repeat(80));
}

main().catch((err) => {
    console.error("\n❌ 정찰 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
