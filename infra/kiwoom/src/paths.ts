import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * 이 패키지의 루트 디렉토리. 소스 파일 위치(import.meta.url) 기준이라
 * 누가 어디서 실행하든(cwd 무관) 항상 packages/kiwoom 를 가리킨다.
 * → 패키지가 자기 .env / 토큰 캐시를 자급자족으로 찾기 위한 앵커.
 */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
