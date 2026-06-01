"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** chart-preview 캐시 최대 보관 개수. 초과 시 오래된 비활성 쿼리부터 제거. */
const MAX_CHART_PREVIEW_ENTRIES = 60;

function attachChartPreviewLru(client: QueryClient) {
  const cache = client.getQueryCache();
  cache.subscribe((event) => {
    if (event.type !== "added") return;

    const chartQueries = cache
      .getAll()
      .filter((q) => Array.isArray(q.queryKey) && q.queryKey[0] === "chart-preview");

    if (chartQueries.length <= MAX_CHART_PREVIEW_ENTRIES) return;

    // 현재 구독자가 없는(=화면에 안 보이는) 쿼리만 후보. 오래된 순으로 제거.
    const evictable = chartQueries
      .filter((q) => q.getObserversCount() === 0)
      .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);

    const overflow = chartQueries.length - MAX_CHART_PREVIEW_ENTRIES;
    for (let i = 0; i < overflow && i < evictable.length; i++) {
      cache.remove(evictable[i]);
    }
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const c = new QueryClient({
      defaultOptions: {
        queries: {
          // hover 미리보기용 캐시 정책
          staleTime: 5 * 60 * 1000, // 5분 동안은 fresh
          gcTime: 30 * 60 * 1000, // 30분 동안 캐시 보관
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
    attachChartPreviewLru(c);
    return c;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
