// 일별 타점 [생성] 헤더 선언 — 날짜·후보 수·조건 수(정보)와 비우기(컨트롤).
// 그리는 일은 셸(PanelFrame·탭 칩·모음 판)이 한다 — 여기는 선언·등록뿐(components/header).
// 모드 토글은 없다 — 작업면은 하루로 고정이다(main.tsx 가 부팅 때 한 번 고정, decisions).
import { usePanelHeader } from "../../components/header/registry.js";
import { selectEditingExpr, useWorkbench } from "../../store/workbench.js";
import { leafCount, leavesOf, refsOf } from "../filter/expr.js";
import { useBoundSet } from "../filter/useBoundSet.js";

export function useDailyGenHeader(panelId: string): void {
    const clearStages = useWorkbench((s) => s.clearFilterStages);
    const date = useWorkbench((s) => s.focus.date);
    const expr = useWorkbench(selectEditingExpr);
    const exprIsEmpty = leafCount(expr) === 0 && refsOf(expr).length === 0;
    const bound = useBoundSet(panelId);
    const leaves = leavesOf(expr);
    const all = leaves.length;
    const on = leaves.filter((x) => x.enabled).length;

    // 수 — 셀 엔진이 낸 **그날** 후보 셀 수(탐색판 목록 행 수와 같은 단위). 모르는 동안은 "…".
    const d = bound.day;
    const count = d.unsupported !== null ? null
        : d.error !== null ? "오류"
        : d.isLoading ? "…"
        : d.tooWide ? `${d.matched.toLocaleString("ko-KR")}+ 너무 넓음`
        : d.matched.toLocaleString("ko-KR");

    usePanelHeader(panelId, {
        info: [
            {
                id: "date", name: "날짜", tabular: true, defaultPlace: "tab",
                help: "이 집합이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날)을 따라간다",
                text: () => date,
            },
            {
                id: "count", name: "후보 수", tabular: true, tone: d.error !== null ? "warn" : undefined,
                help: d.error?.message ?? "그날 조건에 걸린 셀(종목·분) 수 — 탐색판 목록의 행 수와 같다",
                text: () => (count === null ? null : `후보 ${count}`),
            },
            {
                // 조건 수 — **편집 집합의 잎**을 센다. 참조 항은 수에 안 든다.
                id: "leaves", name: "조건 수",
                help: "편집 집합의 잎 수(켜짐/전체) — 참조 항은 수에 안 든다",
                text: () => `조건 ${on}${all > on ? ` / ${all}` : ""}`,
            },
        ],
        controls: [
            {
                kind: "action", id: "clearStages", name: "비우기", disabled: exprIsEmpty,
                help: "걸린 조건 전부 지우기 — 저장한 다른 집합은 안 변한다",
                run: () => { clearStages(); return "조건 비움"; },
            },
        ],
    });
}
