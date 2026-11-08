import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** 이 패키지의 루트(infra/daishin) — cwd 와 무관하게 자기 .env 를 찾는 앵커. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
