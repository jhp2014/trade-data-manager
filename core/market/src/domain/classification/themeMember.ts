// core/market/domain — 정적 테마 멤버십(정체성 레이어). Google Sheet(테마↔종목)의 한 행 = 1 ThemeMember.
// 당일 드라이버(촉매)는 dailyIssue.ts, 여기엔 "이 종목이 어느 테마에 속하나"라는 준정적 정체성만.
// 순수 모델(외부 import 0). 시트 파싱·정규화(toCanonical)는 어댑터 경계의 몫 — 여기 도달하면 깨끗한 6자리 code.

/**
 * 시트 멤버십 한 행. issue(편입이슈)·date(편입일)는 1차 분류에 안 쓰지만(seed=테마명) 파싱해 보존만 한다.
 */
export interface ThemeMember {
    theme: string;
    code: string;
    name?: string;
    issue?: string; // 편입이슈 — 보존만(분류 seed로는 미사용)
    date?: string; // 편입일 YYYY-MM-DD — 보존만
}

/**
 * 양방향 테마 인덱스. flat ThemeMember[] 위 도메인 순수함수가 한 번의 패스로 두 방향을 동시에 채운다
 * (랭킹·join 과 같은 "flat 위 메모리 변환, 저장X" 철학). 빌드 1회 후 룩업만.
 *
 * **무엇 위에 빌드되나는 호출자(서비스)가 정한다** — 인덱스 자체는 universe 를 모른다.
 * 1차 분류기는 당일 universe(~300, 분봉 있는 종목) 로 교집합한 멤버를 먹인다. 그래서:
 *   - themesOf : 분류 대상 300개 각각의 테마(다중테마면 길이 >1 = 후보 자동 노출)
 *   - codesOf  : "오늘 이 테마에서 같이 움직인 종목들"(교집합이라 정적 로스터 노이즈 제외)
 */
export interface ThemeIndex {
    /** 종목 → 속한 테마들. 없으면 빈 배열(='미분류' 후보). */
    themesOf(code: string): string[];
    /** 테마 → 속한 종목들. */
    codesOf(theme: string): string[];
    /** 인덱스에 등장한 전체 테마. */
    allThemes(): string[];
}

/**
 * flat ThemeMember[] → 양방향 ThemeIndex. 한 패스로 두 Map 동시충전(중복 (theme,code) 행은 dedup).
 * 룩업 결과는 복사본을 돌려준다(호출자 sort/push 가 내부상태 오염 안 하게). 입력 등장순서 유지.
 */
export function buildThemeIndex(members: ThemeMember[]): ThemeIndex {
    const themesByCode = new Map<string, string[]>();
    const codesByTheme = new Map<string, string[]>();
    const pushUnique = (map: Map<string, string[]>, key: string, value: string): void => {
        const arr = map.get(key);
        if (!arr) map.set(key, [value]);
        else if (!arr.includes(value)) arr.push(value);
    };
    for (const m of members) {
        pushUnique(themesByCode, m.code, m.theme);
        pushUnique(codesByTheme, m.theme, m.code);
    }
    return {
        themesOf: (code) => [...(themesByCode.get(code) ?? [])],
        codesOf: (theme) => [...(codesByTheme.get(theme) ?? [])],
        allThemes: () => [...codesByTheme.keys()],
    };
}
