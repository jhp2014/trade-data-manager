import { parseSheetCaseIds } from "@/lib/sheetParse";
import type { WorkingSetSource } from "./WorkingSetSource";

export type SheetConfig = {
    spreadsheetId: string;
    tab: string;
};

/** 시트 탭에서 원본 매트릭스를 읽어오는 함수(transport). 테스트에서 가짜 주입 가능. */
export type SheetReader = (spreadsheetId: string, tab: string) => Promise<string[][]>;

/**
 * 시트를 워킹셋 소스로 쓴다 — caseId 집합만 제공(값은 ReviewCaseSource 가 enrich).
 * transport(googleapis)는 주입받아 이 파일이 googleapis 에 직접 의존하지 않는다.
 */
export class SheetWorkingSetSource implements WorkingSetSource {
    constructor(
        private readonly config: SheetConfig,
        private readonly read: SheetReader,
    ) {}

    async listCaseIds(): Promise<string[]> {
        const values = await this.read(this.config.spreadsheetId, this.config.tab);
        return parseSheetCaseIds(values);
    }
}
