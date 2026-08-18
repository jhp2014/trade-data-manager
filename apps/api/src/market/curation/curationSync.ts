import { getPgBinDir, readLastMirrorSyncAt, syncCurationMirror } from "@trade-data-manager/persistence";
import type { CurationSyncStatus } from "@trade-data-manager/wire";

/** 부팅 동기화 임계 — 이 이상 낡았을 때만 당겨온다. */
const MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * curation 미러 당겨오기 — 읽기가 이 미러에서 나오므로 "지금 상대 작업을 보고 싶다"의 답이 여기다.
 *
 * **단일 비행(single-flight)**: 버튼을 두 번 눌러도 덤프가 두 번 돌지 않는다. 전체교체는 로컬 스키마를
 * 드롭했다 복원하므로 겹치면 서로의 중간 상태를 밟는다 — 큐잉이 아니라 **같은 약속을 나눠 주는** 게 맞다
 * (두 번째 누른 사람이 원하는 건 "한 번 더"가 아니라 "지금 것의 결과"다).
 *
 * 야간 db-ops 백업도 같은 함수를 부르지만 **다른 프로세스**라 이 잠금이 닿지 않는다. 겹칠 확률이
 * 낮고(하루 한 번 20:30, 1~2초) 실패해도 새로고침으로 복구되므로 프로세스 간 잠금은 두지 않았다.
 */
export class CurationSync {
    private inFlight: Promise<CurationSyncStatus> | null = null;

    /** 마지막 동기화 시각 — 협업자에겐 이게 "얼마나 낡았나"의 유일한 신호다(그쪽은 야간 작업이 없다). */
    async status(): Promise<CurationSyncStatus> {
        const at = await readLastMirrorSyncAt();
        return { syncedAt: at?.toISOString() ?? null, rows: 0, skipped: false };
    }

    /**
     * 낡았을 때만 당겨온다 — **부팅 경로 전용**. 버튼은 계속 무조건 `run()` 이다("지금 보고 싶다"가 곧 그 뜻).
     *
     * 왜 게이트가 필요한가: 미러 pull 은 남은 유일한 Supabase egress 원천이다(회당 ~0.5MB, 압축은
     * 파일에만 걸리고 회선은 COPY 평문이 간다). 개발 중엔 api 를 하루에도 수십 번 재시작하는데,
     * 그때마다 안 바뀐 1.6MB 를 다시 끌어오는 건 전부 낭비다.
     *
     * 낡음의 근거를 `public.mirror_state` 에서 읽는 게 요점 — **프로세스 메모리가 아니다.** 야간
     * db-ops 백업이 같은 표를 찍으므로, 내 PC 는 매일 밤 갱신 → 부팅 동기화가 아예 안 돈다.
     * 협업자는 야간 작업이 없어 그날 첫 부팅에 한 번 돈다. 둘 다 원하는 대로다.
     *
     * 주기 타이머는 두지 않는다: 전체교체가 `DROP SCHEMA CASCADE` 라 작업 중에 예고 없이 돌면
     * 진행 중인 읽기가 깨질 수 있고, 그러고도 클라 캐시(`staleTime: ∞`)는 버튼 경로에서만 무효화돼
     * 화면이 안 바뀐다 — 위험만 지고 이득이 없다.
     */
    async runIfStale(maxAgeMs: number = MIRROR_MAX_AGE_MS): Promise<CurationSyncStatus | null> {
        const at = await readLastMirrorSyncAt();
        // 한 번도 안 돌았으면(새 머신) 무조건 당긴다 — 빈 미러로는 읽기가 성립하지 않는다.
        if (at && Date.now() - at.getTime() < maxAgeMs) return null;
        return this.run();
    }

    run(): Promise<CurationSyncStatus> {
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.pull().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async pull(): Promise<CurationSyncStatus> {
        const r = await syncCurationMirror({
            pgBinDir: getPgBinDir(),
            log: (m) => console.log(`[mirror] ${m}`),
        });
        return { syncedAt: r.syncedAt?.toISOString() ?? null, rows: r.rows, skipped: r.skipped };
    }
}
