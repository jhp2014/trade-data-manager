// ChannelArchiveCollectService — 뉴스 방 메시지 아카이브 수집(Command). 협력: ChannelHistorySource(페이지) · ChannelMessageStore(멱등 저장+커서).
// 진도의 자 = 방별 msg_id(단조 증가). KIS 뉴스의 wrap·강제 하강 기계가 필요 없다 — 빈 번호는 지워진 메시지(정상).
//
// sync(일일, 한 패스로 신규+수정 반영):
//   최신부터 내려가다 (oldestId ≤ 커서) ∧ (oldestAt < now−재훑기창) 이면 멈춘다. 커서가 없으면(첫 실행) 시간 조건만.
//   ⚠ 커서는 패스를 **끝까지 마쳤을 때만** 기록(markSynced) — 중간에 끊긴 채 max(id) 를 커서로 삼으면
//     "옛 커서 ~ 이번 최저 id" 사이가 영구 구멍이 된다. 끊기면 커서가 그대로라 다음 실행이 다시 걷는다(upsert 멱등).
// backfill(since): 저장된 최소 id 아래로 이어 내려가 oldestAt < since 면 끝. 행이 없으면 최신부터.
//   min(posted_at) < since 인 방은 이미 끝난 것(상태 없는 완료 판정 — 경계 걸친 since 이전 행도 저장하므로).
// 공통: 방은 순차(FLOOD) · 페이지 사이 잠깐 쉼 · 루프 전진은 저장 행이 아니라 원 페이지 id(서비스 메시지만 있는 페이지)
//   · 한 방 실패는 격리(다음 방 계속, 그 방은 completed=false).
import type { ChannelInfo } from "#domain";
import type {
    ChannelArchiveCollector,
    ChannelArchiveOptions,
    ChannelArchiveResult,
    ChannelCollectOutcome,
    ChannelHistorySource,
    ChannelMessageStore,
} from "#port/collect";

export interface ArchiveChannel {
    peer: string;
    label: string;
}

export interface ChannelArchiveDeps {
    source: ChannelHistorySource;
    store: ChannelMessageStore;
    channels: readonly ArchiveChannel[];
    /** 페이지 사이 쉼(기본 1000ms). 테스트는 0. */
    pageIntervalMs?: number;
    /** sync 가 수정 반영을 위해 다시 훑는 창(기본 48h). */
    rescanWindowMs?: number;
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    onError?: (peer: string, err: unknown) => void;
}

const DEFAULT_PAGE_INTERVAL_MS = 1000;
const DEFAULT_RESCAN_WINDOW_MS = 48 * 3600_000;
/** 무한루프 방지 상한(방당). 11만 건 방도 1,100페이지라 넉넉히. */
const HARD_MAX_PAGES = 100_000;

interface WalkStop {
    /** 이 페이지를 저장한 뒤 멈출 것인가. */
    (oldestId: number, oldestAt: Date | undefined): boolean;
}

export class ChannelArchiveCollectService implements ChannelArchiveCollector {
    constructor(private readonly deps: ChannelArchiveDeps) {}

    async sync(opts?: ChannelArchiveOptions): Promise<ChannelArchiveResult> {
        const now = (this.deps.now ?? (() => new Date()))();
        const floor = now.getTime() - (this.deps.rescanWindowMs ?? DEFAULT_RESCAN_WINDOW_MS);
        return this.forEachChannel("sync", async (info) => {
            const { store } = this.deps;
            const cursor = await store.cursor(info.channelId);
            // 커서가 없는데 행은 있다(백필이 먼저 돈 경우) → 저장된 최대 id 를 하한으로(이번 패스 완주 시 커서가 생긴다).
            const stopBelowId = cursor.syncedMaxId ?? (await store.bounds(info.channelId))?.maxId ?? null;
            const stop: WalkStop = (oldestId, oldestAt) =>
                (stopBelowId === null || oldestId <= stopBelowId) && oldestAt !== undefined && oldestAt.getTime() < floor;

            const walked = await this.walk(info, undefined, stop, opts, "sync");
            if (walked.completed) {
                // 받은 것이 없으면(방이 비었거나 새 글 0) 커서는 옛 값 유지 — 0 으로 뒤로 가지 않는다.
                const newMax = walked.newestId ?? stopBelowId;
                if (newMax !== null) await store.markSynced(info.channelId, newMax, now);
            }
            return walked;
        });
    }

