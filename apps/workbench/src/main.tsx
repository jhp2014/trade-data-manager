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
import { useWorkbench } from "./store/workbench.js";

const queryClient = new QueryClient();

// 작업면은 **하루로 고정**한다(2026-09-24 — decisions 「Daily 타점 생성 = 돌파 사슬」, 종단 보류).
// 스토어 기본값(종단)은 그대로 두고 부팅 때 한 번 고정한다 — 스토어 테스트 하네스가 종단 부팅을 전제하고,
// 기본값을 바꾸면 날짜 술어 테스트가 재조정으로 뒤집힌다. render **전**이라 종단 쿼리가 한 번 도는 깜빡임도 없다.
// 종단을 되살리는 손 = 이 한 줄 삭제 + 생성소 머리의 모드 토글.
useWorkbench.getState().setFilterMode("daily");

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
