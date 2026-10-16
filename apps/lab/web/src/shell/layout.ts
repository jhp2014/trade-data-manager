// 배치 — 패널 열기·최소화·되살리기·삭제, 기본 배치, 화면 저장/불러오기, 마지막 배치 자동저장.
//
// 패널 상태는 세 곳에 산다: dockview(지금 열린 배치) · 대장(store/dock — 열림 + 최소화) ·
// panelId 낟알의 구독(store/paths)과 화면 설정(store/panelUi). 최소화는 dockview 에서만 빠지고 나머지는 그대로다.
import type { DockviewApi, SerializedDockview } from "dockview-react";
import { ACTIVE, usePaths, type PathRef } from "../store/paths.js";
import { usePanelUiStore } from "../store/panelUi.js";
import { useDock } from "../store/dock.js";
import type { ScreenSnapshot } from "../store/screens.js";
import { PANEL_TYPES, panelType, slotTitle } from "./panelCatalog.js";
import { sanitizeLayout } from "./sanitize.js";
import { nextSlotId, parseSlot } from "./slots.js";

const LAYOUT_KEY = "trade-lab.layout.v1";
const VALID_COMPONENTS: ReadonlySet<string> = new Set(PANEL_TYPES.map((t) => t.base));

type PanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

/** dockview 의 지금 열린 패널을 dock store 에 반영하고 대장에 합친다(복원·불러오기·수동 추가 모두 이 길로). */
export function syncOpen(api: DockviewApi): void {
    const ids = api.panels.map((p) => p.id);
    useDock.getState().register(ids);
    useDock.getState().setOpen(ids);
}

/** dockview 에 붙이기만 한다 — 구독·설정은 건드리지 않는다. */
function attach(api: DockviewApi, id: string, position?: PanelPosition): void {
    const base = parseSlot(id)?.base ?? "";
    if (!panelType(base)) throw new Error(`unknown panel type: ${id}`);
    api.addPanel({ id, component: base, title: slotTitle(id), ...(position ? { position } : {}) });
}

/**
 * 새 패널 인스턴스 — 구독을 정하고 화면 설정은 비운 채 붙인다(다시 쓰는 번호가 지난 패널의 설정을 물려받지 않게).
 */
function addNew(api: DockviewApi, id: string, ref: PathRef, position?: PanelPosition): void {
    usePaths.getState().bind(id, ref);
    usePanelUiStore.getState().replace(id, undefined);
    useDock.getState().register([id]);
    attach(api, id, position);
}

/** 안 쓰는 번호 — 열린 패널과 최소화한 패널 모두 피한다. */
function freshId(api: DockviewApi, base: string): string {
    return nextSlotId([...api.panels.map((p) => p.id), ...useDock.getState().slots], base);
}

/** 새 패널을 연다. 구독 기본값 = 활성. */
export function openPanel(api: DockviewApi, base: string, ref: PathRef = ACTIVE): string {
    const id = freshId(api, base);
    addNew(api, id, ref);
    return id;
}

/** 최소화한 패널을 되살린다 — 구독·화면 설정은 최소화 전 그대로. 자리는 dockview 기본(활성 그룹). */
export function restorePanel(api: DockviewApi, panelId: string): void {
    if (api.getPanel(panelId)) return;
    attach(api, panelId);
}

/** 영구 삭제 — 최소화한 패널만. 대장·구독·화면 설정에서 모두 지운다. */
export function destroyPanel(api: DockviewApi, panelId: string): void {
    if (api.getPanel(panelId)) return;
    useDock.getState().forget(panelId);
    usePaths.getState().unbind(panelId);
    usePanelUiStore.getState().replace(panelId, undefined);
}

/**
 * 기본 배치 — 테마 A | 테마 B / 차트 A | 차트 B / HTS뉴스 | 텔레그램(활성).
 * A·B 경로가 없으면(사용자가 지웠으면) 활성으로 건다. 이 배치에 없던 패널은 최소화로 남는다.
 */
export function buildDefaultLayout(api: DockviewApi): void {
    api.clear();
    const paths = usePaths.getState().paths;
    const has = (id: string): PathRef => (paths.some((p) => p.id === id) ? id : ACTIVE);
    addNew(api, "htheme-1", has("A"));
    addNew(api, "htheme-2", has("B"), { referencePanel: "htheme-1", direction: "right" });
    addNew(api, "chart-1", has("A"), { referencePanel: "htheme-1", direction: "below" });
    addNew(api, "chart-2", has("B"), { referencePanel: "htheme-2", direction: "below" });
    addNew(api, "hts-1", ACTIVE, { direction: "below" });
    addNew(api, "telegram-1", ACTIVE, { referencePanel: "hts-1", direction: "right" });
    syncOpen(api);
}

