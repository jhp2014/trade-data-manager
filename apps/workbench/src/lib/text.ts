/** 정규식 메타문자 이스케이프 — 사용자 입력을 리터럴로 검색(하이라이트)할 때. */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
