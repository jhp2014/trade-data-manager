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
import { useWorkbench } from "../store/workbench.js";
import { panelTypeOf, requirePanelType, slotTitleOf } from "../shell/panelCatalog.js";
import { nextFreeSlot, parseSlotId, slotIdOf } from "../shell/panelSlots.js";

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

/**
 * **특정 인스턴스** 열기/포커스 — openAndFocus(타입 리졸버)와 달리 id 그대로 간다.
 * pull 연동(보드 행 → 연동 판 열기)의 손 — 연동은 판을 가리키므로 타입 리졸버로는 못 연다.
 */
export function openPanelExact(panelId: string): void {
    const dock = useDock.getState();
    const api = dock.api;
    if (!api) return;
    const t = requirePanelType(panelId);
    const p = api.getPanel(panelId) ?? (dock.registerSlots([panelId]), api.addPanel({ id: panelId, component: t.component, title: slotTitleOf(panelId) }));
    p.api.setActive();
}

/**
 * 새 슬롯 발급(설정 사본 없음) — 보드의 "새 조건판" 이 쓴다. duplicatePanel(현재 설정 사본)과
 * 성격이 다르다: 빈 판으로 태어나 행을 비춘다. 발급만 하고 열지는 않는다(열기는 openPanelExact).
 */
export function createPanelSlot(idBase: string): string {
    const dock = useDock.getState();
    const openIds = dock.api?.panels.map((p) => p.id) ?? [];
    const newId = slotIdOf(idBase, nextFreeSlot(idBase, [...dock.slots, ...openIds]));
    // 슬롯 번호는 재사용된다 — 죽은 슬롯을 가리키던 영속 바인딩이 새 판에 조용히 붙지 않게, 태어나는
    // 시점에 그 id 의 옛 배선을 끊는다(themeBindingSlice 머리 주석의 불변식).
    useWorkbench.getState().clearBindingsToPanel(newId);
    dock.registerSlots([newId]);
    return newId;
}

/**
 * 패널 복제 — 인스턴스 생성의 유일한 정문(작업표시줄은 "있는 것을 되찾는 곳"으로 남는다).
 * 현재 설정 사본(영속 panelUi + 타입별 cloneSettings 보충)을 다음 빈 슬롯에 각인하고,
 * 원본과 같은 그룹의 이웃 탭으로 연다. sessionUi 는 안 따라간다(지금 항목을 겨냥한 값).
 */
export function duplicatePanel(fromId: string): void {
    const dock = useDock.getState();
    const api = dock.api;
    if (!api) return;
    const t = panelTypeOf(fromId);
    if (!t?.duplicable) return; // 편집면 등 복제 금지 타입 — 입구(탭 ⧉)가 없지만 방어선도 겸한다
    // 대장 ⊇ 열린 패널(자가등록)이지만, 등록 경로가 늦는 경합에 대비해 합집합으로 빈 번호를 찾는다.
    const newId = slotIdOf(t.idBase, nextFreeSlot(t.idBase, [...dock.slots, ...api.panels.map((p) => p.id)]));
    // addPanel(마운트) 전에 설정부터 — 새 패널의 첫 렌더가 사본을 읽게.
    // 번호 재사용 가드(createPanelSlot 과 같은 불변식) — 복제된 판이 남의 옛 바인딩을 이어받지 않게.
    useWorkbench.getState().clearBindingsToPanel(newId);
    useWorkbench.getState().clonePanelUi(fromId, newId);
    t.cloneSettings?.(fromId, newId);
    dock.registerSlots([newId]);
    const p = api.addPanel({
        id: newId,
        component: t.component,
        title: slotTitleOf(newId),
        position: { referencePanel: fromId, direction: "within" },
    });
    p.api.setActive();
}
