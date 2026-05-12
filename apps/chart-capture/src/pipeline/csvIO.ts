import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { normalizeTradeDate } from "../lib/dateNormalize";
import { parseLineColumns } from "../lib/lines";
import type { CaptureConfig } from "../../capture.config";
import type { CaptureCsvRow, ParsedCsv } from "../types/capture";

export async function listCsvFiles(inputDir: string): Promise<string[]> {
    let entries: string[];
    try {
        entries = await fs.readdir(inputDir);
    } catch {
        return [];
    }
    return entries
        .filter((e) => e.toLowerCase().endsWith(".csv"))
        .map((e) => path.join(inputDir, e));
}

export async function parseCsvFile(
    filePath: string,
    config: Pick<CaptureConfig, "lineColors">,
): Promise<ParsedCsv> {
    const content = await fs.readFile(filePath, "utf-8");
    const rawRows: Record<string, string>[] = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    const rows: CaptureCsvRow[] = [];
    const errors: ParsedCsv["errors"] = [];

    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const lineNum = i + 2; // 헤더가 1행

        const stockCode = (raw["stockCode"] ?? raw["stock_code"] ?? "").replace(/^'/, "");
        if (!/^\d{6}$/.test(stockCode)) {
            errors.push({ line: lineNum, message: `stockCode 형식 오류: "${stockCode}"` });
            continue;
        }

        const rawDate = raw["tradeDate"] ?? raw["trade_date"] ?? "";
        const tradeDate = normalizeTradeDate(rawDate);
        if (!tradeDate) {
            errors.push({ line: lineNum, message: `tradeDate 형식 오류: "${rawDate}"` });
            continue;
        }

        const { lines, parseError } = parseLineColumns(raw, config);
        if (parseError) {
            errors.push({ line: lineNum, message: parseError });
            continue;
        }

        rows.push({ stockCode, tradeDate, lines });
    }

    const { deduped, duplicateCount } = dedupeRows(rows);
    return { rows: deduped, errors, duplicateCount };
}

function dedupeRows(rows: CaptureCsvRow[]): {
    deduped: CaptureCsvRow[];
    duplicateCount: number;
} {
    const seen = new Set<string>();
    const deduped: CaptureCsvRow[] = [];
    let duplicateCount = 0;
    for (const row of rows) {
        const key = `${row.stockCode}|${row.tradeDate}`;
        if (seen.has(key)) {
            duplicateCount++;
        } else {
            seen.add(key);
            deduped.push(row);
        }
    }
    return { deduped, duplicateCount };
}

export async function moveCsvFile(
    filePath: string,
    targetDir: string,
    sidecarContent?: { ext: string; content: string },
): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
    const destName = path.basename(filePath);
    const destPath = path.join(targetDir, destName);

    await fs.rename(filePath, destPath);

    if (sidecarContent) {
        const sidecarPath = destPath + sidecarContent.ext;
        await fs.writeFile(sidecarPath, sidecarContent.content, "utf-8");
    }
}

export function buildSidecarLog(
    lines: Array<{ rowDesc: string; reason: string }>,
): string {
    return lines.map((l) => `[${l.rowDesc}] ${l.reason}`).join("\n") + "\n";
}
