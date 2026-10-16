// 테마 보드 패널의 몸 — 경로의 (날짜, 시각)의 테마 단면. 시각이 없으면 장 마감(15:30).
// 「테마」(이력 소속 — ThemePanel)와 「시트 테마」(시계열에 실려 온 시트 소속 — SheetThemePanel)가 같이 쓴다.
// 종목 줄 클릭 = 경로의 종목, 테마 머리 클릭 = 그 카드 접기/펼치기(경로에 테마는 없다).
// 이 패널에서 고른 종목은 판을 움직이지 않고, 다른 곳에서 바뀐 종목은 그 테마들을 맨 위로 올린다.
import { useCallback, useMemo, type ReactNode } from "react";
import { CLOSE_TIME, usePanelPath } from "../../store/paths.js";
import { usePanelUi, usePanelUiNumber } from "../../store/panelUi.js";
import { useDayReplay } from "../../market/queries.js";
import { kstToUnix } from "../../market/domain.js";
import type { PriceMode, ReplayStock } from "../../market/types.js";
import { DEFAULT_UNIVERSE, buildThemeBoard, focusPlace } from "../../board/viewModel.js";
import { BoardLayout } from "../../board/BoardLayout.js";
import { useSelfPick } from "../../board/useSelfPick.js";
import { FlatStockList } from "../../board/FlatStockList.js";
import type { OnInspect } from "../../board/boardTypes.js";
import { Center, NumberField } from "../../ui/chrome.js";
import { usePanelHeader } from "../../header/registry.js";

type BoardView = "group" | "amount" | "rate";
const VIEW_VALUES: readonly { v: BoardView; label: string }[] = [
    { v: "group", label: "테마" },
    { v: "amount", label: "대금순" },
    { v: "rate", label: "등락순" },
];
const VIEWS = VIEW_VALUES.map((o) => o.v);
const MARKET_VALUES: readonly { v: PriceMode; label: string }[] = [
    { v: "un", label: "통합" },
    { v: "krx", label: "KRX" },
];
const MARKETS = MARKET_VALUES.map((o) => o.v);
/** 유니버스 상위 N 의 범위 — 0 = 그 순위로는 안 뽑음. 하루 종목이 ~900 이라 2000 이면 사실상 전부. */
const UNIVERSE_RANGE = { min: 0, max: 2000 };

/** 종목 → 테마 바꿔 끼우기 — 그날 시계열의 시트 소속 대신. 여기 없는 종목은 테마 없음(미분류). */
export interface Membership {
    /** 받은 날짜의 소속(아직 못 받았으면 undefined). */
    themes: ReadonlyMap<string, string[]> | undefined;
    error: Error | null;
    /** 미분류 꼬리 카드 이름(이력 소속이면 「테마 이력 없음」 · 「이력 범위 밖」). */
    unclassified: string;
    /** 헤더에 붙일 소속 알림(이력이 덮는 기간 밖 등). 없으면 null. */
    note: string | null;
}

