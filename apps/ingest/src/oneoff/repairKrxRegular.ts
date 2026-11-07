// 일회성 — 2026-09-14 이후 일봉 두 표(원주가·수정주가)의 KRX 칸을 정규장 값(ka11081)으로 덮는다. UN 칸은 건드리지 않는다.
// 왜 재수집이 아닌가: 원주가 표는 onConflictDoNothing 이라 재수집으로 안 덮인다. 수정주가 표만 바뀌면 basePricesOf 의 계수가 어긋난다.
// 결정 로그 「일봉 KRX = 정규장」. 실행을 마치면 이 파일을 지운다.
//
// 순서: ① api 를 끈다 ② ka11081 어댑터가 반영된 코드에서 --apply ③ api 를 다시 켠다. 야간 수집 전에 끝낸다.
//   · 옛 코드의 야간 수집은 수정주가 표를 저녁 값으로 되덮는다.
//   · 새 코드의 야간 수집이 먼저 돌면 수정주가 표만 바뀌어 짝이 어긋난다(이 명령을 돌리면 맞춰진다).
//   · --apply 는 실패가 없을 때만 대상 날짜의 api 파일 캐시(day-snapshot·point-grid)를 지운다. KRX 파생값이 구워져 있어서다.
//     market DB 는 한 벌이고 캐시는 폴더마다 따로다 — 다른 워크트리의 같은 캐시는 손으로 지운다.
//
// 사용(기본은 조회만 — DB 세션이 읽기 전용이다):
//   pnpm --filter @trade-data-manager/ingest exec tsx src/oneoff/repairKrxRegular.ts [--apply] [--codes 005930,000660] [--from YYYY-MM-DD(개시 전은 조회만)]
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { KiwoomDailyAdapter, KiwoomRawDailyCandleAdapter } from "@trade-data-manager/broker";
import { createPoolFromEnv } from "@trade-data-manager/persistence";
import { kstToday, type DailyBar, type DailyCandle } from "@trade-data-manager/market";

const AFTER_MARKET_OPEN = "2026-09-14";
const WORKERS = 6;
const TABLES = { raw: "market.daily_candles_raw", adj: "market.daily_candles" } as const;
const API_CACHE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../api/.cache");
const DATED_CACHES = ["day-snapshot", "point-grid"];

