'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    // useState를 사용하여 컴포넌트가 리렌더링될 때 QueryClient가 재생성되는 것을 방지합니다.
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        refetchOnWindowFocus: false, // 탭 전환 시 자동 새로고침 방지
                        refetchOnReconnect: false,   // 네트워크 재연결 시 자동 새로고침 방지
                        staleTime: 1000 * 60 * 60, // 60분
                        retry: 1,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}