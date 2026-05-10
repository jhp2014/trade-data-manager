import path from "path";

const SAFE_REPLACE = /[/\\:*?"<>|]/g;

export function sanitizeStockName(name: string, maxLength: number): string {
    const nfc = name.normalize("NFC");
    const safe = nfc.replace(SAFE_REPLACE, "_").trim();
    if (safe.length <= maxLength) return safe;
    return safe.slice(0, maxLength);
}

export function formatTradeDate(yyyyMmDd: string, format: string): string {
    const [y, m, d] = yyyyMmDd.split("-");
    return format
        .replace("YYYY", y)
        .replace("MM", m)
        .replace("DD", d);
}

export function buildOutputPath(params: {
    template: string;
    outputDir: string;
    tradeDate: string;
    dateFormat: string;
    stockCode: string;
    stockName: string;
    variant: "KRX" | "NXT";
    stockNameMaxLength: number;
}): string {
    const filename = params.template
        .replace("{tradeDate}", formatTradeDate(params.tradeDate, params.dateFormat))
        .replace("{stockCode}", params.stockCode)
        .replace("{stockName}", sanitizeStockName(params.stockName, params.stockNameMaxLength))
        .replace("{variant}", params.variant);
    return path.join(params.outputDir, filename);
}
