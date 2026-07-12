// 실시간 뉴스 — KIS 시황/공시 제목(FHKST01011800)을 온디맨드로 읽는다(DB 저장 없음, 읽고 버림).
// KIS 크레덴셜은 infra/kis .env 자급자족. 부팅 시엔 만들지 않는다(첫 요청에서 createKis)
// → .env 미설정이어도 앱은 뜨고 /news 만 실패(apps/api 의 LazyTelegramNewsSearcher 와 같은 관례).
// 유량초과 백오프·compact 변환·wrap 차단은 KisNewsAdapter(백필과 공용) 재사용.
import { createKis } from "@trade-data-manager/kis";
import { KisNewsAdapter, type KisNewsFilter } from "@trade-data-manager/broker";
import type { NewsHeadline } from "@trade-data-manager/market";

export class LiveNewsService {
    private adapter: KisNewsAdapter | null = null;

    private ensure(): KisNewsAdapter {
        this.adapter ??= new KisNewsAdapter(createKis().rest);
        return this.adapter;
    }

    /** anchor 이하(포함) 한 페이지(≤40, 내림차순). anchor 생략=최신부터. filter 는 KIS 서버사이드. */
    fetchBefore(anchor: { date: string; time: string } | undefined, filter: KisNewsFilter): Promise<NewsHeadline[]> {
        return this.ensure().fetchBefore(anchor, filter);
    }
}
