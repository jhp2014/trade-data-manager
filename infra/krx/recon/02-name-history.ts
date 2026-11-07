// 정찰 2: 종목 이름 이력 재료 — {stk|ksq}_bydd_trd 의 ISU_NM 은 **그날 기준 이름**이라 날짜별로 받으면 사명 변경 이력이 된다.
// 실측(2026-11-07): 2010-01-04 까지 이름이 온다(000120 대한통운 → CJ대한통운). 2005 이전은 빈 응답.
// 글이 있는 2022-12-26 부터는 매 거래일, 그 앞은 매달 첫 거래일만 받는다(이름만 있으면 되는 기간).
// DB 를 건드리지 않는다. 날짜마다 파일 하나([[코드, 이름, 시장]…], 휴장일은 빈 배열)를 쌓고 이미 있는 날은 건너뛴다 — 끊겨도 다시 돌리면 이어진다.
// 한도 일 10,000건, 전체 약 2,200건.
// 사용: pnpm --filter @trade-data-manager/krx exec tsx recon/02-name-history.ts <저장 폴더> [끝날 YYYY-MM-DD=어제]
import fs from "node:fs";
import path from "node:path";
import { makeKrx, handleError } from "./_shared.js";
import type { KrxByddTrdRow, KrxMarket } from "../src/index.js";

const OUT = process.argv[2];
if (!OUT) throw new Error("사용법: tsx recon/02-name-history.ts <저장 폴더> [끝날]");
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
const END = process.argv[3] ?? addDays(kstToday(), -1);
const DAILY_FROM = "2022-12-26", MONTHLY_FROM = "2010-01-01";
const MARKETS: KrxMarket[] = ["stk", "ksq"];
const weekday = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };

async function main(): Promise<void> {
    fs.mkdirSync(OUT, { recursive: true });
    const krx = makeKrx();
    let calls = 0, saved = 0;
    const fileOf = (d: string) => path.join(OUT, d + ".json");
    /** 하루를 받아 저장하고 행 수를 돌려준다. 이미 있으면 파일의 행 수. */
    async function day(d: string): Promise<number> {
        const f = fileOf(d);
        if (fs.existsSync(f)) return (JSON.parse(fs.readFileSync(f, "utf8")) as unknown[]).length;
        const rows: [string, string, string][] = [];
        for (const m of MARKETS) {
            calls++;
            const res = await krx.rest.getByddTrd(m, d.replaceAll("-", ""));
            const list: KrxByddTrdRow[] = res.data.OutBlock_1 ?? [];
            for (const r of list) rows.push([String(r.ISU_CD).trim(), String(r.ISU_NM).trim(), m]);
            if (!list.length && m === "stk") break; // 휴장일 — 코스닥은 부르지 않는다
        }
        fs.writeFileSync(f, JSON.stringify(rows));
        saved++;
        if (saved % 50 === 0) console.log(`${d} … 저장 ${saved}일 · 호출 ${calls}`);
        return rows.length;
    }
    // 매달 첫 거래일(글이 시작되기 전까지)
    for (let m = MONTHLY_FROM; m < DAILY_FROM.slice(0, 7) + "-01"; m = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10)) {
        for (let i = 0; i < 12; i++) {
            const d = addDays(m, i);
            if (weekday(d) && (await day(d)) > 0) break;
        }
    }
    // 매 거래일
    for (let d = DAILY_FROM; d <= END; d = addDays(d, 1)) if (weekday(d)) await day(d);
    console.log(`끝 — 새로 저장 ${saved}일 · 호출 ${calls} · 파일 ${fs.readdirSync(OUT).length}`);
}

main().catch(handleError);
