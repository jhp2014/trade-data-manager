// 상단 줄 — 경로 카드들(가로 스크롤 — 넘쳐도 아래로 내려가지 않는다) + ⚙(설정 창: 경로 추가·삭제 · 패널 열기 · 화면 · 차트 · 단축키).
// 경로 카드에 입력칸은 없다. 날짜만 여기서 고르고(거래일 판), 시각·종목은 패널 클릭(분봉 차트·뉴스 줄·테마 패널)이 쓴다.
// 이름표(A·B) 클릭 = 그 경로를 활성으로. 펼침/접음은 카드에 마우스를 올리면 끝에 나오는 ▸/◂ 로(활성과 따로).
// 활성 경로는 경로 색 고리로 보인다 — 접혀 있어도. 활성은 그 밖에 날짜를 바꾸거나, 그 경로를 보는 패널에서 클릭하거나,
// 펼친 카드의 빈 곳을 눌러도 옮겨 온다.
// 우클릭(펼친 카드·접힌 이름표) = 판: 다른 경로 가져오기 · 기록(종목·날짜) — shell/PathMenu.
import { CLOSE_TIME, usePaths, type Path } from "../store/paths.js";
import { stockLabel, summarizeSituation } from "./pathSummary.js";
import { PathBadge } from "./PathBadge.js";
import { useStockName } from "../market/queries.js";
import { useUi } from "../store/ui.js";
import { PathDate } from "./PathDate.js";
import { LAYER_ATTR } from "../ui/popover/FloatingSurface.js";
import { TriggerPopover } from "../ui/popover/TriggerPopover.js";
import { closeAllPopovers } from "../ui/popover/stack.js";
import { PathMenu } from "./PathMenu.js";
import { ScrollRow } from "../ui/ScrollRow.js";

export function PathBar(): JSX.Element {
    const paths = usePaths((st) => st.paths);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            {/* 경로 영역 — 거의 다 차지하고, 넘치면 가로 스크롤(휠도 가로로). 안쪽 2px = 활성 고리(바깥 1px)가 잘리지 않게. */}
            <ScrollRow gap={8} data-path-row="" style={{ flex: 1, padding: 2 }}>
                {paths.map((p) => (
                    <PathCard key={p.id} path={p} />
                ))}
                {/* 끝 여유 — 끝까지 스크롤한 채 마지막 카드에 올려 ▸/◂ 가 펴져도(약 20px) 영역 밖으로 잘리지 않게. */}
                <span aria-hidden style={{ flexShrink: 0, width: 12 }} />
            </ScrollRow>
            <button
                title="설정 (Ctrl+,) — 경로 추가·삭제 · 패널 열기 · 화면 · 차트 · 단축키"
                aria-label="설정"
                className="icon-btn"
                onClick={() => useUi.getState().openSettings()}
                style={{ fontSize: 16, lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}
            >
                ⚙
            </button>
        </div>
    );
}

/** 경로 카드 하나 — 펼침이면 날짜·시각·종목, 접힘이면 이름표만. 우클릭 = 판(다른 경로 가져오기 · 기록). */
function PathCard({ path }: { path: Path }): JSX.Element {
    return (
        <TriggerPopover align="start" width={340} layout="column" trigger={(open, toggle) => <CardFace path={path} menuOpen={open} onMenu={toggle} />}>
            {(close) => <PathMenu pathId={path.id} onClose={close} />}
        </TriggerPopover>
    );
}

