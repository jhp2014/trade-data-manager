import { syncCurationMirror } from "@trade-data-manager/persistence/mirror";
import { config } from "./config";
import type { Logger } from "./logger";

/**
 * curation 미러(Supabase→로컬 전체교체)를 이 앱의 설정으로 돌린다.
 * 실제 로직은 @infra/persistence/mirror 소유 — api 의 동기화 버튼이 같은 함수를 부르기 때문이다
 * (미러가 앱의 읽기 소스라 소비자가 둘). 여기 남는 건 pgBinDir·workDir·로거를 물리는 일뿐.
 *
 * CURATION_DATABASE_URL 미설정이면 미러 자체가 스킵된다(로컬 단독 운영 허용) — market 백업은 그대로 진행.
 */
export async function syncCuration(log: Logger): Promise<void> {
    await syncCurationMirror({
        pgBinDir: config.pgBinDir,
        workDir: config.localDir,
        log: (m) => log.info(m),
    });
}
