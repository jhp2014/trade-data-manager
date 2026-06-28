/**
 * 통합 OAuth 스코프. 본인 Google 계정 하나로 두 API 를 커버한다.
 * - drive.file : 이 앱이 만든 Drive 파일만 접근(db-backup 오프사이트 백업).
 * - spreadsheets : 접근 가능한 모든 시트 읽기/쓰기(복기 시트 R/W).
 * 두 스코프로 1회 동의하면 drive·sheets 소비자가 같은 refresh token 을 공유한다.
 */
export const GOOGLE_OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
];