/** 지금 화면의 사진 — 배치 + 열린 패널마다의 구독·화면 설정. */
export function captureScreen(api: DockviewApi): ScreenSnapshot {
    const { bindings } = usePaths.getState();
    const { ui } = usePanelUiStore.getState();
    const panels: ScreenSnapshot["panels"] = {};
    for (const p of api.panels) panels[p.id] = { ref: bindings[p.id] ?? ACTIVE, ...(ui[p.id] ? { ui: { ...ui[p.id] } } : {}) };
    return { layout: api.toJSON(), panels };
}

/**
 * 저장한 화면을 불러온다 — 구독·설정을 먼저 맞춘 뒤 배치를 연다(패널이 처음부터 맞는 상태로 마운트되게).
 * 지금 열려 있던 패널 중 그 화면에 없는 것은 최소화로 남는다.
 * 실패하면 false — 구독·설정과 배치를 불러오기 전으로 되돌린다. dockview fromJSON 은 시작하자마자 지금
 * 배치를 비우고, 실패하면 빈 채로 던지므로 되돌리기는 우리가 해야 한다.
 */
export function loadScreen(api: DockviewApi, snap: ScreenSnapshot): boolean {
    const { json } = sanitizeLayout(snap.layout, VALID_COMPONENTS);
    const ids = Object.keys(json.panels ?? {});
    const before = { layout: api.toJSON(), bindings: { ...usePaths.getState().bindings }, ui: { ...usePanelUiStore.getState().ui }, slots: [...useDock.getState().slots] };
    for (const id of ids) {
        const p = snap.panels[id];
        usePaths.getState().bind(id, p?.ref ?? ACTIVE);
        usePanelUiStore.getState().replace(id, p?.ui);
    }
    try {
        api.fromJSON(json);
    } catch {
        for (const id of ids) {
            const ref = before.bindings[id];
            if (ref) usePaths.getState().bind(id, ref);
            else usePaths.getState().unbind(id);
            usePanelUiStore.getState().replace(id, before.ui[id]);
        }
        // 실패한 fromJSON 이 중간에 잠깐 연 패널은 add 이벤트로 대장에 올라가 있다 — 원래 없던 것은 걷는다.
        for (const id of useDock.getState().slots) if (!before.slots.includes(id)) useDock.getState().forget(id);
        try {
            api.fromJSON(before.layout);
        } catch {
            api.clear(); // 원래 배치마저 못 열면 빈 화면 — 패널은 대장에 남아 칩으로 되살릴 수 있다
        }
        syncOpen(api);
        return false;
    }
    syncOpen(api);
    return true;
}

function loadLast(): SerializedDockview | null {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        return raw ? (JSON.parse(raw) as SerializedDockview) : null;
    } catch {
        return null;
    }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveLastSoon(api: DockviewApi): void {
    clearTimeout(saveTimer);
    // 드래그 한 번에 변경 이벤트가 수십 번 온다 — 멈춘 뒤 한 번만 쓴다.
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
        } catch {
            // 저장 못 해도 화면은 그대로 쓴다(다음 부팅이 기본 배치로 시작할 뿐).
        }
    }, 300);
}

/** 부팅 — 마지막 배치를 잇고(정리해서), 없거나 깨졌으면 기본 배치. 이후 바뀔 때마다 저장. */
export function restoreLayout(api: DockviewApi): void {
    const last = loadLast();
    let restored = false;
    if (last) {
        try {
            api.fromJSON(sanitizeLayout(last, VALID_COMPONENTS).json);
            restored = api.panels.length > 0;
        } catch {
            api.clear();
        }
    }
    if (!restored) buildDefaultLayout(api);
    // 대장에서 등록이 사라진 타입의 id 를 걷는다(패널 이름을 바꾸거나 지운 뒤) — 남기면 칩을 눌렀을 때 던진다.
    for (const id of useDock.getState().slots) if (!VALID_COMPONENTS.has(parseSlot(id)?.base ?? "")) useDock.getState().forget(id);
    syncOpen(api);
    // 대장에 없는 패널의 구독·설정은 걷는다 — 최소화한 패널 것은 남긴다.
    const known = useDock.getState().slots;
    usePaths.getState().pruneBindings(known);
    usePanelUiStore.getState().prune(known);
    api.onDidAddPanel(() => syncOpen(api));
    api.onDidRemovePanel(() => syncOpen(api));
    api.onDidLayoutChange(() => saveLastSoon(api));
}
