// 자동 타점 격자 파일 저장소 — 날짜별 `{date}.json` 의 저수준 read/write/remove/listDates 만.
// (대사·지문 증분·GC 는 PointGrids. rankSectionStore 와 같은 결 — 파일 I/O 를 떼어 테스트가 fake 주입.)
//
// 파일 낟알 = **날짜**, 무효화 낟알 = **차트별 지문(f)** — 차트당 파일이면 6천 개가 흩어지고(GC 비용),
// 날짜당 지문이면 기준선 하나 고칠 때 그날 ~21개 차트가 전부 다시 구워진다. 그래서 둘을 가른다.
// gzip 안 쓴다 — 눈으로 까볼 수 있는 평문. 총량이 문제로 실측되면(recon 01-grid-scale) 그때 재검토.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PointGrid } from "@trade-data-manager/market";

/** 파일 스키마 버전(파일 모양). 검출 규칙 변경은 POINT_GRID_CALC_VERSION(pointGrids.ts) 쪽. */
export const POINT_GRID_FILE_VERSION = 7; // 7: 2026-09-02 대금 창(legAmount·renewalAmount) 폐기 → 기록 봉 누적(cum)·크로싱 봉(cross)·터치 봉(touch) 수록
// 6: 2026-09-02 KRX 기준가(prevBaseKrx) 수록
// 5: 2026-09-01 그날 기준가(prevBase) 수록
// 4: 2026-08-31 zigzag 재정식화 — 피벗에 renewalAmount 추가, 저점 confirmedMin null 고정
// (기준은 봉투 모양이 아니라 파일 내용의 의미 — decisions.md 버전 규칙).

/** 차트 하나의 캐시 항목 — f = 기준선 앵커 지문(불일치 시 그 차트만 재굽기). */
export interface PointGridEntry {
    f: string;
    grid: PointGrid;
}

export interface PointGridFile {
    v: number; // POINT_GRID_FILE_VERSION
    /** 구운 시점의 검출 규칙 버전 — CALC_VERSION 과 다르면 통째 무효. */
    version: number;
    date: string;
    /** stockCode → 항목. */
    charts: Record<string, PointGridEntry>;
}

export interface GridStore {
    read(date: string): Promise<PointGridFile | null>;
    write(file: PointGridFile): Promise<void>;
    remove(date: string): Promise<void>;
    /** 저장된 날짜 전부 — 대사(GC)의 저장집합. */
    listDates(): Promise<string[]>;
}

/**
 * 파일 저장소. root 를 인자로 받는 팩토리인 이유: recon 이 A/B 실측 때 임시 루트로 돌려
 * 실캐시를 오염시키지 않기 위해서다(env POINT_GRID_CACHE_DIR 는 서버 기동용 기본값).
 */
export function fileGridStore(
    root: string = process.env.POINT_GRID_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/point-grid"),
): GridStore {
    const filePath = (date: string): string => path.join(root, `${date}.json`);
    return {
        async read(date) {
            try {
                const parsed = JSON.parse(await fs.readFile(filePath(date), "utf8")) as PointGridFile;
                return parsed.v === POINT_GRID_FILE_VERSION ? parsed : null; // 구스키마 = miss(재굽기가 자가치유)
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
                console.warn(`[point-grid] 캐시 읽기 실패, 재굽기: ${filePath(date)}`, err);
                return null;
            }
        },
        async write(file) {
            await fs.mkdir(root, { recursive: true });
            const fp = filePath(file.date);
            const tmp = `${fp}.tmp`;
            await fs.writeFile(tmp, JSON.stringify(file), "utf8");
            await fs.rename(tmp, fp); // 원자적 교체 — 부분 파일이 남지 않게
        },
        async remove(date) {
            await fs.rm(filePath(date), { force: true });
        },
        async listDates() {
            try {
                const names = await fs.readdir(root);
                return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5));
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
                throw err;
            }
        },
    };
}
