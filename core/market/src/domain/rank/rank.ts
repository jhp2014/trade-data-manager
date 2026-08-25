// core/market/domain/rank — 축 어휘. 지금 축은 **계산 축뿐**이다(값은 application/service/axis 가 낸다).
// 옛 판단 축(ordinal placement — 사람이 slot 줄에 손으로 꽂는 축)은 2026-08-25 폐지: 손배치 노동이
// 확장 병목이었고, 판단의 근거가 될 사실은 curation 앵커(param)로 기록해 계산 축이 값으로 뽑는다.
// (rank_axes/rank_slots/rank_placements 테이블·RankReader/RankStore 포트·배치 UI 가 함께 삭제됐다.)
import type { Grain } from "../grain.js";

/** 축의 알갱이. point=타점별(종목·날짜·시각) / day=하루 일관(종목·날짜). */
export type RankAxisScope = Grain;

/** 축의 화면 메타 1개 — 이름 + 알갱이. 계산 축 피드가 이 모양으로 클라에 내려간다. */
export interface RankAxis {
    name: string;
    scope: RankAxisScope;
}

/**
 * 줄 위의 항목 1개(클라 조립용 어휘) — 계산 축 값에서 클라가 만든다: orderKey = 수치(강한 쪽이 큰 값이
 * 되게 부호 조정). **같은 orderKey = 같은 자리(타이)** 라 slot 개념이 필요 없다. orderKey 는 참조가
 * 아니라 값이다 — 한 스냅샷 안에서 정렬·묶기에만 쓴다(영속 지목은 타점/차트 앵커로).
 */
export interface PlacedPoint {
    orderKey: number;
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}
