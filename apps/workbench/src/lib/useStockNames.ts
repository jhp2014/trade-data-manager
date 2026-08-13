// 종목명 한 벌 — "이 코드의 이름이 뭐냐"를 묻는 모든 화면이 같은 자를 쓴다.
//
// ## 이름은 대개 **이미 화면에 와 있다**
// 타점 피드(`/review-points/all`)와 앵커 걸린 차트 피드는 서버가 마스터를 조인해 `name` 을 달고 온다.
// 그런데 패널마다 그 사실을 각자 알고 있어서, 어떤 화면은 그 이름을 쓰고(골격) 어떤 화면은 같은 종목을
// 다시 `/stocks/meta` 로 물었다(결과 목록). 물어보는 쪽은 한 달치 코드를 통째로 보냈고, 서버는 상한을
// 넘긴 만큼을 **조용히 버려서** 그 종목들만 이름 대신 코드가 떴다.
//
// ## 그래서 두 단인다: 이미 온 것으로 먼저 답하고, 남은 것만 묻는다
// 실사용에서 남는 건 큐레이션 편집물 중 타점·앵커 어느 쪽에도 안 걸린 차트(그룹·맵에만 있는 것) 정도라
// 요청 코드 수가 거의 0으로 떨어진다 — 상한 문제가 사실상 사라지고 왕복도 준다.
//
// ⚠ **두 피드를 여기서 fetch 하지 않는다**(`enabled: false`). 이름 하나 때문에 전 타점 피드를 당기면
// 그게 필요 없는 화면(최근 탐색 등)이 큰 응답을 물게 된다. 캐시에 있으면 쓰고 없으면 그냥 없는 것으로
// 친다 — 없으면 아래 배치 조회가 받아내므로 답은 어느 쪽이든 같고, 비용만 갈린다.
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { allPointsQuery, anchoredChartsQuery, stocksMetaQuery } from "../api/queries.js";

/**
 * 한 요청에 실을 코드 수. 서버에도 남용 방지 상한이 있고(초과하면 400) 이 값은 **그보다 작다** —
 * 두 수를 같게 맞추면 한쪽만 바꿔도 조용히 경계에 걸린다. 나누는 쪽이 여유를 갖는 게 맞다.
 * 코드 6자리 + 구분자면 400개가 URL 3KB 남짓이라 어느 서버에도 안전하다.
 */
const CHUNK = 400;

const chunked = <T,>(list: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

export interface StockNames {
    /** 코드 → 이름. 아직 모르면 **코드를 그대로** 돌려준다(빈칸으로 두면 그 행이 뭔지 알 수 없다). */
    nameOf: (code: string) => string;
    /** 남은 것을 묻는 중인가 — 이름이 늦게 채워지는 화면이 스켈레톤을 고를 때. */
    isLoading: boolean;
}

/**
 * @param codes 이름이 필요한 코드들(중복·빈 값 무관 — 여기서 정리한다).
 */
export function useStockNames(codes: readonly string[]): StockNames {
    // 이미 받아둔 피드에서 — 안 받았으면 안 받은 대로 둔다(위 ⚠ 참고).
    const pointsQ = useQuery({ ...allPointsQuery(), enabled: false });
    const chartsQ = useQuery({ ...anchoredChartsQuery(), enabled: false });

    const known = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of pointsQ.data ?? []) if (p.name) m.set(p.stockCode, p.name);
        for (const c of chartsQ.data ?? []) if (c.name) m.set(c.stockCode, c.name);
        return m;
    }, [pointsQ.data, chartsQ.data]);

    // 남은 것만 — 정렬·중복 제거는 stocksMetaQuery 가 키를 만들며 다시 하지만, 여기서 줄여야
    // **요청 자체가** 작아진다(키만 줄이면 URL 은 그대로다).
    const missing = useMemo(() => {
        const out = new Set<string>();
        for (const c of codes) if (c && !known.has(c)) out.add(c);
        return [...out];
    }, [codes, known]);

    // 남은 게 많으면 **나눠서** 묻는다 — 상한을 넘기는 판단을 부르는 쪽마다 시키지 않으려고 여기 둔다.
    // (예전엔 한 화면이 1,000개를 통째로 보냈고 서버가 초과분을 조용히 버렸다. 어떤 화면은 자기 나름의
    //  상한으로 `.slice(0, 200)` 을 걸어 나머지를 아예 포기했다 — 둘 다 여기 한 곳으로 접힌다.)
    const metaQs = useQueries({ queries: chunked(missing, CHUNK).map((c) => stocksMetaQuery(c)) });

    // useQueries 는 매 렌더 새 배열을 준다 — 그대로 의존성에 넣으면 memo 가 한 번도 안 맞는다.
    // 조각들이 마지막으로 갱신된 시각을 이어 붙여 **값**으로 비교한다(데이터가 바뀔 때만 달라진다).
    const metaSig = metaQs.map((q) => q.dataUpdatedAt).join("|");
    const fetched = useMemo(() => {
        const m = new Map<string, string>();
        for (const q of metaQs) for (const s of q.data ?? []) if (s.name) m.set(s.stockCode, s.name);
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metaSig]);

    const loading = metaQs.some((q) => q.isLoading);

    return useMemo(
        () => ({
            // Map 조회다 — 행마다 배열을 훑던 자리가 있었고(결과 목록), 한 달치 1,000행이면 그게 곧 렌더 비용이었다.
            nameOf: (code) => known.get(code) ?? fetched.get(code) ?? code,
            isLoading: loading,
        }),
        [known, fetched, loading],
    );
}
