// 테마 보드 패널의 몸 — 경로의 (날짜, 시각)의 테마 단면. 시각이 없으면 장 마감(15:30).
// 시계열(/day-flow)에는 소속이 없다 — 테마는 언제나 membership 이 입힌다(공급원은 호스트 판 몫 —
// 지금은 BoardPanel 이 tdm-ai 장중 복기 분류 장부(/replay/day)로 입힌다).
// 종목 줄 클릭 = 경로의 종목, 테마 이름 클릭 = w/s 선택 테마 + 이 판 부착(store/rowNav — 선택 테마는 판의 커서라 경로에 없다),
// 머리 나머지 클릭 = 그 카드 접기/펼치기.
// 이 패널에서 고른 종목은 판을 움직이지 않고, 다른 곳에서 바뀐 종목은 그 테마들을 맨 위로 올린다.
// 새 날짜를 받는 동안엔 직전 판을 그 판의 (종목, 시각) 그대로 흐리게 두고 가운데 카드로 알린다(useShownMoment) —
// 새 종목을 옛 날 판에 먼저 올리면 「다 받았다」로 읽힌다.
import { useCallback, useMemo, type ReactNode } from "react";
import { CLOSE_TIME, usePanelPath } from "../../store/paths.js";
import { usePanelUi, usePanelUiNumber, usePanelUiText } from "../../store/panelUi.js";
import { useIsAttached, useNavTarget, useRowNav, type NavTarget } from "../../store/rowNav.js";
import { cardOrder, navCard, stepInCard, stepTheme, themesOf } from "../../board/themeNav.js";
import { useDayFlow, useStockNameOf } from "../../market/queries.js";
import { kstToUnix } from "../../market/domain.js";
import { deriveFlow } from "../../market/flowDerive.js";
import type { PriceMode } from "../../market/types.js";
import { DEFAULT_UNIVERSE, buildThemeBoard, focusPlace, type ThemedStock } from "../../board/viewModel.js";
import { BoardLayout } from "../../board/BoardLayout.js";
import { useSelfPick } from "../../board/useSelfPick.js";
import { useShownMoment } from "./useShownMoment.js";
import { FlatStockList } from "../../board/FlatStockList.js";
import { Center, NumberField } from "../../ui/chrome.js";
import { usePanelHeader } from "../../header/registry.js";
import type { ControlSpec } from "../../header/spec.js";

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

/** 종목 → 테마 입히기 — 시계열(/day-flow)에는 소속이 없다. 여기 없는 종목은 테마 없음(미분류). */
export interface Membership {
    /** 받은 날짜의 소속(아직 못 받았으면 undefined). */
    themes: ReadonlyMap<string, string[]> | undefined;
    error: Error | null;
    /** 미분류 꼬리 카드 이름 — 공급원이 "소속 없음"의 뜻을 정한다(범위 밖 · 기록 없음 등). */
    unclassified: string;
    /** 헤더에 붙일 소속 알림(공급원이 그 날짜를 다 덮지 못할 때 등). 없으면 null. */
    note: string | null;
    /** 종목 → 줄 툴팁(title) 글 — 공급원이 보일 때만 준다(사후정보를 숨기는 판단은 공급원 몫). */
    notes?: ReadonlyMap<string, string>;
}

