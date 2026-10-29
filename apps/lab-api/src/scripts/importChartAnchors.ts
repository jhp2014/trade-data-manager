// 일회성 컷오버 — workbench 기준선(curation.chart_anchors, param baseline)을 lab 저장 선 파일로 옮긴다(2026-10-30, 결정 로그 「일봉 판단 학습」).
// 읽기는 **로컬 curation 미러**(DATABASE_URL 의 curation 스키마)에서만 — Supabase 에는 닿지 않는다(egress). 「무시 캔들」 등 다른 param 은 옮기지 않는다.
// 대상 폴더에 이미 종목 파일이 하나라도 있으면 멈춘다(덮어쓰기 금지 — 정본은 이제 파일이다). --dry 는 세기만 한다.
// 미러는 야간 백업이 Supabase 에서 당겨 온다 — 협업자의 마지막 쓰기까지 담으려면 그날 백업 뒤에 돌린다.
//
//   pnpm --filter @trade-data-manager/lab-api exec tsx src/scripts/importChartAnchors.ts <대상 폴더> [--dry]
import { promises as fs } from "node:fs";
import path from "node:path";
import { isCanonicalStockCode } from "@trade-data-manager/market";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import type { LabChartLine } from "@trade-data-manager/wire";
import { parseLine, serializeLines } from "../lines/chartLines.js";

const FIELD: Record<string, LabChartLine["field"]> = { open: "O", high: "H", low: "L", close: "C" };

const [dir, ...flags] = process.argv.slice(2);
if (!dir) throw new Error("대상 폴더를 준다: importChartAnchors.ts <대상 폴더> [--dry]");
const dry = flags.includes("--dry");

const existing = await fs.readdir(dir).catch(() => [] as string[]);
if (!dry && existing.some((f) => f.endsWith(".jsonl"))) throw new Error(`${dir} 에 이미 종목 파일이 있다 — 덮어쓰지 않는다`);

const pool = createPoolFromEnv();
await pool.query("SET default_transaction_read_only = on");
const { rows } = await pool.query<{ stock_code: string; trade_date: string; anchor_date: string; anchor_time: string | null; field: string | null; market: string | null }>(
    `SELECT stock_code, trade_date::text, anchor_date::text, anchor_time::text, field, market
       FROM curation.chart_anchors WHERE param = 'baseline' ORDER BY stock_code, trade_date`,
);
await pool.end();

const byCode = new Map<string, LabChartLine[]>();
const skipped: string[] = [];
for (const r of rows) {
    const field = r.field ? FIELD[r.field] : undefined;
    // 파일 이름이 곧 종목 — 표준형이 아니면 서버(assertStockCode)가 영영 못 읽는 고아가 된다
    if (!isCanonicalStockCode(r.stock_code)) {
        skipped.push(`${r.stock_code}@${r.trade_date} — 표준 종목코드가 아니다`);
        continue;
    }
    try {
        const line = parseLine({ chartDate: r.trade_date, anchorDate: r.anchor_date, anchorTime: r.anchor_time, field, market: r.market });
        byCode.set(r.stock_code, [...(byCode.get(r.stock_code) ?? []), line]);
    } catch (e) {
        skipped.push(`${r.stock_code}@${r.trade_date} ${r.anchor_date} ${r.anchor_time ?? ""} ${r.field}/${r.market} — ${e instanceof Error ? e.message : String(e)}`);
    }
}

const total = [...byCode.values()].reduce((n, ls) => n + ls.length, 0);
const minute = [...byCode.values()].flat().filter((l) => l.anchorTime !== null).length;
console.log(`기준선 ${rows.length}줄 → 옮김 ${total}(분봉 ${minute}) · 종목 ${byCode.size} · 건너뜀 ${skipped.length}`);
for (const s of skipped) console.log(`  건너뜀: ${s}`);
if (dry) process.exit(0);

await fs.mkdir(dir, { recursive: true });
for (const [code, lines] of byCode) await fs.writeFile(path.join(dir, `${code}.jsonl`), serializeLines(lines), "utf8");
console.log(`썼다 — ${dir} (${byCode.size} 파일)`);
