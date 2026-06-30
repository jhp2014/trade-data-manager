import type { ThemeMember } from "../../../../domain/index.js";

/**
 * 정적 테마 멤버십 소스 포트(outbound). 구현은 Google Sheet 어댑터(infra/broker theme 슬라이스, @tdm/google 을 transport 로).
 * **시트 전체**를 flat 으로 내린다 — universe 를 모른다(알 수도 없음). universe 교집합은 분류 서비스가 한다.
 * 정규화(toCanonical)·헤더 별칭 파싱은 어댑터 경계에서 끝낸다 → 도메인엔 깨끗한 ThemeMember 만.
 */
export interface ThemeMembershipProvider {
    load(): Promise<ThemeMember[]>;
}
