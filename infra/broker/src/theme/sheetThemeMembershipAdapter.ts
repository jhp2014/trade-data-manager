// infra/broker/theme — Google Sheet 테마 멤버십을 ThemeMembershipProvider(읽기)+ThemeMembershipStore(쓰기) 로 구현.
// @tdm/google SheetsClient(OAuth)로 탭을 읽어 헤더별칭 파싱(matrixToObjects) → toCanonical → ThemeMember[].
// 쓰기는 헤더행을 읽어 컬럼을 맞춘 뒤 1행 append(컬럼순서 무관). 시트/탭 선택은 config(생성자)로만 —
// 코어 포트는 무인자 load()/addMember() 유지. market-eye sheetsThemeSource.ts 재구성.
import type { ThemeMember, ThemeMembershipProvider, ThemeMembershipStore } from "@trade-data-manager/market";
import { matrixToObjects, headerIndexMap, type AliasMap } from "@trade-data-manager/google/sheets/matrix";
import { toCanonical } from "./codes.js";
import type { ThemeSheetConfig } from "./sheetConfig.js";

/** 어댑터가 시트에서 필요로 하는 최소 표면(테스트 스텁 주입용). @tdm/google SheetsClient 가 구조적으로 만족. */
export interface ThemeSheetSource {
    readMatrix(spreadsheetId: string, tab: string): Promise<string[][]>;
    appendRows(input: { spreadsheetId: string; tab: string; rows: string[][]; headers?: string[] }): Promise<unknown>;
}

// 헤더 별칭 — 사람이 헤더를 조금 달리 써도 잡히게(컬럼순서 무관). quota(표시종목수)는 1차 분류에 불필요라 제외.
const ALIAS: AliasMap = {
    theme: ["테마", "theme"],
    code: ["종목코드", "코드", "code"],
    name: ["종목명", "명", "name"],
    issue: ["편입이슈", "이슈", "issue"],
    date: ["날짜", "date"],
};

// 빈 탭에 첫 write 시 초기화할 기본 헤더(sheetConfig 주석의 표준 컬럼 순서).
const DEFAULT_HEADER = ["테마", "종목코드", "종목명", "편입이슈", "날짜"];

export class SheetThemeMembershipAdapter implements ThemeMembershipProvider, ThemeMembershipStore {
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

    /**
     * 테마 멤버 1행 append. 기존 헤더행을 읽어 컬럼 위치를 맞추므로(빈 탭이면 DEFAULT_HEADER) 시트 컬럼 순서와 무관.
     * code 는 read 와 대칭으로 toCanonical(시트를 표준 6자리로 유지). 중복((theme,code)) 차단은 상위(앱)의 몫.
     */
    async addMember(member: ThemeMember): Promise<void> {
        const theme = member.theme.trim();
        const code = toCanonical(member.code);
        if (!theme || !code) throw new Error("테마 배정: theme·code 필수");

        const rows = await this.source.readMatrix(this.config.spreadsheetId, this.config.tab);
        const header = rows[0]?.length ? rows[0] : DEFAULT_HEADER;
        const idx = headerIndexMap(header, ALIAS);
        if (idx.theme == null || idx.code == null) {
            throw new Error(`'${this.config.tab}' 탭에 '테마'/'종목코드' 헤더 필요`);
        }

        const row = new Array<string>(header.length).fill("");
        row[idx.theme] = theme;
        row[idx.code] = code;
        if (idx.name != null && member.name) row[idx.name] = member.name;
        if (idx.issue != null && member.issue) row[idx.issue] = member.issue;
        if (idx.date != null && member.date) row[idx.date] = member.date;

        await this.source.appendRows({ spreadsheetId: this.config.spreadsheetId, tab: this.config.tab, rows: [row], headers: header });
    }
}
