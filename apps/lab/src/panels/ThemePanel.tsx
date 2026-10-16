// 테마 패널 — 그날 종목을 **이슈 이력**으로 묶는다(trade-judgment 관점 「당일 테마」: 분류는 앱이, 판단은 사용자가).
// 소속 = 그날 **이전** 이력의 테마 전부(날짜 무관 · 사전으로 이은 이름). 그날 · 그 뒤의 이력은 섞지 않는다.
// 종목 줄 우클릭 = 그 종목의 이력 · 그날의 장 마감 정리(StockHistoryPopover).
import { useMemo, useState } from "react";
import { usePanelPath } from "../store/paths.js";
import { useDayReplay } from "../market/queries.js";
import { useHistoryThemes } from "../judgment/queries.js";
import type { Coverage } from "../judgment/types.js";
import { ThemeBoardPanel, type Membership } from "./themeBoard/ThemeBoardPanel.js";
import { StockHistoryPopover } from "./themeBoard/StockHistoryPopover.js";

export function ThemePanel({ panelId }: { panelId: string }): JSX.Element {
    const { date, time } = usePanelPath(panelId).path.s;
    // 소속은 **받은 시계열의 날짜**로 판에 입힌다 — 날짜가 바뀌는 동안 직전 날 판에 새 날 소속이 섞이지 않게.
    // 경로 날짜의 소속은 미리 받아 둔다(시계열을 기다리지 않고 같이 받는다 — 시계열이 오면 소속은 이미 있다).
    useHistoryThemes(date);
    const replay = useDayReplay(date).data;
    const replayDate = replay?.date ?? "";
    const hq = useHistoryThemes(replayDate);
    // 응답을 받기 전(불러오는 중 · 오류)엔 범위를 모른다 — 알림 · 꼬리 카드 이름을 단정하지 않는다.
    const loaded = hq.data !== undefined;
    const coverage = hq.data?.coverage ?? null;
    const before = loaded && beforeCoverage(replayDate, coverage);
    const membership = useMemo<Membership>(
        () => ({
            themes: hq.data?.themes,
            error: hq.error,
            unclassified: before ? "이력 범위 밖" : "테마 이력 없음",
            note: loaded ? coverageNote(replayDate, coverage) : null,
        }),
        [hq.data, hq.error, before, loaded, replayDate, coverage],
    );
    const [inspect, setInspect] = useState<{ code: string; x: number; y: number } | null>(null);
    const stock = inspect ? replay?.stocks.find((s) => s.code === inspect.code) : undefined;

    return (
        <ThemeBoardPanel panelId={panelId} membership={membership} onInspect={(code, at) => setInspect({ code, ...at })}>
            {inspect && (
                <StockHistoryPopover
                    key={`${inspect.code}@${inspect.x},${inspect.y}`}
                    code={inspect.code}
                    name={stock?.name ?? inspect.code}
                    marketCap={stock?.marketCap ?? null}
                    date={replayDate}
                    time={time}
                    coverage={coverage}
                    at={inspect}
                    onClose={() => setInspect(null)}
                />
            )}
        </ThemeBoardPanel>
    );
}

/** 그날 이전 이력이 아예 없는 날(이력이 덮는 기간의 첫날 이하) — 소속이 비어도 "없음"이 아니라 "아직 모름". */
const beforeCoverage = (date: string, c: Coverage | null): boolean => !!date && (!c || date <= c.from);

/** 헤더 알림 — 이력 범위 앞이면 소속이 비었다고, 범위 뒤면 어디까지 쌓였는지. */
function coverageNote(date: string, c: Coverage | null): string | null {
    if (!date) return null;
    if (!c) return "이력 없음 — 소속 비었음";
    if (date <= c.from) return `이력 범위 앞(${c.from}~) — 소속 비었음`;
    if (date > c.to) return `이력은 ${c.to}까지`;
    return null;
}
