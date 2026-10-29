import { useState } from "react";
import type { DockviewApi } from "dockview-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarketProvider } from "./market/MarketProvider.js";
import { tdmMarket } from "./market/tdm.js";
import { PathBar } from "./shell/PathBar.js";
import { Shell } from "./shell/Shell.js";
import { Taskbar } from "./shell/Taskbar.js";
import { SettingsModal } from "./shell/SettingsModal.js";
import { useScreenCommands } from "./shell/useScreenCommands.js";
import { useKeymap } from "./keymap/useKeymap.js";
import { useChartTimeCommands } from "./chart/useChartTimeCommands.js";
import { usePasteState } from "./shell/usePasteState.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export function App(): JSX.Element {
    const [api, setApi] = useState<DockviewApi | null>(null);
    return (
        <QueryClientProvider client={queryClient}>
            <MarketProvider market={tdmMarket}>
                <Hotkeys api={api} />
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <PathBar />
                    <Shell onApi={setApi} />
                    <Taskbar api={api} />
                </div>
                <SettingsModal api={api} />
            </MarketProvider>
        </QueryClientProvider>
    );
}

/** 단축키 — 디스패처 하나 + 소유 훅들이 레지스트리에 얹는다(+ 토큰 붙여넣기). 시장 데이터를 쓰는 훅이 있어 공급자 안에 둔다. */
function Hotkeys({ api }: { api: DockviewApi | null }): null {
    useKeymap();
    useScreenCommands(api);
    useChartTimeCommands();
    usePasteState();
    return null;
}
