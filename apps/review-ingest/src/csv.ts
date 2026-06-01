import Papa from "papaparse";

export type CsvRow = Record<string, string>;

export function parseCsvRows(content: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(stripBom(content), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => stripBom(header).trim(),
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error at row ${first.row}: ${first.message}`);
  }

  return parsed.data.filter((row) => !isBlankRow(row));
}

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function isBlankRow(row: CsvRow) {
  return Object.values(row).every((value) => value.trim().length === 0);
}