    async backfill(since: Date, opts?: ChannelArchiveOptions): Promise<ChannelArchiveResult> {
        return this.forEachChannel("backfill", async (info) => {
            const bounds = await this.deps.store.bounds(info.channelId);
            if (bounds && bounds.minPostedAt.getTime() < since.getTime()) {
                return { pages: 0, saved: 0, completed: true, oldestAt: bounds.minPostedAt, newestId: null };
            }
            const stop: WalkStop = (_oldestId, oldestAt) => oldestAt !== undefined && oldestAt.getTime() < since.getTime();
            return this.walk(info, bounds?.minId, stop, opts, "backfill");
        });
    }

    /** 방 순차 순회 + resolve/upsertChannel + 실패 격리. */
    private async forEachChannel(
        phase: "sync" | "backfill",
        run: (info: ChannelInfo) => Promise<Omit<ChannelCollectOutcome, "peer" | "label" | "error">>,
    ): Promise<ChannelArchiveResult> {
        const onError =
            this.deps.onError ??
            ((peer, err) => console.warn(`[telegram-archive:${phase}] ${peer}: ${err instanceof Error ? err.message : String(err)}`));
        const channels: ChannelCollectOutcome[] = [];
        for (const ch of this.deps.channels) {
            try {
                const info = await this.deps.source.resolve(ch.peer);
                await this.deps.store.upsertChannel({ ...info, peer: ch.peer });
                const r = await run({ ...info, peer: ch.peer });
                channels.push({ peer: ch.peer, label: ch.label, ...r });
            } catch (err) {
                onError(ch.peer, err);
                channels.push({
                    peer: ch.peer,
                    label: ch.label,
                    pages: 0,
                    saved: 0,
                    completed: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return { channels };
    }

    /**
     * offsetId 미만부터 내려가며 페이지마다 저장. stop(oldestId, oldestAt) 이 참이 되면 멈춘다(완주).
     * 페이지가 비면 방의 시작(완주). maxPagesPerChannel 에 닿으면 미완주.
     * 예외는 그대로 던진다(호출자가 격리) — 부분 저장은 멱등이라 무해.
     */
    private async walk(
        info: ChannelInfo,
        offsetId: number | undefined,
        stop: WalkStop,
        opts: ChannelArchiveOptions | undefined,
        phase: "sync" | "backfill",
    ): Promise<Omit<ChannelCollectOutcome, "peer" | "label" | "error"> & { newestId: number | null }> {
        const { source, store } = this.deps;
        const sleep = this.deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
        const interval = this.deps.pageIntervalMs ?? DEFAULT_PAGE_INTERVAL_MS;
        const maxPages = Math.min(opts?.maxPagesPerChannel ?? HARD_MAX_PAGES, HARD_MAX_PAGES);

        let pages = 0;
        let saved = 0;
        let newestId: number | null = null;
        let oldestAt: Date | undefined;
        let completed = false;

        while (pages < maxPages) {
            const page = await source.page(info, { offsetId });
            pages++;
            if (page.pageIds.length === 0) {
                completed = true; // 방의 시작
                break;
            }
            newestId ??= page.pageIds[0];
            if (page.messages.length > 0) {
                await store.saveMessages(page.messages);
                saved += page.messages.length;
                oldestAt = page.messages[page.messages.length - 1].postedAt;
            }
            const oldestId = page.pageIds[page.pageIds.length - 1];
            opts?.onProgress?.({ phase, peer: info.peer, label: info.title, pages, saved, oldestAt });
            // 시각은 이 페이지의 마지막 일반 메시지 것 — 서비스 메시지만 있는 페이지면 직전 값이 남는다(더 과거일 뿐).
            if (stop(oldestId, oldestAt)) {
                completed = true;
                break;
            }
            offsetId = oldestId;
            if (interval > 0) await sleep(interval);
        }
        return { pages, saved, completed, oldestAt, newestId };
    }
}
