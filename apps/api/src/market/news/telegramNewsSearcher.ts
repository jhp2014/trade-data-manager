import { createTelegram, NEWS_CHANNELS, type Telegram } from "@trade-data-manager/telegram";
import { NewsSearchService } from "@trade-data-manager/market";
import type { NewsItem, NewsSearcher, NewsSearchOptions } from "@trade-data-manager/market";
import { TelegramNewsSearchAdapter } from "@trade-data-manager/broker";

// 상주 MTProto 뉴스 검색기 — ingest 의 lazy 조합을 apps/api 로 옮긴 것.
// 개인 세션이라 서버 부팅 시엔 접속하지 않는다(첫 검색에서만 접속 → 세션 미설정이어도 API 는 뜨고 /news/telegram 만 실패).
// 접속은 1회 메모이즈(동시 첫 요청도 한 번만 접속). OnModuleDestroy 에서 close.
export class LazyTelegramNewsSearcher implements NewsSearcher {
    private tg: Telegram | null = null;
    private searcher: NewsSearcher | null = null;
    private connecting: Promise<NewsSearcher> | null = null;
    private closed = false;

    private ensure(): Promise<NewsSearcher> {
        if (this.closed) return Promise.reject(new Error("news searcher 가 이미 종료됨"));
        if (this.searcher) return Promise.resolve(this.searcher);
        if (!this.connecting) {
            this.connecting = (async () => {
                const tg = await createTelegram();
                const labels = new Map(NEWS_CHANNELS.map((c) => [c.peer, c.label]));
                const s = new NewsSearchService({
                    source: new TelegramNewsSearchAdapter(tg, labels),
                    channels: NEWS_CHANNELS.map((c) => c.peer),
                });
                this.tg = tg;
                this.searcher = s;
                return s;
            })().catch((err: unknown) => {
                this.connecting = null; // 실패 시 다음 요청에서 재시도 가능
                throw err;
            });
        }
        return this.connecting;
    }

    async search(query: string, opts?: NewsSearchOptions): Promise<NewsItem[]> {
        const s = await this.ensure();
        return s.search(query, opts);
    }

    async close(): Promise<void> {
        this.closed = true;
        // 접속 진행 중에 종료되면, 그 접속이 끝나 this.tg 가 세팅될 때까지 기다린 뒤 disconnect 한다.
        // (기다리지 않으면 close 가 tg=null 을 보고 지나쳐, 나중에 열린 연결이 정리되지 않고 누수된다.)
        if (this.connecting) await this.connecting.catch(() => {});
        const tg = this.tg;
        this.tg = null;
        this.searcher = null;
        this.connecting = null;
        if (tg) await tg.disconnect();
    }
}
