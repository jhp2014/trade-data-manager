// DART API 정찰(recon) 공용 유틸. 실제 API 를 때려 원시 응답을 logs/raw-samples 에 적재 → 사람/AI 검수용.
// 정본 패턴: infra/krx/recon/_shared.ts. 문서 믿지 말고 실측한다.
//
// ⚠ recon 은 DB 를 보지 않는다. 우리 DB 와의 대조는 코드 목록을 파일로 받아 한다.
// ⚠ 인증키는 src 안에서만 쿼리에 붙는다 — request 로그에 키를 넣지 않는다.
import fs from "node:fs";
import path from "node:path";
import { createDart, silentLogger, type Dart, type DartCorpCode, type DartDisclosure } from "../src/index.js";

export function makeDart(): Dart {
    return createDart({ logger: silentLogger });
}

export const OUTPUT_DIR = path.resolve(process.cwd(), "logs/raw-samples");

export function ensureOutputDir(): void {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/** 결과 JSON 을 고정 이름으로 저장(다음 정찰이 읽는다). */
export function saveJson(name: string, value: unknown): string {
    ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, name);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
    return filePath;
}

const CORP_CACHE = "corp-codes.json";

/** 01 이 저장한 법인 목록을 읽는다. 없으면 받아 저장한다(큰 zip 을 스크립트마다 다시 받지 않게). */
export async function loadCorpCodes(dart: Dart): Promise<DartCorpCode[]> {
    const filePath = path.join(OUTPUT_DIR, CORP_CACHE);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DartCorpCode[];
    }
    const corps = await dart.rest.getCorpCodes();
    saveJson(CORP_CACHE, corps);
    return corps;
}

const filingsName = (stockCode: string): string => `filings-${stockCode}.json`;

export function saveFilings(stockCode: string, filings: DartDisclosure[]): string {
    return saveJson(filingsName(stockCode), filings);
}

/** 02 가 저장한 공시 목록. */
export function loadFilings(stockCode: string): DartDisclosure[] {
    const filePath = path.join(OUTPUT_DIR, filingsName(stockCode));
    if (!fs.existsSync(filePath)) {
        throw new Error(`${filePath} 가 없다 — recon:filings ${stockCode} 를 먼저 돌릴 것`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DartDisclosure[];
}

/** 오늘 날짜 YYYYMMDD. */
export function today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 값 분포 세기 — 많은 순. */
export function dist<T>(rows: T[], pick: (r: T) => string): [string, number][] {
    const m = new Map<string, number>();
    for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
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
