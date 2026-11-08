// api 파일 캐시 지우기 — 옛 날짜의 분봉·일봉을 고치면 그 날짜의 굳은 파생 파일이 옛 값을 계속 보인다
// ("입력 불변" 전제로 굳고, 날짜가 늘지 않으니 꼬리 증분도 못 잡는다). 이 폴더(실행한 워크트리)의 apps/api/.cache 만 지운다 —
// 다른 폴더(사용 인스턴스)는 반영할 때 따로 지운다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_CACHE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api/.cache");
/** 날짜 이름(YYYY-MM-DD.*)으로 굳는 캐시 — 둘 다 분봉·일봉에서 굽는다. */
const DATED_CACHES = ["day-snapshot", "point-grid"];

/** 그 날짜들의 굳은 파생 파일을 지운다 — 다음 요청이 고친 값으로 다시 굽는다. 지운 수를 돌려준다. */
export async function clearApiDayCaches(dates: Iterable<string>): Promise<number> {
    const wanted = new Set(dates);
    let removed = 0;
    for (const dir of DATED_CACHES) {
        const root = path.join(API_CACHE, dir);
        const names = await fs.readdir(root).catch(() => [] as string[]);
        for (const name of names) {
            const date = /^(\d{4}-\d{2}-\d{2})\./.exec(name)?.[1];
            if (date === undefined || !wanted.has(date)) continue;
            await fs.rm(path.join(root, name), { force: true });
            removed++;
        }
    }
    return removed;
}
