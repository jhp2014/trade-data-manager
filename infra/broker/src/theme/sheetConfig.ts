// 테마 멤버십 시트 좌표. **선택은 앱 레이어의 일** — 어댑터는 이 config 를 생성자로 받기만 한다.
// 코어 포트(ThemeMembershipProvider.load())는 이 타입을 모른다(spreadsheetId/tab 의 infra 누수 방지).
// 런타임 시트 변경 = 이 config 로 어댑터 재생성(앱이 "현재선택" 소유). 동적선택 기계는 앱 생길 때.

export interface ThemeSheetConfig {
    spreadsheetId: string;
    /** 멤버십 탭명(테마|종목코드|종목명|편입이슈|날짜). quota 탭(테마설정)은 안 씀. */
    tab: string;
}

/** 기본 시트 — 커밋 가능(비밀 아님, 접근은 구글계정 공유로 통제). 앱이 생기면 그쪽이 디폴트+선택 UI 소유. */
export const DEFAULT_THEME_SHEET: ThemeSheetConfig = {
    spreadsheetId: "1eOTmtKlMPsS7BrKhijjpCHcb_0c2VYEqbND9jWOqbco",
    tab: "종목분류",
};
