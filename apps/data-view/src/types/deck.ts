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
  cumulativeAmount: string | null;
  dayHighRate: number | null;
  pullbackFromHigh: number | null;
  minutesSinceDayHigh: number | null;
  currentMinuteAmount: string | null;
  amountDistribution: Record<number, number> | null;
}

export interface ThemeRowData {
  /** 한 entry에 여러 테마면 row가 여러 개 생성 */
  entry: DeckEntryDTO;
  self: StockMetricsDTO;
  /** 이 row가 속한 테마 */
  themeId: string;
  themeName: string;
  /** 테마 내 자기 종목의 등락률 순위 (1-based) */
  selfRank: number;
  /** 테마 내 총 종목 수 */
  themeSize: number;
  /** 테마 내 모든 peer (자기 제외, 등락률 순) */
  peers: StockMetricsDTO[];
}

export interface ThemePeerGroupDTO {
  themeId: string;
  themeName: string;
  peers: StockMetricsDTO[];
}

