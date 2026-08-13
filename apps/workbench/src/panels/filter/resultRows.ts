// 결과 목록의 행 만들기(순수) — 정렬 · 달 버킷 · 차트 덩어리.
//
// ⚠ **묶기는 정렬에 의존한다.** groupByChart 는 같은 차트가 이미 붙어 있다고 보고 한 번만 훑는다
// (정렬된 목록에서 그게 사실이고, 그래야 큰 목록에서 값싸다). 정렬 규칙을 바꾸면서 이 가정을 깨면
// 같은 차트가 여러 덩어리로 쪼개져 "몇 개의 차트를 보고 있나"가 틀린 수로 읽힌다 — 그래서 둘을
// 한 파일에 두고 함께 테스트한다.
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { chartKey } from "../../lib/pointKey.js";

/** YYYY-MM-DD → YYYY-MM. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** YYYY-MM → `26.05` (날짜 표기와 같은 두 자리 연도). */
export const monthLabel = (ym: string): string => ym.slice(2).replace("-", ".");

/**
 * 최근 날짜 먼저 → 종목코드 → 시각순.
 * ⚠ 이름이 아니라 **코드**로 정렬한다: 이름은 별도 쿼리로 늦게 오는데 그걸 기준으로 삼으면
 * 이름이 도착하는 순간 행이 통째로 재배열된다(읽던 자리를 잃는다).
 */
export function compareItems(a: FunnelItem, b: FunnelItem): number {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.stockCode !== b.stockCode) return a.stockCode < b.stockCode ? -1 : 1;
    return (a.time ?? "").localeCompare(b.time ?? "");
}

export const sortItems = (items: readonly FunnelItem[]): FunnelItem[] => [...items].sort(compareItems);

/** 등장 순서(= 최근 달 먼저)의 달 목록과 달별 건수. 정렬된 목록을 받는다. */
export function monthBuckets(sortedItems: readonly FunnelItem[]): { months: string[]; countByMonth: Map<string, number> } {
    const countByMonth = new Map<string, number>();
    const months: string[] = [];
    for (const it of sortedItems) {
        const ym = monthOf(it.date);
        const n = countByMonth.get(ym);
        if (n === undefined) months.push(ym);
        countByMonth.set(ym, (n ?? 0) + 1);
    }
    return { months, countByMonth };
}

/** 한 차트(종목·날짜)의 항목들 — 표에서 한 덩어리로 그린다. */
export interface ItemGroup {
    key: string;
    stockCode: string;
    date: string;
    items: FunnelItem[];
}

/** 정렬된 항목 → 차트 덩어리(같은 차트가 붙어 있다는 가정 — 파일 머리 주석 참고). */
export function groupByChart(sortedItems: readonly FunnelItem[]): ItemGroup[] {
    const out: ItemGroup[] = [];
    for (const it of sortedItems) {
        const key = chartKey(it);
        const last = out[out.length - 1];
        if (last && last.key === key) last.items.push(it);
        else out.push({ key, stockCode: it.stockCode, date: it.date, items: [it] });
    }
    return out;
}
