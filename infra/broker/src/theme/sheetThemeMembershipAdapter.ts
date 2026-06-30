// infra/broker/theme — Google Sheet 테마 멤버십을 ThemeMembershipProvider 로 구현.
// @tdm/google SheetsClient(OAuth)로 탭을 읽어 헤더별칭 파싱(matrixToObjects) → toCanonical → ThemeMember[].
// 시트/탭 선택은 config(생성자)로만 — 코어 포트는 무인자 load() 유지. market-eye sheetsThemeSource.ts 재구성.
import type { ThemeMember, ThemeMembershipProvider } from "@trade-data-manager/market";
import { matrixToObjects, type AliasMap } from "@trade-data-manager/google/sheets/matrix";
import { toCanonical } from "./codes.js";
import type { ThemeSheetConfig } from "./sheetConfig.js";

/** 어댑터가 시트에서 필요로 하는 최소 표면(테스트 스텁 주입용). @tdm/google SheetsClient 가 구조적으로 만족. */
export interface ThemeSheetSource {
    readMatrix(spreadsheetId: string, tab: string): Promise<string[][]>;
}

// 헤더 별칭 — 사람이 헤더를 조금 달리 써도 잡히게(컬럼순서 무관). quota(표시종목수)는 1차 분류에 불필요라 제외.
const ALIAS: AliasMap = {
    theme: ["테마", "theme"],
    code: ["종목코드", "코드", "code"],
    name: ["종목명", "명", "name"],
    issue: ["편입이슈", "이슈", "issue"],
    date: ["날짜", "date"],
};

export class SheetThemeMembershipAdapter implements ThemeMembershipProvider {
    constructor(
        private readonly source: ThemeSheetSource,
        private readonly config: ThemeSheetConfig,
    ) {}

    async load(): Promise<ThemeMember[]> {
        const rows = await this.source.readMatrix(this.config.spreadsheetId, this.config.tab);
        const objects = matrixToObjects(rows, ALIAS); // 빈 행 skip + 셀 trim 은 여기서 끝남
        const out: ThemeMember[] = [];
        for (const o of objects) {
            const theme = o.theme ?? "";
            const code = toCanonical(o.code ?? "");
            if (!theme || !code) continue; // theme·code 필수(둘 중 하나 비면 무효 행)
            const m: ThemeMember = { theme, code };
            if (o.name) m.name = o.name;
            if (o.issue) m.issue = o.issue;
            if (o.date) m.date = o.date;
            out.push(m);
        }
        return out;
    }
}
