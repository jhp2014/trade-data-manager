"use server";

/**
 * v0.1 mock: 실제 DB 조회 대신 결정론적 가짜 데이터 + 200ms 지연.
 * v0.2에서 daily/minute/peer 데이터를 실 조회로 교체 예정.
 */

export interface ChartCandle {
  /** unix seconds */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartPreviewData {
  daily: ChartCandle[];
  minute: ChartCandle[];
  themeOverlay: Array<{
    stockCode: string;
    stockName: string;
    series: Array<{ time: number; changeRate: number }>;
  }>;
}

export async function fetchChartPreviewAction(params: {
  stockCode: string;
  tradeDate: string;
  tradeTime: string;
}): Promise<ChartPreviewData> {
  // 시뮬레이션 지연 (실 DB 호출 대비 캐시 효과 체감용)
  await sleep(200);

  const seed = hash(
    params.stockCode + params.tradeDate + params.tradeTime
  );

  return {
    daily: buildDailyMock(seed),
    minute: buildMinuteMock(seed, params.tradeDate),
    themeOverlay: buildThemeOverlay(seed, params.tradeDate),
  };
}

/* ===========================================================
 * mock builders
 * =========================================================== */

function buildDailyMock(seed: number): ChartCandle[] {
  const out: ChartCandle[] = [];
  let price = 10000 + (seed % 50000);
  // 60일 일봉
  const start = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
  for (let i = 0; i < 60; i++) {
    const drift = (((seed + i) * 9301 + 49297) % 233280) / 233280 - 0.5;
    const open = price;
    const close = price * (1 + drift * 0.05);
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    out.push({
      time: start + i * 24 * 60 * 60,
      open,
      high,
      low,
      close,
      volume: Math.floor(((seed + i) * 12345) % 1_000_000) + 100_000,
    });
    price = close;
  }
  return out;
}

function buildMinuteMock(seed: number, tradeDate: string): ChartCandle[] {
  const out: ChartCandle[] = [];
  let price = 10000 + (seed % 50000);
  // 09:00 ~ 15:30 = 390분
  const baseDate = new Date(tradeDate + "T09:00:00+09:00");
  const baseSec = Math.floor(baseDate.getTime() / 1000);
  for (let i = 0; i < 390; i++) {
    const drift = (((seed + i * 7) * 9301 + 49297) % 233280) / 233280 - 0.5;
    const open = price;
    const close = price * (1 + drift * 0.01);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    out.push({
      time: baseSec + i * 60,
      open,
      high,
      low,
      close,
      volume: Math.floor(((seed + i * 3) * 4567) % 50_000) + 1000,
    });
    price = close;
  }
  return out;
}

function buildThemeOverlay(seed: number, tradeDate: string) {
  const names = [
    ["005930", "삼성전자"],
    ["000660", "SK하이닉스"],
    ["373220", "LG에너지솔루션"],
    ["207940", "삼성바이오로직스"],
  ];
  const baseDate = new Date(tradeDate + "T09:00:00+09:00");
  const baseSec = Math.floor(baseDate.getTime() / 1000);
  return names.map(([code, name], idx) => {
    const series = Array.from({ length: 78 }, (_, i) => {
      // 5분 간격 78개 = 390분
      const drift =
        (((seed + idx * 17 + i) * 9301 + 49297) % 233280) / 233280 - 0.5;
      return {
        time: baseSec + i * 5 * 60,
        changeRate: drift * 5 * (i / 78), // 시간 갈수록 분기
      };
    });
    return { stockCode: code, stockName: name, series };
  });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
