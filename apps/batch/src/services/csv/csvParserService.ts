// services/csv/csvParserService.ts
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { logger } from "../../utils/logger.js";

export interface GroupedTarget {
    stockName: string;
    themes: Set<string>;
}

export interface ParsedCsvResult {
    tradeDate: string;                       // 'YYYY-MM-DD'
    targets: Map<string, GroupedTarget>;     // key: stockCode
}

/**
 * 파일명에서 거래일을 추출하고, CSV를 종목 단위로 그룹핑합니다.
 * 파일명 규칙: 'YYYY-MM-DD.csv'
 */
export function parseCsvFile(filePath: string): ParsedCsvResult {
    const tradeDate = extractTradeDate(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    const targets = groupByStock(content);
    return { tradeDate, targets };
}

function extractTradeDate(filePath: string): string {
    const fileName = path.basename(filePath, ".csv");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fileName)) {
        throw new Error(`파일명이 날짜 형식이 아닙니다: ${fileName}`);
    }
    return fileName;
}

function groupByStock(csvContent: string): Map<string, GroupedTarget> {
    const stockMap = new Map<string, GroupedTarget>();

    const { data, errors } = Papa.parse<string[]>(csvContent, {
        header: false,
        skipEmptyLines: true,
    });

    if (errors.length > 0) {
        logger.warn(`[CsvParser] CSV 파싱 경고 ${errors.length}건`);
    }

    for (let i = 1; i < data.length; i++) {
        const columns = data[i].map((c) => c.trim().replace(/^'/, ""));
        if (columns.length < 3) continue;

        const [themeRaw, code, name] = columns;
        if (!code || !name) continue;

        if (!stockMap.has(code)) {
            stockMap.set(code, { stockName: name, themes: new Set() });
        }
        if (themeRaw) {
            stockMap.get(code)!.themes.add(themeRaw);
        }
    }

    return stockMap;
}
