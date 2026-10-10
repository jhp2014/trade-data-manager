// VAULT_DIR 공급 — 셸 env 가 있으면 그것, 없으면 `apps/api/.env`(git 밖) 의 VAULT_DIR **하나만** 읽는다.
// api 의 다른 env 는 셸 기본값 방식이지만 VAULT_DIR 은 머신마다 고정 경로라 매번 셸에 넣게 하면 사용자
// 인스턴스가 늘 「미설정」으로 뜬다. process.env 에 파일을 통째로 싣지 않는 이유: 이 시점(DI 팩토리)은 main.ts 가
// API_PORT 를 읽은 뒤라, 이 파일에 다른 키를 넣으면 **조용히 무시되는 설정**이 생긴다(개발 워크트리의 3011 이
// 3001 로 뜨는 식). 그래서 parseEnv 로 이 키만 집는다. 경로 앵커 = 이 파일 위치(cwd 기준이면 실행 위치에 따라 갈린다).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const API_ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));

export function vaultDirFromEnv(): string | null {
    const shell = process.env.VAULT_DIR?.trim();
    if (shell) return shell;
    if (!existsSync(API_ENV_FILE)) return null;
    const v = parseEnv(readFileSync(API_ENV_FILE, "utf8")).VAULT_DIR?.trim();
    return v ? v : null;
}
