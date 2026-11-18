// 상단 줄 — 경로 카드들(가로 스크롤 — 넘쳐도 아래로 내려가지 않는다) + 「기록」(기록 판 — 토큰 기록 · 탐색 기록, Tab) + ⚙(설정 창: 경로 추가·삭제 · 패널 열기 · 화면 · 차트 · 단축키).
// 경로 카드에 입력칸은 없다. 날짜만 여기서 고르고(거래일 판), 시각·종목은 패널 클릭(분봉 차트·뉴스 줄)이 쓴다.
// 종목 입구 = 테마 보드의 종목 줄 클릭 · 기록 판(Tab — 토큰 기록 · 탐색 기록).
// 이름표(A·B) 클릭 = 그 경로를 활성으로. 펼침/접음은 카드에 마우스를 올리면 끝에 나오는 ▸/◂ 로(활성과 따로).
// 활성 경로는 경로 색 고리로 보인다 — 접혀 있어도. 활성은 그 밖에 날짜를 바꾸거나, 그 경로를 보는 패널에서 클릭하거나,
// 펼친 카드의 빈 곳을 눌러도 옮겨 온다.
// 옛 우클릭 판(다른 경로 가져오기 · 기록)은 2026-11-18 은퇴 — 기록은 기록 판(Tab)의 「탐색 기록」으로, 가져오기는 탐색 기록이 대신한다.
import { CLOSE_TIME, usePaths, type Path } from "../store/paths.js";
import { stockLabel, summarizeSituation } from "./pathSummary.js";
import { PathBadge } from "./PathBadge.js";
import { useStockName } from "../market/queries.js";
import { useUi } from "../store/ui.js";
import { PathDate } from "./PathDate.js";
import { LAYER_ATTR } from "../ui/popover/FloatingSurface.js";
import { ScrollRow } from "../ui/ScrollRow.js";
import { HistoryButton } from "./TokenHistory.js";

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
            <HistoryButton />
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

/** 경로 카드 하나 — 펼침이면 날짜·시각·종목, 접힘이면 이름표만. */
function PathCard({ path }: { path: Path }): JSX.Element {
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
    const badge = (
        <button
            title={`경로 ${path.id}${isActive ? " (활성)" : " — 누르면 활성"} · ${summarizeSituation(path.s, stock)}`}
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
            <span title={path.s.code ? path.s.code : "종목 — 테마 보드의 종목 줄 클릭 · 기록 판(Tab)으로 바꾼다"} style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: stock ? "var(--text-primary)" : "var(--text-3)" }}>
                {stock ?? "종목 —"}
            </span>
            {fold}
        </div>
    );
}

const Sep = (): JSX.Element => <span style={{ width: 1, height: 12, background: "var(--border)" }} />;
