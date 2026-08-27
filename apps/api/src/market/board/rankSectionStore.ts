// 순위 단면 파일 저장소 — 날짜별 `{date}.json` 의 저수준 read/write/remove/listDates 만.
// (대사·증분·조립은 RankSections. axisValueStore 와 같은 결 — 파일 I/O 를 떼어 테스트가 in-memory fake 주입.)
//
// gzip 안 쓴다 — 날짜당 ~수십 KB(day-snapshot 의 1/500)라 평문이 낫고, 눈으로 까볼 수 있다.
// 응답 회선은 어차피 main.ts 의 compression() 이 눌러 준다.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RankSection } from "@trade-data-manager/market";

const CACHE_ROOT = process.env.RANK_SECTION_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/rank-section");

/** 파일 스키마 버전(파일 모양). 계산 규칙 변경은 RANK_SECTION_CALC_VERSION(rankSections.ts) 쪽. */
export const RANK_SECTION_FILE_VERSION = 1;

/** 날짜 하나의 단면 파일 — 굳은(sealed) 날짜만 파일이 된다(미완료 날짜는 메모리 서빙뿐). */
export interface RankSectionFile {
    v: number; // RANK_SECTION_FILE_VERSION
    /** 구운 시점의 계산 규칙 버전 — CALC_VERSION 과 다르면 통째 무효. */
    version: number;
    date: string;
    /** 그날 유니버스(스냅샷 순서) — 단면들의 서수 배열이 전부 이 순서를 탄다. */
    codes: string[];
    sections: RankSection[];
}

export interface RankSectionStore {
    read(date: string): Promise<RankSectionFile | null>;
    write(file: RankSectionFile): Promise<void>;
    remove(date: string): Promise<void>;
    /** 저장된 날짜 전부 — 대사(GC)의 저장집합. */
    listDates(): Promise<string[]>;
}

const filePath = (date: string): string => path.join(CACHE_ROOT, `${date}.json`);

export const fileRankSectionStore: RankSectionStore = {
    async read(date) {
        try {
            const parsed = JSON.parse(await fs.readFile(filePath(date), "utf8")) as RankSectionFile;
            return parsed.v === RANK_SECTION_FILE_VERSION ? parsed : null; // 구스키마 = miss(재빌드가 자가치유)
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
            console.warn(`[rank-section] 캐시 읽기 실패, 재빌드: ${filePath(date)}`, err);
            return null;
        }
    },
    async write(file) {
        await fs.mkdir(CACHE_ROOT, { recursive: true });
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
            const names = await fs.readdir(CACHE_ROOT);
            return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5));
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw err;
        }
    },
};
