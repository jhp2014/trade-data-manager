"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // hover 미리보기용 캐시 정책
                        staleTime: 5 * 60 * 1000, // 5분 동안은 fresh
                        gcTime: 30 * 60 * 1000, // 30분 동안 캐시 보관
                        refetchOnWindowFocus: false,
                        retry: 1,
                    },
                },
            })
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
