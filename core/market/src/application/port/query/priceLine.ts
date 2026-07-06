import type { PriceLine, PriceLinedStock } from "#domain";

// 가격선 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 가격이 아니라 앵커(캔들 좌표)를 저장한다 — 값은 표시 시점에 앵커 캔들에서 읽으므로 in-place 수정이 없다.
// 편집모델 = add/remove 둘뿐(드래그 폐기). 자세한 설계는 domain/review/priceLine.ts.

/** 가격선 조회(읽기). 차트 주석 표시·작업셋 목록 소비자(ChartAnnotation 등)가 의존. */
export interface PriceLineReader {
    /** 이 차트(종목,날짜)의 모든 선(그린 순서 = id 오름차순). */
    listByChart(stockCode: string, date: string): Promise<PriceLine[]>;

    /** 선이 하나라도 있는 (종목,날짜)들 — 작업셋 목록(날짜 내림차순). name/lineCount 는 조회 파생. */
    listPriceLinedStocks(): Promise<PriceLinedStock[]>;
}

/** 가격선 편집(쓰기). 사람이 긋고 지우는 CRUD 컨트롤러가 의존. */
export interface PriceLineStore {
    /** 선들을 추가하고, DB 가 부여한 id 를 채워 그대로 돌려준다(그린 순서 보존). */
    add(lines: PriceLine[]): Promise<PriceLine[]>;

    /** 선 1개 삭제(id 로 지목). */
    remove(id: string): Promise<void>;
}
