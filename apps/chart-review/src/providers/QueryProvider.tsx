"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    return new QueryClient({
      defaultOptions: {
        queries: {
          // hover 미리보기용 캐시 정책
          staleTime: 5 * 60 * 1000, // 5분 동안은 fresh
          // 비활성(관찰자 0) 쿼리는 5분 뒤 react-query 가 자동 수거.
          // (과거 커스텀 LRU 는 dev StrictMode 의 mount→unmount→remount 와
          //  레이스를 일으켜 활성 쿼리를 제거 → 재요청 무한 루프를 유발했다.)
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchOnMount: false,
          retry: 1,
        },
      },
    });
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
