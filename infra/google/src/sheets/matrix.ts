// 순수 매트릭스 헬퍼 — 네트워크/도메인 무지. googleapis 를 import 하지 않는다.
// 별칭 맵(키→허용 헤더명)을 인자로 받아 매트릭스 ↔ 객체를 변환한다(컬럼 순서 무관).

/** 키 → 허용 헤더명 목록. 예: { code: ["종목코드","코드","code"] } */
export type AliasMap = Record<string, string[]>;

function norm(s: string | undefined): string {
    return (s ?? "").trim().toLowerCase();
}

function isBlankRow(row: string[]): boolean {
    return row.every((v) => !(v ?? "").trim());
}

/**
 * 헤더 행에서 각 alias 키의 컬럼 인덱스를 찾는다(trim/대소문자 무시).
 * 매칭되는 헤더가 없는 키는 결과에서 빠진다. 컬럼 순서와 무관.
 */
export function headerIndexMap(header: string[], aliases: AliasMap): Record<string, number> {
    const normalized = header.map(norm);
    const out: Record<string, number> = {};
    for (const [key, names] of Object.entries(aliases)) {
        for (const name of names) {
            const i = normalized.indexOf(norm(name));
            if (i !== -1) {
                out[key] = i;
                break;
            }
        }
    }
    return out;
}

/**
 * 헤더행 + 데이터행 매트릭스를 alias 키로 매핑한 객체 배열로. 데이터 행 하나 → 객체 하나.
 * 빈 행은 건너뛰고 셀 값은 trim 한다. (헤더만 있거나 빈 매트릭스면 [])
 */
export function matrixToObjects(rows: string[][], aliases: AliasMap): Record<string, string>[] {
    if (rows.length < 2) return [];
    const idx = headerIndexMap(rows[0], aliases);
    const keys = Object.keys(idx);
    const out: Record<string, string>[] = [];
    for (const row of rows.slice(1)) {
        if (isBlankRow(row)) continue;
        const obj: Record<string, string> = {};
        for (const key of keys) {
            obj[key] = (row[idx[key]] ?? "").trim();
        }
        out.push(obj);
    }
    return out;
}

export interface ColumnSpec {
    /** 객체에서 읽을 키. */
    key: string;
    /** 시트에 쓸 헤더명. */
    header: string;
}

/**
 * 객체 배열을 헤더행 + 데이터행 매트릭스로(쓰기용). columns 순서가 곧 컬럼 순서.
 * 객체에 없는 키는 빈 문자열로 채운다.
 */
export function objectsToMatrix(objects: Record<string, string>[], columns: ColumnSpec[]): string[][] {
    const header = columns.map((c) => c.header);
    const rows = objects.map((obj) => columns.map((c) => obj[c.key] ?? ""));
    return [header, ...rows];
}
