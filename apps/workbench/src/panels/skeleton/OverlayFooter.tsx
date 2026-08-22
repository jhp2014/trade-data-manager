// 골격 겹쳐 그리기의 **발끝 줄** — 지금 무엇을 보고 있고 손으로 무엇을 할 수 있나.
//
// 조작 안내가 여기 있는 이유: 그림 위에서 포인터를 받는 것들(히트라인·피벗 손잡이·핀 세로선)에는
// `<title>` 을 안 단다(사용자 요구) — 값을 읽으려고 손을 올린 그 자리에 브라우저 툴팁이 떠서 판독을
// 가리기 때문이다. 그 안내를 대신 받는 게 이 줄이다.
//
// **높이가 절대 안 변해야 한다**(nowrap + ellipsis). 캔들 상태처럼 켰다 껐다 하는 표시가 여기 사는 것도
// 그래서다 — 헤더에 두면 칩이 늘었다 줄었다 할 때마다 눈이 컨트롤 줄을 다시 훑어야 했다.
// (머리글이 줄을 바꿔 그림 상자 높이가 튀던 문제 자체는 사라졌다 — PanelHeader 가 이제 가로로 스크롤한다.)
import { AMOUNT_LEVEL_EDGES_EOK, AMOUNT_LEVEL_WIDTH } from "../../chart/chartUtils.js";
import { groupColor } from "../../styles/palette.js";

export function OverlayFooter({ grain, groupNames, locked, themeMode, themeLineCount, candles, amountWidthOn }: {
    grain: "daily" | "minute";
    /** 지금 조사 중인 선의 그룹 이름들 — 소속이 발끝에서 바로 읽힌다(따로 열어보지 않게). */
    groupNames: string[];
    locked: boolean;
    /** 테마 모드(짚은 하나에 테마를 펼친 상태) — 흐린 라벨 호버의 뜻이 달라진다. */
    themeMode: boolean;
    /** 펼쳐진 테마 선 수(0이면 안 적는다). */
    themeLineCount: number;
    /** 켜 둔 캔들 — 이름을 다 적어 어느 종목을 보고 있는지 남긴다. */
    candles: { names: string[]; loading: boolean; onClear: () => void };
    /** 굵기 범례를 띄울까 — 굵기가 켜졌을 때만. */
    amountWidthOn: boolean;
}): JSX.Element {
    const isDaily = grain === "daily";
    return (
        <div style={footer}>
            {groupNames.length > 0 && (
                <span style={{ marginRight: 8 }}>
                    {groupNames.map((name) => (
                        <span key={name} style={{ color: groupColor(name), fontWeight: 600, marginRight: 5 }}>{name}</span>
                    ))}
                    ·
                </span>
            )}
            {isDaily ? "일봉 · 세로 = 앵커 대비 %" : "분봉·타점 정규화(선 1 = 타점 1 · 원점 이후 점선=미래) · 세로 = 전일 종가 대비 %p 차이 · 괄호 = 절대값(시각·전일比)"} · 휠 = 가로 확대 · Shift+휠 = 세로 확대 · 축 드래그 = 그 축 확대 · 드래그 이동 · 우클릭 = 그룹 · 점 클릭 = 값 붙잡기
            {locked && <span style={{ color: "var(--text-secondary)" }}> · 척도 고정됨</span>}
            <span style={{ color: "var(--text-tertiary)" }}>
                {isDaily ? " · 선택된 라벨 재클릭 = 캔들 · 축 더블클릭 = 그 축 원위치" : " · 선 클릭 = 캔들 · T = 테마 · 축 더블클릭 = 그 축 원위치"}
            </span>
            {themeMode && <span style={{ color: "var(--text-secondary)" }}> · 테마 모드(흐린 라벨 호버 = 그 골격선)</span>}
            {candles.names.length > 0 && (
                <span style={{ color: "var(--text-secondary)" }}>
                    {" · 캔들 "}
                    {candles.names.join("·")}
                    {candles.loading ? " …" : ""}
                    <button onClick={candles.onClear} title="켜 둔 캔들 전부 끄기" style={footerBtn}>✕</button>
                </span>
            )}
            {themeLineCount > 0 && (
                <span style={{ color: "var(--text-secondary)" }}> · 테마 {themeLineCount}선(분당 종가)</span>
            )}
            {/* 굵기 범례 — 굵기는 "굵다=크다"가 자명해서 색처럼 대응표가 꼭 필요하진 않지만,
                **단계 경계가 얼마인지**는 알아야 읽힌다(20 / 40 / 70 / 150억). 정확한 값은 숫자 라벨이 답한다. */}
            {!isDaily && amountWidthOn && (
                <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, marginLeft: 8, height: 12, verticalAlign: "middle" }}
                    title={`분당 거래대금 굵기 단계 — 경계 ${AMOUNT_LEVEL_EDGES_EOK.join("/")}억`}>
                    {AMOUNT_LEVEL_WIDTH.map((w, i) => (
                        <span key={i} style={{ width: 8, height: w, background: "var(--text-secondary)", borderRadius: w / 2 }} />
                    ))}
                    <span style={{ marginLeft: 3, color: "var(--text-tertiary)" }}>~{AMOUNT_LEVEL_EDGES_EOK.join("~")}억+/분</span>
                </span>
            )}
        </div>
    );
}

const footer: React.CSSProperties = { flexShrink: 0, padding: "3px 10px", borderTop: "1px solid var(--border-default)", fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
/** 푸터 안 인라인 버튼 — 상자·여백 없이 글자만(푸터 높이가 절대 안 변해야 그림이 안 튄다). */
const footerBtn: React.CSSProperties = { marginLeft: 4, padding: 0, border: "none", background: "none", color: "var(--text-tertiary)", cursor: "pointer", font: "inherit", lineHeight: "inherit" };
