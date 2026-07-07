import type { ThemeMember } from "#domain";

/**
 * 정적 테마 멤버십 소스 포트(outbound). 구현은 Google Sheet 어댑터(infra/broker theme 슬라이스, @tdm/google 을 transport 로).
 * **시트 전체**를 flat 으로 내린다 — universe 를 모른다(알 수도 없음). universe 교집합은 분류 서비스가 한다.
 * 정규화(toCanonical)·헤더 별칭 파싱은 어댑터 경계에서 끝낸다 → 도메인엔 깨끗한 ThemeMember 만.
 */
export interface ThemeMembershipProvider {
    load(): Promise<ThemeMember[]>;
}

/**
 * 정적 테마 멤버십 쓰기 포트(outbound). 구현은 같은 Google Sheet 어댑터(행 append).
 * 사람이 종목 우클릭 → 테마 배정 시 새 (theme, code) 행을 시트에 남긴다. issue(편입이슈)는 표시전용이라
 * 여기선 안 쓰지만(theme/code/name/date 만) ThemeMember 는 공유 — date=편입일(배정일) 은 앱이 정한다.
 * **중복((theme, code) 재배정) 차단은 앱**(캐시된 멤버십 조회)이 한다 — 시트엔 unique 제약이 없다.
 */
export interface ThemeMembershipStore {
    addMember(member: ThemeMember): Promise<void>;
}
