"use server";

import {
  loadDecksFromDir,
  resolveDeckSubDir,
} from "@trade-data-manager/feature-engine";
import type { LoadedDecksDTO, CardData, PeerStockMock } from "@/types/deck";

export async function loadDeckAction(
  subDir: string = ""
): Promise<
  | { ok: true; data: LoadedDecksDTO; cards: CardData[] }
  | { ok: false; error: string }
> {
  try {
    const absDir = resolveDeckSubDir(subDir);
    const decks = await loadDecksFromDir(absDir);

    const dto: LoadedDecksDTO = {
      entries: decks.entries.map((e) => ({
        stockCode: e.stockCode,
        tradeDate: e.tradeDate,
        tradeTime: e.tradeTime,
        options: e.options,
        sourceFile: e.sourceFile,
      })),
      optionKeys: decks.optionKeys,
      files: decks.files,
      duplicateCount: decks.duplicateCount,
    };

    // v0.1: analyzer는 아직 미완 — mock 카드 데이터 생성
    const cards: CardData[] = dto.entries.map((entry) => buildMockCard(entry));

    return { ok: true, data: dto, cards };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/* ===========================================================
 * mock helpers — v0.2에서 analyzeEntries로 교체
 * =========================================================== */
function buildMockCard(entry: LoadedDecksDTO["entries"][number]): CardData {
  // entry 정보 기반으로 결정론적 mock 생성 (같은 entry → 같은 mock)
  const seed = hash(entry.stockCode + entry.tradeDate + entry.tradeTime);

  const selfMetrics = mockMetrics(entry.stockCode, seed);
  const peerCount = 3 + (seed % 6); // 3~8개
  const peers: PeerStockMock[] = Array.from({ length: peerCount }, (_, i) =>
    mockMetrics(`${entry.stockCode.slice(0, 3)}${(i + 1)
      .toString()
      .padStart(3, "0")}`, seed + i + 1)
  );

  return {
    entry,
    selfStockName: mockName(entry.stockCode, seed),
    selfMetrics,
    themeName: mockTheme(seed),
    peers,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function mockMetrics(code: string, seed: number): PeerStockMock {
  const r = (n: number) => ((seed * (n + 1)) % 1000) / 10; // 0~99.9
  const sign = (seed + code.charCodeAt(0)) % 2 === 0 ? 1 : -1;

  return {
    stockCode: code,
    stockName: mockName(code, seed),
    changeRate: sign * r(1) * 0.3,        // -30 ~ +30
    cumulativeAmount: Math.floor(r(2) * 1e9), // 0 ~ 99.9억 * scale
    dayHighRate: r(3) * 0.4,                  // 0 ~ 40
    pullbackFromHigh: -r(4) * 0.15,            // -15 ~ 0
    cnt100Amt: Math.floor(r(5) / 10),          // 0 ~ 9
  };
}

function mockName(code: string, seed: number): string {
  const names = [
    "삼성전자", "SK하이닉스", "LG에너지솔루션", "현대차", "셀트리온",
    "POSCO홀딩스", "기아", "NAVER", "카카오", "삼성SDI",
    "한화에어로", "두산에너빌리티", "한미반도체", "에코프로", "포스코퓨처엠",
  ];
  return names[seed % names.length] + ` (${code})`;
}

function mockTheme(seed: number): string {
  const themes = [
    "AI 반도체", "2차전지", "조선", "방산", "원자력",
    "바이오", "로봇", "우주항공", "전력기기", "해상풍력",
  ];
  return themes[seed % themes.length];
}
