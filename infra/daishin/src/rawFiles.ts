// 대신 원천 분봉 파일 — 수집기(collector/dump.ps1)가 쓰고 broker 어댑터가 읽는 계약.
//
// 배치: <rawDir>/<YYYY-MM-DD>/<종목코드>.csv  — 종목-날 하나 = 파일 하나. 파일이 있으면 그 종목-날은 다 받은 것이다
//       (수집기는 .part 로 쓰고 끝나면 이름을 바꾼다). 수집 대상 목록 = <rawDir>/targets.csv (code,YYYY-MM-DD).
// 내용: '#' 줄 = 출처 메모(무시), 머리줄 `mkt,end,open,high,low,close,volume,amount`, 그 뒤 봉.
//       mkt = K(KRX) · N(NXT) — 대신 StockChart 입력 12. end = 봉 **끝** 시각 HHMM(901 = 09:00 봉). 값은 받은 그대로(원주가).
//       amount 는 대신이 봉마다 만 원 단위로 내려 준 값이라 쓰지 않는다(우리 대금은 OHLC·거래량에서 계산한다) — 보관만.
import fs from "node:fs/promises";
import path from "node:path";

export type DaishinMarket = "K" | "N";

export interface DaishinBar {
    /** 봉 끝 시각 HHMM 정수(901 = 09:00~09:01 봉). */
    end: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    amount: string;
}

/** 한 종목-날의 원천 봉 — 시장별, 받은 순서 그대로(정렬 보장 없음). */
export interface DaishinMinuteDay {
    krx: DaishinBar[];
    nxt: DaishinBar[];
}

export interface StockDayRef {
    stockCode: string;
    date: string;
}

export const RAW_HEADER = "mkt,end,open,high,low,close,volume,amount";
export const TARGETS_FILE = "targets.csv";

/** 원천 파일 한 개를 읽는다. 형식이 어긋나면 조용히 버리지 않고 실패한다. */
export function parseMinuteDayFile(text: string, label: string): DaishinMinuteDay {
    const day: DaishinMinuteDay = { krx: [], nxt: [] };
    let headerSeen = false;
    for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        if (!headerSeen) {
            if (line !== RAW_HEADER) throw new Error(`${label}: 머리줄이 다르다 (${line})`);
            headerSeen = true;
            continue;
        }
        const cols = line.split(",");
        if (cols.length !== 8) throw new Error(`${label}: 열 수가 8이 아니다 (${line})`);
        const [mkt, end, open, high, low, close, volume, amount] = cols;
        if (mkt !== "K" && mkt !== "N") throw new Error(`${label}: 시장이 K·N 이 아니다 (${line})`);
        if (![end, open, high, low, close, volume, amount].every((v) => /^\d+$/.test(v))) {
            throw new Error(`${label}: 수치가 아닌 칸이 있다 (${line})`);
        }
        (mkt === "K" ? day.krx : day.nxt).push({ end: Number(end), open, high, low, close, volume, amount });
    }
    if (!headerSeen) throw new Error(`${label}: 머리줄이 없다`);
    return day;
}

export interface DaishinRaw {
    readonly dir: string;
    /** 그 종목-날 원천 파일 경로. */
    dayFilePath(stockCode: string, date: string): string;
    /** 원천 봉. 아직 안 받은 종목-날이면 null. */
    readMinuteDay(stockCode: string, date: string): Promise<DaishinMinuteDay | null>;
    /** 수집 대상 목록을 쓴다(덮어쓰기) — 수집기가 이 파일을 읽는다. 경로를 돌려준다. */
    writeTargets(targets: readonly StockDayRef[]): Promise<string>;
}

export function createDaishinRaw(dir: string): DaishinRaw {
    const dayFilePath = (stockCode: string, date: string): string => path.join(dir, date, `${stockCode}.csv`);
    return {
        dir,
        dayFilePath,
        async readMinuteDay(stockCode, date) {
            const file = dayFilePath(stockCode, date);
            let text: string;
            try {
                text = await fs.readFile(file, "utf8");
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
                throw err;
            }
            return parseMinuteDayFile(text, `${stockCode} ${date}`);
        },
        async writeTargets(targets) {
            await fs.mkdir(dir, { recursive: true });
            const file = path.join(dir, TARGETS_FILE);
            await fs.writeFile(file, targets.map((t) => `${t.stockCode},${t.date}`).join("\n") + "\n", "utf8");
            return file;
        },
    };
}