export function ThemeBoardPanel({ panelId, membership, controls = [] }: {
    panelId: string;
    /** 종목 → 테마 소속(필수 — 시계열에는 소속이 없다). */
    membership: Membership;
    /** 공급원(호스트 판)의 컨트롤 — 보드 컨트롤 뒤에 붙는다(헤더 선언은 패널당 하나라 이 몸이 모아 게시한다). */
    controls?: readonly ControlSpec[];
}): JSX.Element {
    const { path, write } = usePanelPath(panelId);
    const { date } = path.s;
    // 판이 입는 종목·시각 — 새 날짜를 받는 동안엔 직전 판의 것(useShownMoment). 받는 중인 경로 상황은 pending.
    const { code, time, pending } = useShownMoment(panelId);
    const [view, setView] = usePanelUi(panelId, "view", VIEWS, "group");
    const [market, setMarket] = usePanelUi(panelId, "market", MARKETS, "un");
    const [amountN, setAmountN] = usePanelUiNumber(panelId, "amountN", UNIVERSE_RANGE, DEFAULT_UNIVERSE.amountN);
    const [rateN, setRateN] = usePanelUiNumber(panelId, "rateN", UNIVERSE_RANGE, DEFAULT_UNIVERSE.rateN);
    const q = useDayFlow(date);
    const nameOf = useStockNameOf();

    // 날짜가 바뀌는 동안엔 직전 날의 데이터가 온다 — 시각은 **받은 데이터의 날짜**로 잰다(다른 날 시각을 섞지 않게).
    const flow = q.data;
    /** 판이 그리는 날짜 — 대기 중엔 직전 날(헤더도 판이 그리는 것을 말한다). */
    const shownDate = flow?.date ?? date;
    const themes = membership.themes;
    const notes = membership.notes;
    const index = useMemo(() => {
        if (!flow || !themes) return null;
        // 원값 → % 파생(deriveFlow — flow 객체당 한 벌 공유) + 테마 입히기. 보드는 % 공간(ThemedStock)만 본다.
        const entries: [string, ThemedStock][] = [];
        for (const d of deriveFlow(flow).values()) entries.push([d.code, { ...d, themes: themes.get(d.code) ?? [], note: notes?.get(d.code) }]);
        return new Map(entries);
    }, [flow, themes, notes]);
    const shownTime = time || CLOSE_TIME;
    const tUnix = flow ? kstToUnix(flow.date, `${shownTime}:00`) : 0;
    const board = useMemo(
        () => (index ? buildThemeBoard(index, tUnix, market, { amountN, rateN }, nameOf) : null),
        [index, tUnix, market, amountN, rateN, nameOf],
    );

    // 이 패널에서 고른 종목 — 그 종목으로 바뀐 것은 판을 움직이지 않는다(제자리). 기억 지우기는 경로의 종목으로 잰다.
    const { pick, isSelfPick } = useSelfPick(path.s.code, useCallback((c: string) => write({ code: c }), [write]));

    // w/s 순회(store/rowNav) — 선택 테마는 이 판의 커서다(경로·토큰에 없다). 걷기는 경로에 바깥 쓰기(write)라
    // 도착 종목의 테마들이 띠로 올라온다. 테마 보기에서 본문을 그리는 동안만 대상을 등록한다(대기·오류·평면 목록엔 걷지 않음).
    const attached = useIsAttached(panelId);
    const [prefTheme, setPrefTheme] = usePanelUiText(panelId, "navTheme");
    const walking = view === "group" && board !== null && date !== "" && !q.isError && !membership.error && pending === null;
    const card = board ? navCard(board.grouped, code, prefTheme) : null;
    const navTarget = useMemo<NavTarget | null>(() => {
        if (!walking || !board) return null;
        return {
            step: (dir) => {
                const next = card ? stepInCard(card.stocks, code, dir) : null;
                if (next !== null && next !== code) write({ code: next });
            },
            stepGroup: (dir) => {
                const next = stepTheme(themesOf(board.grouped, code).map((g) => g.theme), card?.theme ?? null, dir);
                if (next !== null) setPrefTheme(next);
            },
        };
    }, [walking, board, card, code, write, setPrefTheme]);
    useNavTarget(panelId, navTarget);
    // 테마 이름 클릭 = 그 테마를 선택 + 이 판 부착. 현재 종목이 그 테마에 없으면 그 테마 첫 줄로 — 고른 테마를 바로 걷는다.
    const selectNavTheme = useCallback(
        (theme: string) => {
            useRowNav.getState().attach(panelId);
            setPrefTheme(theme);
            const g = board?.grouped.themes.find((x) => x.theme === theme);
            const first = g && !g.stocks.some((s) => s.code === code) ? cardOrder(g.stocks)[0] : undefined;
            if (first) write({ code: first.code });
        },
        [panelId, setPrefTheme, board, code, write],
    );

    const universe = <UniverseFields amountN={amountN} rateN={rateN} setAmountN={setAmountN} setRateN={setRateN} />;
    usePanelHeader(panelId, {
        info: [
            { id: "when", name: "날짜·시각", help: "판이 그리는 날짜·시각 — 새 날짜를 받는 동안엔 직전 판의 것", tabular: true, text: () => (date ? momentLabel(shownDate, time) : null) },
            // 현재 종목이 테마 카드 밖이면 그 자리 — 카드에 들었으면 판이 그 카드를 맨 위로 올리므로 따로 안 보인다.
            // 미분류·개별은 테마 보기에서만(평면 목록엔 꼬리 카드가 없고 종목이 목록에 그대로 있다). 랭킹 밖은 어느 보기든.
            {
                id: "focus", name: "현재 종목 자리", help: "현재 종목이 테마 카드 밖일 때 — 미분류·개별 = 아래 꼬리 카드(테마 보기), 랭킹 밖 = 그 시각 거래대금·등락률 상위에 없음",
                text: () => {
                    const place = board ? focusPlace(board.grouped, code) : null;
                    if (!place || (place !== "랭킹 밖" && view !== "group")) return null;
                    return `현재 종목 ${place === "미분류" ? membership.unclassified : place}`;
                },
            },
            { id: "membership", name: "소속 알림", help: "소속 출처가 이 날짜를 다 덮지 못할 때", text: () => membership.note },
            { id: "count", name: "종목 수", tabular: true, help: "지금 유니버스의 종목 수", text: () => (board ? `${board.stocks.length}종목` : null) },
            // 새 날짜를 받는 동안의 알림은 헤더 칩이 아니라 본문 가운데 카드(PendingCard) — 흐린 판 위에서 놓치지 않게.
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
            ...controls,
        ],
    });

    let body: ReactNode;
    if (!date) body = <Center>경로 {path.id} 에 날짜를 넣으세요.</Center>;
    else if (q.isError) body = <Center>테마 오류: {q.error.message}</Center>;
    else if (membership.error) body = <Center>소속 오류: {membership.error.message}</Center>;
    else if (!board && flow) body = <Center>{flow.date} 소속 불러오는 중…</Center>;
    else if (!board) body = <Center>{date} 불러오는 중… (서버가 그날 전 종목을 즉석 계산한다 — 수 초)</Center>;
    else if (view === "group")
        body = (
            <BoardLayout
                key={flow?.date}
                grouped={board.grouped}
                parents={board.parents}
                focusCode={code}
                onPick={pick}
                isSelfPick={isSelfPick}
                unclassifiedName={membership.unclassified}
                navTheme={attached ? (card?.theme ?? null) : null}
                onNavSelect={selectNavTheme}
            />
        );
    else body = <FlatStockList stocks={board.stocks} code={code} onPick={pick} sort={view} />;

    // 대기 중 = 직전 날 판을 흐리게(클릭 막음) + 가운데 카드. 감싸는 div 는 늘 같은 자리에 둔다 — 대기 시작·끝에 판이
    // 다시 마운트되면(승격·스크롤 초기화) 기다리는 사이 판이 한 번 더 움직인다.
    const waiting = pending !== null && flow !== undefined;
    return (
        <div style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
            <div
                data-stale={waiting ? "" : undefined}
                aria-hidden={waiting ? true : undefined}
                style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...(waiting ? { opacity: 0.35, filter: "grayscale(1)", pointerEvents: "none" } : {}) }}
            >
                {body}
            </div>
            {waiting && (
                <PendingCard
                    target={momentLabel(pending.date, pending.time)}
                    shown={momentLabel(shownDate, time)}
                    // 새 날짜 소속은 아직 모른다 — 「테마를 위로」처럼 결과를 단정하지 않는다(미분류·랭킹 밖일 수 있다).
                    next={pending.code !== "" && pending.code !== code ? `${nameOf(pending.code) ?? pending.code} 자리로` : null}
                />
            )}
        </div>
    );
}

/** 날짜 + 시각(없으면 장 마감) — 헤더 "날짜·시각"과 대기 카드가 같은 꼴로 말한다. */
function momentLabel(date: string, time: string): string {
    return `${date} ${time || `${CLOSE_TIME} 마감`}`;
}

/** 새 날짜를 받는 동안 흐린 판 위 가운데 카드 — 받는 것 · 지금 흐린 판 · 도착하면 바뀔 것. 읽는 것이라 클릭을 받지 않는다. */
function PendingCard({ target, shown, next }: { target: string; shown: string; next: string | null }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div
                role="status"
                data-pending-card=""
                style={{ background: "var(--surface)", border: "1px solid rgba(22,121,111,0.4)", borderRadius: 8, padding: "10px 18px", textAlign: "center", maxWidth: "calc(100% - 32px)", boxSizing: "border-box" }}
            >
                <div className="tabular" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-hover)" }}>
                    {target} 불러오는 중…
                </div>
                <div className="tabular" style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                    흐린 판 = {shown}
                </div>
                {next !== null && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>도착하면 {next}</div>}
            </div>
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
