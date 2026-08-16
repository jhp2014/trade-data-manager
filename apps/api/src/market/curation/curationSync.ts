import { getPgBinDir, readLastMirrorSyncAt, syncCurationMirror } from "@trade-data-manager/persistence";
import type { CurationSyncStatus } from "@trade-data-manager/wire";

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
