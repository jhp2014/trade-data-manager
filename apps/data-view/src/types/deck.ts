export interface DeckEntryDTO {
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
  options: Record<string, string>;
  sourceFile: string;
}

export interface LoadedDecksDTO {
  entries: DeckEntryDTO[];
  optionKeys: string[];
  files: string[];
  duplicateCount: number;
}

/** v0.1 mock — 동반 종목 + 자기 종목 분봉 피처 표시용 */
export interface PeerStockMock {
  stockCode: string;
  stockName: string;
  changeRate: number;        // 등락률 % (음수 = 하락)
  cumulativeAmount: number;  // 누적 거래대금 (원)
  dayHighRate: number;       // 당일 고점 대비 등락률 %
  pullbackFromHigh: number;  // 고점 대비 하락률 %
  cnt100Amt: number;         // 100억 돌파 횟수
}

export interface CardData {
  entry: DeckEntryDTO;
  selfStockName: string;             // mock — 종목명
  selfMetrics: PeerStockMock;        // 자기 종목 5지표
  themeName: string;                 // mock — 테마명 (한 카드당 대표 1개)
  peers: PeerStockMock[];            // 동반 종목들
}