export function ThemeBoardPanel({ panelId, membership, onInspect, children }: {
    panelId: string;
    /** 없으면 시계열의 시트 소속 그대로. */
    membership?: Membership;
    onInspect?: OnInspect;
    /** 판 위에 덧붙일 것(우클릭 창 등). */
    children?: ReactNode;
}): JSX.Element {
    const { path, write } = usePanelPath(panelId);
    const { code, date, time } = path.s;
    const [view, setView] = usePanelUi(panelId, "view", VIEWS, "group");
    const [market, setMarket] = usePanelUi(panelId, "market", MARKETS, "un");
    const [amountN, setAmountN] = usePanelUiNumber(panelId, "amountN", UNIVERSE_RANGE, DEFAULT_UNIVERSE.amountN);
    const [rateN, setRateN] = usePanelUiNumber(panelId, "rateN", UNIVERSE_RANGE, DEFAULT_UNIVERSE.rateN);
    const q = useDayReplay(date);

    // 날짜가 바뀌는 동안엔 직전 날의 데이터가 온다 — 시각은 **받은 데이터의 날짜**로 잰다(다른 날 시각을 섞지 않게).
    const replay = q.data;
    const swapping = membership !== undefined;
    const themes = membership?.themes;
    const index = useMemo(() => {
        if (!replay || (swapping && !themes)) return null;
        const swap = (s: ReplayStock): ReplayStock => (themes ? { ...s, themes: themes.get(s.code) ?? [] } : s);
        return new Map(replay.stocks.map((s) => [s.code, swap(s)]));
    }, [replay, themes, swapping]);
    const shownTime = time || CLOSE_TIME;
    const tUnix = replay ? kstToUnix(replay.date, `${shownTime}:00`) : 0;
    const board = useMemo(() => (index ? buildThemeBoard(index, tUnix, market, { amountN, rateN }) : null), [index, tUnix, market, amountN, rateN]);

    // 이 패널에서 고른 종목 — 그 종목으로 바뀐 것은 판을 움직이지 않는다(제자리).
    const { pick, isSelfPick } = useSelfPick(code, useCallback((c: string) => write({ code: c }), [write]));

    const universe = <UniverseFields amountN={amountN} rateN={rateN} setAmountN={setAmountN} setRateN={setRateN} />;
    usePanelHeader(panelId, {
        info: [
            { id: "when", name: "날짜·시각", tabular: true, text: () => (date ? `${date} ${time || `${CLOSE_TIME} 마감`}` : null) },
            // 현재 종목이 테마 카드 밖이면 그 자리 — 카드에 들었으면 판이 그 카드를 맨 위로 올리므로 따로 안 보인다.
            // 미분류·개별은 테마 보기에서만(평면 목록엔 꼬리 카드가 없고 종목이 목록에 그대로 있다). 랭킹 밖은 어느 보기든.
            {
                id: "focus", name: "현재 종목 자리", help: "현재 종목이 테마 카드 밖일 때 — 미분류·개별 = 아래 꼬리 카드(테마 보기), 랭킹 밖 = 그 시각 거래대금·등락률 상위에 없음",
                text: () => {
                    const place = board ? focusPlace(board.grouped, code) : null;
                    if (!place || (place !== "랭킹 밖" && view !== "group")) return null;
                    return `현재 종목 ${place === "미분류" && membership ? membership.unclassified : place}`;
                },
            },
            { id: "membership", name: "소속 알림", help: "소속 출처가 이 날짜를 다 덮지 못할 때", text: () => membership?.note ?? null },
            { id: "count", name: "종목 수", tabular: true, help: "지금 유니버스의 종목 수", text: () => (board ? `${board.stocks.length}종목` : null) },
            // 날짜가 바뀌는 동안엔 직전 날의 판을 그대로 두므로 알림만.
            { id: "loading", name: "불러오는 중", transient: true, tone: "accent", text: () => (q.isPlaceholderData && q.isFetching ? "불러오는 중…" : null) },
        ],
        controls: [
            { kind: "choice", id: "view", name: "보기", values: VIEW_VALUES, value: view, set: (v) => setView(v as BoardView) },
            { kind: "choice", id: "market", name: "기준", help: "등락률 기준가 시장", values: MARKET_VALUES, value: market, set: (v) => setMarket(v as PriceMode) },
            {
                // 줄에 꺼내면 판을 거치지 않고 칸 둘을 바로 고친다(renderLine) — 판 안에서는 요약 트리거가 같은 칸 둘을 연다.
                kind: "popover", id: "universe", name: "유니버스", help: UNIVERSE_HELP, label: `${amountN} ∪ ${rateN}`,
                renderPopover: () => <div style={{ padding: "8px 12px" }}>{universe}</div>,
                renderLine: () => universe,
            },
        ],
    });

    let body: ReactNode;
    if (!date) body = <Center>경로 {path.id} 에 날짜를 넣으세요.</Center>;
    else if (q.isError) body = <Center>테마 오류: {q.error.message}</Center>;
    else if (membership?.error) body = <Center>이력 오류: {membership.error.message}</Center>;
    else if (!board && replay && swapping) body = <Center>{replay.date} 이력 소속 불러오는 중…</Center>;
    else if (!board) body = <Center>{date} 불러오는 중… (처음 보는 날짜는 서버가 굽느라 오래 걸릴 수 있다)</Center>;
    else if (view === "group")
        body = (
            <BoardLayout
                key={replay?.date}
                grouped={board.grouped}
                parents={board.parents}
                focusCode={code}
                onPick={pick}
                isSelfPick={isSelfPick}
                onInspect={onInspect}
                unclassifiedName={membership?.unclassified}
            />
        );
    else body = <FlatStockList stocks={board.stocks} code={code} onPick={pick} onInspect={onInspect} sort={view} />;

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
            {body}
            {children}
        </div>
    );
}

const UNIVERSE_HELP = "유니버스 = 그 시각 거래대금 상위 ∪ 등락률 상위(0 = 그 순위로는 안 뽑음)";

/** 유니버스 상위 N 두 칸 — 헤더 줄(꺼냈을 때)과 컨트롤 판의 판이 같은 칸을 쓴다. 칸이 친 글자를 스스로 든다(NumberField). */
function UniverseFields({ amountN, rateN, setAmountN, setRateN }: { amountN: number; rateN: number; setAmountN: (v: number) => void; setRateN: (v: number) => void }): JSX.Element {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }} title={UNIVERSE_HELP}>
            대금 상위
            <NumberField value={amountN} onCommit={setAmountN} title="거래대금 상위 N" />
            ∪ 등락 상위
            <NumberField value={rateN} onCommit={setRateN} title="등락률 상위 N" />
        </span>
    );
}
