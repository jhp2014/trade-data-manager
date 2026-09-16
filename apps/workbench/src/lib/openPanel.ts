// 다른 패널로 데려가기 — 닫혀 있으면 열고, 열려 있으면 앞으로 세운다.
//
// 왜 공용인가: 조건의 편집면이 패널로 갈라진 뒤(보드 = 관리소, 편집은 전문 패널) 이 손짓이
// 여러 곳에서 필요해졌다 — 보드 행 ▸ · 작업셋의 "보는 집합" 클릭 · ＋조건 메뉴. 각자 dockview
// api 를 만지면 "이미 열린 패널을 또 addPanel 해서 예외"가 곳곳에서 재발한다.
//
// 슬롯 모델 이후 이 함수가 id-정확 참조의 공용 리졸버다: 호출부는 슬롯 1 id 를 하드코딩하지만
// 실제로는 "그 **타입**의 열린 인스턴스 중 가장 낮은 슬롯"으로 간다(사용자가 슬롯 1 을 소멸시키고
// 2 만 띄워 둔 화면에서도 점프가 죽지 않는다). 없으면 요청받은 id 로 새로 연다.
import { useDock } from "../store/dock.js";
import { requirePanelType, slotTitleOf } from "../shell/panelCatalog.js";
import { parseSlotId } from "../shell/panelSlots.js";

/**
 * 카탈로그의 그 패널을 열고 활성화한다. dock api 가 아직 없으면(부팅 전) 아무 일도 안 한다 —
 * 이 손짓은 언제나 사용자 클릭에서 오므로 그 시점엔 api 가 있다.
 */
export function openAndFocus(panelId: string): void {
    const api = useDock.getState().api;
    if (!api) return;
    const t = requirePanelType(panelId); // 코드에 박힌 id 오타를 그 자리에서 드러낸다
    const sameType = api.panels
        .filter((p) => parseSlotId(p.id)?.base === t.idBase)
        .sort((a, b) => parseSlotId(a.id)!.n - parseSlotId(b.id)!.n);
    const p = sameType[0] ?? api.addPanel({ id: panelId, component: t.component, title: slotTitleOf(panelId) });
    p.api.setActive();
}
