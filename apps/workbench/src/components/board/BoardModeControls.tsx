// 보드 헤더 선언 — 보드 셋(실시간·복기·테마)이 같은 선언을 쓴다. 그리는 것은 셸(PanelFrame·모음 판).
// 거래대금·등락률 = flat 리스트의 정렬 기준, 테마 = 그룹 뷰. 셋은 상호배타라 순환이다.
// 있고 없고는 available 이 정한다(새로고침·시장은 실시간/복기 정체성) — 값 따라 뜨고 지는 게 아니다.
import { isBoardFilterActive, type BoardFilterExpr } from "@trade-data-manager/market/domain";
import type { ReactNode } from "react";
import { useUi } from "../../store/ui.js";
import { usePanelHeader } from "../header/registry.js";
import { useRowNavControl } from "../rowNavControl.js";
import type { RowNavOwner } from "../../lib/rowNav.js";

export type BoardMode = "amount" | "rate" | "group";
export type BoardSort = Exclude<BoardMode, "group">; // flat 리스트 정렬 기준(= 테마 아닌 BoardMode)

/**
 * 보드 공용 헤더 선언 — 패널 최상단에서 부른다(**로딩·오류 조기 반환보다 위** — 등록이 깜빡이면
 * 첫 줄이 생멸해 본문 높이가 출렁이고, 그동안 모음 판·숫자 단축키·배제 필터에 손이 안 닿는다.
 * w/s publish 와 같은 규칙). 셸이 첫 줄(점·종목수·필터 정보)과 모음 판을 그린다.
 *
 * label 은 값이 있을 때만 — 복기 스크럽 시각·비정상 상태처럼 점 색이 못 말해주는 것만(상수 라벨 금지).
 * 필터는 **정보와 컨트롤로 갈라 중복 선언**한다: "걸려 있다"는 사실(필터 N)은 첫 줄 정보가 늘 말하고
 * ("왜 종목이 안 보이지" 사고 방지 — 옛 헤더가 버튼을 접힘 밖에 두던 이유의 승계), 편집은 판형 컨트롤.
 */
export function useBoardHeader({ panelId, dotColor, label, count, mode, setMode, onRefresh, refreshing, market, onMarketToggle, filter, filterEditor, navOwner }: {
    panelId: string;
    dotColor: string;
    label?: string;
    /** 보드에 선 종목 수 — **본문이 안 설 때(로딩·오류)는 null**: 첫 줄이 "0종목"이나 낡은 수를 단정하지 않게 자리만 비운다. */
    count: number | null;
    mode: BoardMode;
    setMode: (m: BoardMode) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    market?: "krx" | "un";
    onMarketToggle?: () => void;
    filter?: BoardFilterExpr;
    filterEditor?: (close: () => void) => ReactNode;
    navOwner?: RowNavOwner;
}): void {
    const showReasons = useUi((s) => s.boardShowReasons);
    const toggleReasons = useUi((s) => s.toggleBoardReasons);
    const filterOn = filter ? isBoardFilterActive(filter) : false;
    const rowNavCtl = useRowNavControl(navOwner ?? null);

    usePanelHeader(panelId, {
        info: [
            {
                id: "status", name: "상태",
                help: label ?? "플레인·연결 상태 — 점 색이 말한다(실시간 = 빨강, 복기·분석 = 청록)",
                text: () => label ?? null,
                renderLine: () => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: dotColor }} />
                        {label !== undefined && <span style={{ fontSize: 10.5, color: dotColor, whiteSpace: "nowrap" }}>{label}</span>}
                    </span>
                ),
            },
            { id: "count", name: "종목 수", tabular: true, help: "지금 보드에 선 종목 수", text: () => (count === null ? null : `${count}종목`) },
            {
                id: "filter", name: "배제 필터", tone: "accent", available: !!filter,
                help: "걸린 배제 필터 그룹 수 — 편집은 컨트롤 판의 「배제 필터」",
                text: () => (filterOn && filter ? `필터 ${filter.groups.length}` : null),
            },
        ],
        controls: [
            {
                // label = 판의 열기 트리거 요약 — 걸린 개수(없으면 「없음」). 이름은 줄이 이미 말한다.
                kind: "popover", id: "filter", name: "배제 필터", label: filterOn && filter ? `${filter.groups.length}개` : "없음", width: 400,
                available: !!filter && !!filterEditor, on: filterOn, activeColor: "var(--accent-primary)",
                help: filterOn && filter ? `배제 필터 ${filter.groups.length}개 적용중 — 열어서 편집` : "배제 필터 편집",
                renderPopover: (close) => filterEditor?.(close),
            },
            rowNavCtl,
            {
                kind: "choice", id: "mode", name: "정렬·뷰", help: "무엇을 기준으로 줄 세울까 · 테마는 그룹 뷰",
                values: [{ v: "amount", label: "거래대금" }, { v: "rate", label: "등락률" }, { v: "group", label: "테마" }],
                value: mode, set: (v) => setMode(v as BoardMode),
            },
            {
                kind: "toggle", id: "reasons", name: "제외 사유 칩", label: "필터칩", activeColor: "var(--accent-primary)",
                help: "가려진 종목에 제외 사유 칩을 붙인다", on: showReasons, set: toggleReasons,
            },
            {
                kind: "action", id: "refresh", name: "테마 새로고침", available: !!onRefresh, disabled: refreshing,
                help: "테마 새로고침(시트 배정·수동편집 반영)", run: () => { onRefresh?.(); return "테마 새로고침"; },
            },
            {
                kind: "choice", id: "market", name: "기준 시장", available: !!market && !!onMarketToggle,
                help: "% 의 분모가 되는 전일종가를 어느 시장에서 볼까",
                values: [{ v: "krx", label: "KRX" }, { v: "un", label: "UN" }],
                value: market ?? "krx", set: () => onMarketToggle?.(),
            },
        ],
    });
}
