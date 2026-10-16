// 테스트용 가짜 시장 데이터 — 테스트가 쓰는 창구만 채우고, 나머지는 부르면 실패한다.
// 창구 종류가 늘어도 기존 테스트를 고치지 않게(테스트는 자기가 쓰는 것만 안다).
import type { Market } from "./ports.js";

const notStubbed = (name: string) => () => Promise.reject(new Error(`가짜 시장 데이터: ${name} 은(는) 이 테스트에서 준비하지 않았다`));

export function fakeMarket<T extends Partial<Market>>(stubs: T): Market & T {
    return {
        chart: notStubbed("chart"),
        stockMaster: notStubbed("stockMaster"),
        tradingDays: notStubbed("tradingDays"),
        dayReplay: notStubbed("dayReplay"),
        htsNews: notStubbed("htsNews"),
        telegramArchive: notStubbed("telegramArchive"),
        ...stubs,
    } as Market & T;
}
