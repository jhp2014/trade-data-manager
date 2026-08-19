// 결과 목록의 행 만들기(순수) — 정렬 · 달 버킷 · 차트 덩어리.
//
// ⚠ **묶기는 정렬에 의존한다.** groupByChart 는 같은 차트가 이미 붙어 있다고 보고 한 번만 훑는다
// (정렬된 목록에서 그게 사실이고, 그래야 큰 목록에서 값싸다). 정렬 규칙을 바꾸면서 이 가정을 깨면
// 같은 차트가 여러 덩어리로 쪼개져 "몇 개의 차트를 보고 있나"가 틀린 수로 읽힌다 — 그래서 둘을
// 한 파일에 두고 함께 테스트한다.
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { chartKeyOf } from "../../lib/pointKey.js";

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

/**
 * 표에 그릴 **한 줄** — 자기를 그리는 데 필요한 것을 전부 자기가 들고 있다.
 *
 * 예전에는 차트 덩어리(배열 안의 배열)를 만들고, 날짜를 쓸지(`i===0`)와 세로선을 그을지
 * (`g.items.length>1`)를 **그리는 도중 바깥 문맥에서** 읽었다. 그러면 목록을 중간에서 잘라
 * 42번째부터 그릴 수가 없다: 몇 번째인지도 세어 봐야 알고, 잘린 조각은 자기가 덩어리의 첫 줄인지도
 * 모른다. 가상화가 하는 질문이 정확히 그것("42~78번 줘")이라 문맥을 **줄 안으로 옮겨 넣었다**.
 *
 * 구분줄이 같은 타입에 사는 것도 그래서다 — 달 경계·"표현 안 됨" 머리가 목록 밖의 별도 요소면
 * 가상화가 그 자리를 계산에 못 넣는다. 한 배열에 섞여 있으면 그냥 한 줄이다.
 */
export type FlatRow<T> =
    | {
        kind: "item";
        /** 표 안에서 고유 — 차트키 + 시각(타점 해상도에서 한 차트가 여러 줄이 된다). */
        key: string;
        item: T;
        /** 이 차트 덩어리의 첫 줄인가 — 날짜·이름은 여기에만 쓴다. */
        first: boolean;
        /** 이 차트에 줄이 여럿인가 — 왼쪽 세로선으로 묶는다. */
        tied: boolean;
    }
    | {
        kind: "divider";
        key: string;
        label: string;
        /** 경고 결(결손 목록의 "표현 안 됨") — 색만 갈린다. */
        warn?: boolean;
    };

/**
 * 정렬된 항목 → 평탄한 줄 목록(같은 차트가 붙어 있다는 가정 — 파일 머리 주석 참고).
 * `tied` 는 덩어리 길이를 알아야 정해지므로 덩어리가 끝날 때 소급해 찍는다(한 번 훑기 그대로).
 */
export function flattenRows<T extends { stockCode: string; date: string; time?: string }>(
    sortedItems: readonly T[],
): FlatRow<T>[] {
    const out: FlatRow<T>[] = [];
    let runStart = 0; // 지금 덩어리가 시작한 out 인덱스
    const closeRun = (endExclusive: number): void => {
        if (endExclusive - runStart <= 1) return;
        for (let i = runStart; i < endExclusive; i++) {
            const r = out[i]!;
            if (r.kind === "item") r.tied = true;
        }
    };
    let lastKey: string | null = null;
    for (const it of sortedItems) {
        const key = chartKeyOf(it.stockCode, it.date);
        const first = key !== lastKey;
        if (first) {
            closeRun(out.length);
            runStart = out.length;
            lastKey = key;
        }
        out.push({ kind: "item", key: `${key}|${it.time ?? ""}`, item: it, first, tied: false });
    }
    closeRun(out.length);
    return out;
}
