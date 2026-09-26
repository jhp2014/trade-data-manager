// 계산 재료 포트 묶음 — 옛 계산 축 슬라이스(application/service/axis, 2026-09-26 종단 폐기로 은퇴)의
// 유일한 생존 조각. 지금 소비자는 기준선 리졸버 둘과 apps/api 의 자동 타점 격자(grid) 배선이다.
// 재료마다 따로 주입하지 않고 한 벌로 묶는 이유: 소비자가 둘 이상이라(격자·좌표 리졸버·recon)
// 손으로 두 번 적으면 한쪽만 어댑터를 바꿔도 컴파일이 통과해 같은 좌표가 다른 가격으로 풀린다.
import type { AdjustedDailyReader, ChartAnchorReader, DailyMarketCapReader, MinuteReader, RawDailyReader } from "#port/query";

export interface AxisDeps {
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    adjDaily: AdjustedDailyReader;
    /** 차트 앵커(사람 입력 — 선·무시 캔들). */
    chartAnchor: ChartAnchorReader;
    /** 날짜별 시총 — 지금 소비자 없음(옛 시총 축). 배선(axisDepsOf)이 한 벌이라 남긴다. */
    marketCap: DailyMarketCapReader;
}
