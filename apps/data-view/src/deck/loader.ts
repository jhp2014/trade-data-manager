import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { DeckEntry, LoadedDecks } from "./types";
import { makeEntryKey } from "./types";

const REQUIRED_COLUMNS = ["stockCode", "tradeDate", "tradeTime"] as const;
const PRICE_LINE_PREFIX = "line_";

/**
 * 지정 디렉토리 내의 모든 *.csv 파일을 로드해 하나의 LoadedDecks로 통합.
 * (stockCode, tradeDate, tradeTime) 기준 중복 제거 — 먼저 등장한 행 유지.
 * 컬럼명이 "line_"로 시작하면 optionKeys가 아닌 priceLineKeys로 분리 (ADR-015).
 */
export async function loadDecksFromDir(absoluteDir: string): Promise<LoadedDecks> {
    const stat = await fs.stat(absoluteDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
        throw new Error(`[loadDecksFromDir] Directory not found: ${absoluteDir}`);
    }

    const csvFiles = await findCsvFiles(absoluteDir);
    if (csvFiles.length === 0) {
        return { entries: [], optionKeys: [], priceLineKeys: [], files: [], duplicateCount: 0 };
    }

    const allEntries: DeckEntry[] = [];
    const optionKeySet = new Set<string>();
    const priceLineKeySet = new Set<string>();

    for (const file of csvFiles) {
        const { entries, optionKeys, priceLineKeys } = await loadOneCsv(file);
        for (const e of entries) allEntries.push(e);
        for (const k of optionKeys) optionKeySet.add(k);
        for (const k of priceLineKeys) priceLineKeySet.add(k);
    }

    const { deduped, duplicateCount } = dedupeEntries(allEntries);

    return {
        entries: deduped,
        optionKeys: Array.from(optionKeySet).sort(),
        priceLineKeys: Array.from(priceLineKeySet).sort(),
        files: csvFiles,
        duplicateCount,
    };
}

/* ===========================================================
 * 내부 함수
 * =========================================================== */

function isCommentColumn(header: string): boolean {
    return header.startsWith("_");
}

async function findCsvFiles(dir: string): Promise<string[]> {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const result: string[] = [];
    for (const item of items) {
        if (item.isFile() && item.name.toLowerCase().endsWith(".csv")) {
            result.push(path.join(dir, item.name));
        }
    }
    return result.sort();
}

async function loadOneCsv(filePath: string): Promise<{
    entries: DeckEntry[];
    optionKeys: string[];
    priceLineKeys: string[];
}> {
    const raw = await fs.readFile(filePath, "utf-8");

    const parsed = Papa.parse<Record<string, string>>(raw, {
        header: true,
        skipEmptyLines: true,
        transform: (v) => v.trim(),
    });

    if (parsed.errors.length > 0) {
        const msg = parsed.errors
            .slice(0, 3)
            .map((e) => `  row ${e.row}: ${e.message}`)
            .join("\n");
        throw new Error(`[loadOneCsv] Parse errors in ${filePath}:\n${msg}`);
    }

    const headers = parsed.meta.fields ?? [];
    validateHeaders(headers, filePath);

    const dataColumns = headers.filter(
        (h) => !REQUIRED_COLUMNS.includes(h as any) && !isCommentColumn(h)
    );
    const priceLineKeys = dataColumns.filter((h) => h.startsWith(PRICE_LINE_PREFIX));
    const optionKeys = dataColumns.filter((h) => !h.startsWith(PRICE_LINE_PREFIX));

    const entries: DeckEntry[] = [];
    parsed.data.forEach((row, idx) => {
        const stockCode = row.stockCode ?? "";
        const tradeDate = row.tradeDate ?? "";
        const tradeTime = row.tradeTime ?? "";

        if (!stockCode || !tradeDate || !tradeTime) {
            throw new Error(
                `[loadOneCsv] Missing required field in ${filePath} row ${idx + 2}: ` +
                `stockCode="${stockCode}", tradeDate="${tradeDate}", tradeTime="${tradeTime}"`
            );
        }

        const options: Record<string, string> = {};
        for (const k of optionKeys) {
            options[k] = (row[k] ?? "").trim();
        }

        const priceLines: Record<string, number[]> = {};
        for (const k of priceLineKeys) {
            const raw = (row[k] ?? "").trim();
            if (!raw) continue;
            const nums = raw.split("|")
                .map((s) => parseFloat(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
            if (nums.length > 0) priceLines[k] = nums;
        }

        entries.push({
            stockCode,
            tradeDate,
            tradeTime,
            options,
            priceLines,
            sourceFile: filePath,
        });
    });

    return { entries, optionKeys, priceLineKeys };
}

function validateHeaders(headers: string[], filePath: string): void {
    for (const required of REQUIRED_COLUMNS) {
        if (!headers.includes(required)) {
            throw new Error(
                `[loadOneCsv] Missing required column "${required}" in ${filePath}. ` +
                `Headers: [${headers.join(", ")}]`
            );
        }
    }
}

function dedupeEntries(entries: DeckEntry[]): {
    deduped: DeckEntry[];
    duplicateCount: number;
} {
    const seen = new Map<string, DeckEntry>();
    let duplicates = 0;
    for (const e of entries) {
        const key = makeEntryKey(e);
        if (seen.has(key)) {
            duplicates++;
        } else {
            seen.set(key, e);
        }
    }
    return { deduped: Array.from(seen.values()), duplicateCount: duplicates };
}
