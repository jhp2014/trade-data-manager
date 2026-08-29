// 다른 패널로 데려가기 — 닫혀 있으면 열고, 열려 있으면 앞으로 세운다.
//
// 왜 공용인가: 조건의 편집면이 패널로 갈라진 뒤(보드 = 관리소, 편집은 전문 패널) 이 손짓이
// 여러 곳에서 필요해졌다 — 보드 행 ▸ · 작업셋의 "보는 집합" 클릭 · ＋조건 메뉴. 각자 dockview
// api 를 만지면 "이미 열린 패널을 또 addPanel 해서 예외"가 곳곳에서 재발한다.
import { useDock } from "../store/dock.js";
import { panelEntry } from "../shell/panelCatalog.js";

/**
 * 카탈로그의 그 패널을 열고 활성화한다. dock api 가 아직 없으면(부팅 전) 아무 일도 안 한다 —
 * 이 손짓은 언제나 사용자 클릭에서 오므로 그 시점엔 api 가 있다.
 */
export function openAndFocus(panelId: string): void {
    const api = useDock.getState().api;
    if (!api) return;
    const e = panelEntry(panelId);
    const p = api.getPanel(e.id) ?? api.addPanel({ id: e.id, component: e.component, title: e.title });
    p.api.setActive();
}
