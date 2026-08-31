import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/theme.css";
import { App } from "./App.js";
import { GroupsProvider } from "./lib/GroupsContext.js";
import { LiveSnapshotProvider } from "./lib/LiveSnapshotContext.js";
import { RankAxesProvider } from "./lib/RankAxesContext.js";
import { PointGridsProvider } from "./lib/PointGridsContext.js";
import { StockNamesProvider } from "./lib/StockNamesContext.js";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("#root 없음");

// 공유 재료는 **App 바깥**에 선다 — App 자신이 전역 단축키(useChartHotkeys)에서 그룹 사전을 쓰기 때문에
// App 안에 두면 그 훅이 Provider 밖이 된다. 순서: 이름·그룹·축 → (App 안의) 깔때기. 깔때기가 뒤를 재료로 쓴다.
// (이름 사전은 아무것도 참조하지 않으므로 맨 바깥 — 가장 많은 화면이 쓰는 것이 가장 바깥이면 배선이 단순하다.)
// 실시간 스냅샷(SSE)도 여기서 한 벌 — 아무것도 참조하지 않아 위치는 자유, App 바로 바깥에 둔다.
createRoot(root).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <StockNamesProvider>
                <GroupsProvider>
                    <PointGridsProvider>
                    <RankAxesProvider>
                        <LiveSnapshotProvider>
                            <App />
                        </LiveSnapshotProvider>
                    </RankAxesProvider>
                    </PointGridsProvider>
                </GroupsProvider>
            </StockNamesProvider>
        </QueryClientProvider>
    </StrictMode>,
);
