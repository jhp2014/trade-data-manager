/* ===========================================================
 * client 측에서 쓰는 직렬화 안전 타입
 * (server action 의 결과는 JSON 직렬화되어 넘어와서
 *  bigint 는 string 으로 바꿔서 전달)
 * =========================================================== */

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

export interface StockMetricsDTO {
  stockCode: string;
  stockName: string;
  closeRate: number | null;
  /** bigint → string 으로 직렬화 */
  cumulativeAmount: string | null;
  dayHighRate: number | null;
  pullbackFromHigh: number | null;
  cnt100Amt: number | null;
}

export interface ThemePeerGroupDTO {
  themeId: string;
  themeName: string;
  peers: StockMetricsDTO[];
}

export interface CardData {
  entry: DeckEntryDTO;
  self: StockMetricsDTO;
  themePeers: ThemePeerGroupDTO[]; // v0.3 까지 빈 배열
}