function CardFace({ path, menuOpen, onMenu }: { path: Path; menuOpen: boolean; onMenu: () => void }): JSX.Element {
    const isActive = usePaths((st) => st.active === path.id);
    const setActive = usePaths((st) => st.setActive);
    const toggleOpen = usePaths((st) => st.toggleOpen);
    const write = usePaths((st) => st.write);
    const name = useStockName(path.s.code);
    const time = path.s.time || CLOSE_TIME;
    const stock = stockLabel(path.s.code, name);
    // 활성 = 경로 색 테두리 + 바깥 고리. 비활성 = 회색 테두리.
    const frame: React.CSSProperties = {
        border: `1px solid ${isActive ? path.color : "var(--border)"}`,
        boxShadow: isActive ? `0 0 0 1px ${path.color}` : "none",
        borderRadius: 6, height: 26, boxSizing: "border-box",
    };
    // 우클릭 = 판 열고 닫기. 열 때는 떠 있던 판(날짜 판 등)을 먼저 닫는다 — 같은 카드 아래에 겹쳐 뜨지 않게.
    // 날짜 판(portal 이어도 React 트리로 올라온다) 안의 우클릭은 그 판의 것이라 건드리지 않는다.
    const onContextMenu = (e: React.MouseEvent): void => {
        if ((e.target as Element).closest(`[${LAYER_ATTR}]`)) return;
        e.preventDefault();
        if (!menuOpen) closeAllPopovers();
        onMenu();
    };
    // 판이 열린 채 카드를 왼쪽으로 누르면 판을 닫는다 — 카드 전체가 판의 앵커라 판 스택은 이 누름을 "바깥"으로 치지 않는다.
    // 누른 것(날짜 버튼·이름표·접기 버튼·빈 곳)은 그대로 제 일을 한다.
    const onMouseDownCapture = (e: React.MouseEvent): void => {
        // Ctrl+클릭은 macOS 의 우클릭이라 뺀다(그 뒤의 contextmenu 가 판을 닫는다).
        if (menuOpen && e.button === 0 && !e.ctrlKey && !(e.target as Element).closest(`[${LAYER_ATTR}]`)) onMenu();
    };
    const badge = (
        <button
            title={`경로 ${path.id}${isActive ? " (활성)" : " — 누르면 활성"} · ${summarizeSituation(path.s, stock)} · 우클릭 = 다른 경로·기록`}
            onClick={() => setActive(path.id)}
            style={{ border: "none", padding: 0, background: "none", cursor: "pointer", display: "inline-flex" }}
        >
            <PathBadge path={path} />
        </button>
    );
    // 접기/펼치기 — 카드에 마우스를 올리면 끝에 살짝 늘며 나온다(.hover-host / .hover-reveal). 활성은 그대로.
    const fold = (
        <button
            className="hover-reveal"
            title={path.open ? `경로 ${path.id} 접기` : `경로 ${path.id} 펼치기`}
            aria-expanded={path.open}
            onClick={() => toggleOpen(path.id)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, lineHeight: 1, color: "var(--text-3)" }}
        >
            {path.open ? "◂" : "▸"}
        </button>
    );

    if (!path.open) {
        return (
            <span
                data-path-card={path.id}
                className="hover-host"
                onContextMenu={onContextMenu}
                onMouseDownCapture={onMouseDownCapture}
                style={{ ...frame, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 3px" }}
            >
                {badge}
                {fold}
            </span>
        );
    }
    return (
        <div
            data-path-card={path.id}
            className="hover-host"
            title={isActive ? undefined : "빈 곳(또는 이름표)을 누르면 활성 — a/d 가 이 경로의 시각을 움직인다"}
            onContextMenu={onContextMenu}
            onMouseDownCapture={onMouseDownCapture}
            onClick={(e) => {
                // 빈 곳만 — 버튼(이름표·날짜·접기)은 제 일을 하고, 날짜 판(portal 이어도 React 트리로 올라온다) 안의 클릭은 활성으로 치지 않는다.
                // 날짜를 실제로 고르면 그 쓰기가 활성을 옮긴다(둘러보기만 하면 그대로).
                if ((e.target as Element).closest(`button, [${LAYER_ATTR}]`)) return;
                setActive(path.id);
            }}
            style={{ ...frame, display: "flex", alignItems: "center", gap: 6, padding: "0 6px", fontSize: 12, cursor: isActive ? undefined : "pointer" }}
        >
            {badge}
            <PathDate date={path.s.date} onPick={(d) => write(path.id, { date: d })} />
            <Sep />
            <span className="tabular" title={path.s.time ? "시각 — 분봉 차트·뉴스 줄을 눌러 바꾼다" : "시각 미정 = 장 마감"} style={{ color: path.s.time ? "var(--text-primary)" : "var(--text-3)" }}>
                {time}
            </span>
            <Sep />
            <span title={path.s.code ? `${path.s.code} — 테마 패널의 종목 줄을 눌러 바꾼다` : "종목 — 테마 패널의 종목 줄을 눌러 고른다"} style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: stock ? "var(--text-primary)" : "var(--text-3)" }}>
                {stock ?? "종목 —"}
            </span>
            {fold}
        </div>
    );
}

const Sep = (): JSX.Element => <span style={{ width: 1, height: 12, background: "var(--border)" }} />;