interface StoredRow {
    d: string;
    open_krx: number;
    high_krx: number;
    low_krx: number;
    close_krx: number;
    volume_krx: string;
    amount_krx: string;
}
type Table = keyof typeof TABLES;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
/** 값이 빠진 옵션은 전 종목·기본 구간으로 조용히 넓히지 않고 멈춘다. */
const optionOf = (name: string): string | undefined => {
    if (!args.includes(name)) return undefined;
    const value = args[args.indexOf(name) + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} 에 값이 없다`);
    return value;
};
const codesArg = optionOf("--codes")?.split(",");
const FROM = optionOf("--from") ?? AFTER_MARKET_OPEN;
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) throw new Error(`--from 은 YYYY-MM-DD: ${FROM}`);
// 개시 전 구간은 대조만 한다 — 그 줄이 다르면 덮기 전에 왜 다른지 먼저 본다.
if (apply && FROM < AFTER_MARKET_OPEN) throw new Error(`--apply 는 ${AFTER_MARKET_OPEN} 이후만: ${FROM}`);

const sameKrx = (s: StoredRow, b: DailyBar): boolean =>
    s.open_krx === Number(b.open) &&
    s.high_krx === Number(b.high) &&
    s.low_krx === Number(b.low) &&
    s.close_krx === Number(b.close) &&
    BigInt(s.volume_krx) === BigInt(b.volume) &&
    BigInt(s.amount_krx) === BigInt(b.amount);

/** 대상 날짜의 굳은 파생 파일을 지운다 — 다음 요청이 고친 값으로 다시 굽는다. 지운 수를 돌려준다. */
async function clearDatedCaches(): Promise<number> {
    let removed = 0;
    for (const dir of DATED_CACHES) {
        const root = path.join(API_CACHE, dir);
        const names = await fs.readdir(root).catch(() => [] as string[]);
        for (const name of names) {
            const date = /^(\d{4}-\d{2}-\d{2})\./.exec(name)?.[1];
            if (date === undefined || date < FROM) continue;
            await fs.rm(path.join(root, name), { force: true });
            removed++;
        }
    }
    return removed;
}

async function main(): Promise<void> {
    const pool = createPoolFromEnv();
    // 조회 모드는 세션째 읽기 전용 — 코드 실수로도 못 쓴다.
    if (!apply) pool.on("connect", (client) => void client.query("SET default_transaction_read_only = on"));
    const kiwoom = createKiwoom();
    const rawSource = new KiwoomRawDailyCandleAdapter(kiwoom.rest);
    const adjSource = new KiwoomDailyAdapter(kiwoom.rest);
    const today = kstToday();
    const range = { from: FROM, to: today }; // 받기 기준일은 늘 오늘(수정주가 as-of 함정)

    const readStored = async (table: Table, code: string): Promise<Map<string, StoredRow>> => {
        const { rows } = await pool.query<StoredRow>(
            `SELECT trade_date::text AS d, open_krx, high_krx, low_krx, close_krx, volume_krx, amount_krx
               FROM ${TABLES[table]} WHERE stock_code = $1 AND trade_date >= $2`,
            [code, FROM],
        );
        return new Map(rows.map((r) => [r.d, r]));
    };

    const codes =
        codesArg ??
        (
            await pool.query<{ stock_code: string }>(
                `SELECT DISTINCT stock_code FROM ${TABLES.raw} WHERE trade_date >= $1 ORDER BY 1`,
                [FROM],
            )
        ).rows.map((r) => r.stock_code);

    const sum = {
        codes: 0,
        rows: { raw: 0, adj: 0 },
        changedSinceOpen: { raw: 0, adj: 0 }, // 애프터마켓 개시 뒤 — 바뀌는 게 정상
        changedBeforeOpen: { raw: 0, adj: 0 }, // 개시 전 — ka11081 이 옛 값과 다른 줄. 0 이어야 야간 수집이 안전하다
        written: { raw: 0, adj: 0 },
        skippedNoFresh: 0,
        skippedBadClose: 0,
        officialChecked: 0,
        officialMismatch: 0,
    };
    const failed: string[] = [];
    const skippedByCode = new Map<string, number>();
    const mismatches: string[] = [];
    const beforeOpen: string[] = [];

    const skip = (code: string): void => {
        skippedByCode.set(code, (skippedByCode.get(code) ?? 0) + 1);
    };

    const repairOne = async (code: string): Promise<void> => {
        // 받기가 하나라도 실패하면 throw — 이 종목은 아무것도 쓰지 않는다.
        const [rawFresh, adjFresh, rawStored, adjStored, caps] = await Promise.all([
            rawSource.getRawDailyCandles(code, range),
            adjSource.getDailyCandles(code, range),
            readStored("raw", code),
            readStored("adj", code),
            pool.query<{ d: string; close: string }>(
                `SELECT trade_date::text AS d, market_cap / NULLIF(list_shares, 0) AS close
                   FROM market.daily_market_cap WHERE stock_code = $1 AND trade_date >= $2`,
                [code, FROM],
            ),
        ]);
        const toMap = (cs: DailyCandle[]) => new Map(cs.map((c) => [c.date, c.krx]));
        const fresh = { raw: toMap(rawFresh), adj: toMap(adjFresh) };
        const stored = { raw: rawStored, adj: adjStored };
        const official = new Map(caps.rows.map((r) => [r.d, r.close]));

        const updates: { table: Table; date: string; bar: DailyBar }[] = [];
        for (const date of new Set([...rawStored.keys(), ...adjStored.keys()])) {
            // 두 표에 다 있는 날은 함께만 고친다 — 한쪽만 바뀌면 기준가 보정 계수가 어긋난다.
            const present = (["raw", "adj"] as const).filter((t) => stored[t].has(date));
            if (present.some((t) => !fresh[t].has(date))) {
                sum.skippedNoFresh++;
                skip(code);
                continue;
            }
            if (present.some((t) => !(Number(fresh[t].get(date)!.close) > 0))) {
                sum.skippedBadClose++;
                skip(code);
                continue;
            }
            for (const t of present) {
                sum.rows[t]++;
                const bar = fresh[t].get(date)!;
                if (sameKrx(stored[t].get(date)!, bar)) continue;
                if (date >= AFTER_MARKET_OPEN) sum.changedSinceOpen[t]++;
                else {
                    sum.changedBeforeOpen[t]++;
                    const s = stored[t].get(date)!;
                    beforeOpen.push(`${t} ${code}@${date} 저장 ${s.close_krx}/${s.volume_krx} → ${bar.close}/${bar.volume}`);
                }
                updates.push({ table: t, date, bar });
            }
            const off = official.get(date);
            const rawBar = fresh.raw.get(date);
            if (off != null && rawBar) {
                sum.officialChecked++;
                if (Number(off) !== Number(rawBar.close)) {
                    sum.officialMismatch++;
                    mismatches.push(`${code}@${date} 공식 ${off} / ka11081 ${rawBar.close} 거래량 ${rawBar.volume}`);
                }
            }
        }

        if (apply && updates.length > 0) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                for (const u of updates) {
                    await client.query(
                        `UPDATE ${TABLES[u.table]}
                            SET open_krx = $1, high_krx = $2, low_krx = $3, close_krx = $4, volume_krx = $5, amount_krx = $6
                          WHERE stock_code = $7 AND trade_date = $8`,
                        [u.bar.open, u.bar.high, u.bar.low, u.bar.close, u.bar.volume, u.bar.amount, code, u.date],
                    );
                }
                await client.query("COMMIT");
                for (const u of updates) sum.written[u.table]++;
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            } finally {
                client.release();
            }
        }
        sum.codes++;
    };

    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < codes.length) {
            const code = codes[next++];
            try {
                await repairOne(code);
            } catch (err) {
                failed.push(`${code}: ${(err as Error).message}`);
            }
            if (next % 200 === 0) console.log(`… ${next}/${codes.length}`);
        }
    };
    console.log(`${apply ? "적용" : "조회만"} — ${codes.length}종목, ${FROM}~${today}`);
    await Promise.all(Array.from({ length: WORKERS }, worker));

    console.log(JSON.stringify(sum, null, 1));
    if (skippedByCode.size) {
        console.log(`건너뜀(옛 값으로 남음) ${skippedByCode.size}종목:`);
        console.log([...skippedByCode].map(([c, n]) => `${c}:${n}`).join(" "));
    }
    if (beforeOpen.length) console.log(`개시 전 값이 다른 줄 ${beforeOpen.length}개(앞 100개):`, beforeOpen.slice(0, 100));
    if (mismatches.length) console.log(`공식 종가와 다른 줄 ${mismatches.length}개(앞 100개):`, mismatches.slice(0, 100));
    if (failed.length) {
        console.log(`실패 ${failed.length}종목 — --codes 로 다시, 끝날 때까지 캐시는 지우지 않는다:`);
        console.log(failed.join("\n"));
        process.exitCode = 1;
    } else if (apply) {
        console.log(`api 파일 캐시 ${await clearDatedCaches()}개 삭제(${FROM}~) — api 를 다시 켜면 고친 값으로 굽는다`);
    }
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
