// 차트 시각 단축키 — a/d = 활성 경로의 시각을 분봉 한 칸, shift+a/d = 설정한 봉 수(기본 20), f = 모든 차트 줌 토글.
// 활성 경로(경로 줄에서 고리가 둘린 것 — 접혀 있어도)를 옮긴다. 분봉은 차트 패널과 같은 캐시에서 읽고, 패널이 없으면 받는다.
// 종목·날짜가 없거나 그날 분봉이 없으면 아무 일도 하지 않는다. App 에 한 번 마운트한다.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChartData } from "../market/MarketProvider.js";
import { chartBundleQuery } from "../market/queries.js";
import { CLOSE_TIME, usePaths } from "../store/paths.js";
import { useChartSettings } from "../store/chartSettings.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { deriveMinuteView } from "./derive.js";
import { stepMinute } from "./bars.js";

export function useChartTimeCommands(): void {
    const qc = useQueryClient();
    const port = useChartData();
    useEffect(() => {
        const step = async (bars: number): Promise<void> => {
            const { paths, active } = usePaths.getState();
            const p = paths.find((x) => x.id === active);
            if (!p || !p.s.code || !p.s.date) return;
            const { code, date } = p.s;
            const bundle = await qc.ensureQueryData(chartBundleQuery(port, code, date)).catch(() => null);
            if (!bundle) return;
            // 기다리는 사이 활성 경로가 바뀌었거나 그 경로가 다른 종목·날짜로 갔으면 버린다 — 쓰기는 활성을 옮기므로
            // 그대로 쓰면 사용자가 고른 활성을 되돌린다. 시각은 지금 값에서 출발(연타가 차례로 쌓이게).
            const st = usePaths.getState();
            const now = st.paths.find((x) => x.id === p.id)?.s;
            if (st.active !== p.id || !now || now.code !== code || now.date !== date) return;
            const next = stepMinute(deriveMinuteView(bundle, "un").points, now.time, bars, CLOSE_TIME);
            if (next !== null && next !== now.time) usePaths.getState().write(p.id, { time: next });
        };
        const jump = (): number => useChartSettings.getState().settings.jumpBars;
        const cmds = [
            // 시각 이동은 누르고 있으면 계속 간다(repeat). 줌 토글은 한 번만.
            { id: "chart.time.prev", title: "시각 −1분", keys: "a", repeat: true, run: () => void step(-1) },
            { id: "chart.time.next", title: "시각 +1분", keys: "d", repeat: true, run: () => void step(1) },
            { id: "chart.time.prevJump", title: "시각 − 여러 분(설정)", keys: "shift+a", repeat: true, run: () => void step(-jump()) },
            { id: "chart.time.nextJump", title: "시각 + 여러 분(설정)", keys: "shift+d", repeat: true, run: () => void step(jump()) },
            { id: "chart.zoom", title: "차트 줌 토글(봉 수는 설정)", keys: "f", run: () => useChartSettings.getState().toggleZoom() },
        ];
        const { register, unregister } = useKeymapDynamic.getState();
        for (const c of cmds) register({ ...c, category: "차트" });
        return () => cmds.forEach((c) => unregister(c.id));
    }, [qc, port]);
}
