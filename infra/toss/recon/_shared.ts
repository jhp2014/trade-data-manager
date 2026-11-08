// 토스 API 정찰(recon) 공용 유틸. 실제 API 를 때려 원시 응답을 logs/raw-samples 에 적재 → 사람/AI 검수용.
// 정본 패턴: infra/dart/recon/_shared.ts. 문서 믿지 말고 실측한다.
//
// ⚠ recon 은 DB 에 쓰지 않는다. 우리 데이터와의 대조는 lab-api(읽기 전용)를 통해서만 한다.
// ⚠ 키 하나에 유효 토큰은 하나다 — 정찰을 동시에 돌리면 서로의 토큰을 죽인다. 한 번에 하나씩 돌릴 것.
//
// 실측 요약(2026-11-07):
// · 1분봉 바닥 = 2022-11-23, 그 전날부터 0봉(표본 전부 — 상장 뒤 종목은 상장일까지). 원주가·수정주가 바닥 같음. 토큰 수명 약 24시간.
// · 커서 = 다음 봉 시각이라 페이지가 겹치지 않는다. 값은 문자열.
// · 무거래 분을 거래량 0 평탄봉으로 채워 준다 — 옛 날짜도 지금 NXT 종목이면 08:01~20:00 720봉, 아니면 09:01~15:30 390봉. 체결은 volume>0 만.
// · adjusted=false 는 옛 날짜(바닥 포함)도 진짜 원주가다(086520 2024 액분 앞뒤 확인).
// · 2023-02-10 은 1분봉 거래량이 깨져 있다(전 시장, 거래량 = |종가 − 전일 종가|, 무거래 분에도 양수) — 토스 일봉은 정상.
//   그래서 그날은 적재하지 않는다(broker TOSS_BROKEN_MINUTE_DATES — 어댑터가 거절하고 ingest 가 건너뛴다).
// · NXT 봉은 **지금** NXT 종목에게만 준다 — 그때 NXT 에서 거래됐어도 지금 빠진 종목은 KRX 체결만 온다(2025-03~06 에 276종목).
import fs from "node:fs";
import path from "node:path";
import { createToss, kstOf, TossError, type Toss, type TossCandle, type TossDayCandle } from "../src/index.js";
export { assertAdvances, kstOf } from "../src/index.js";

export function makeToss(): Toss {
    return createToss();
}

export const OUTPUT_DIR = path.resolve(process.cwd(), "logs/raw-samples");

/** 결과 JSON 을 저장하고 경로를 돌려준다. */
export function saveJson(name: string, value: unknown): string {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, name);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
    return filePath;
}

/** 쉼표로 묶인 인자 → 배열. 비었으면 기본값. */
export function listArg(index: number, fallback: string[]): string[] {
    const raw = process.argv[index];
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
}

/** 그날 KST 의 끝 — before 는 이 시각을 포함해 그 이전 봉을 준다. */
export const endOfDay = (date: string): string => `${date}T23:59:59+09:00`;

/** "HH:MM:SS" → 그날 0시부터의 분. */
export const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const num = (v: string | number): number => Number(v);

export type DayBar = TossDayCandle;

/** 하루치 1분봉(시간 오름차순) — 재는 쪽이라 채움 봉까지 그대로 준다. */
export async function fetchDayMinutes(
    toss: Toss,
    code: string,
    date: string,
    adjusted: boolean,
): Promise<{ bars: DayBar[]; pages: number; duplicates: number }> {
    const r = await toss.rest.getMinuteCandlesForDate(code, date, { adjusted });
    return { bars: r.candles, pages: r.pages, duplicates: r.duplicates };
}

/** 그날의 일봉 하나. 그날 거래가 없으면 null. */
export async function fetchDayCandle(toss: Toss, code: string, date: string, adjusted: boolean): Promise<TossCandle | null> {
    const page = await toss.rest.getCandles({ symbol: code, interval: "1d", count: 1, before: endOfDay(date), adjusted });
    const c = page.candles[0];
    return c && kstOf(c.timestamp).date === date ? c : null;
}

/** 오류를 값으로 — 경계 탐색에서 한 지점의 실패가 나머지를 막지 않게. */
export async function attempt<T>(run: () => Promise<T>): Promise<{ ok: T } | { error: unknown }> {
    try {
        return { ok: await run() };
    } catch (err) {
        if (err instanceof TossError) return { error: err.meta ?? err.message };
        throw err;
    }
}

export function handleError(err: unknown): never {
    console.error("\n정찰 실패");
    if (err instanceof Error) {
        console.error("Message:", err.message);
        const anyErr = err as { meta?: unknown };
        if (anyErr.meta) console.error("Meta:", JSON.stringify(anyErr.meta).slice(0, 2000));
    } else {
        console.error("알 수 없는 오류");
    }
    process.exit(1);
}
