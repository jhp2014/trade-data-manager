// 자리 장부 — **패널 종류(slot base) 단위** 영속. 차트 (1)·(2) 같은 인스턴스들이 한 벌을 공유한다
// (패널별 설정은 panelId 단위지만, "이 컨트롤을 줄에 꺼내 둔다"는 그 종류를 쓰는 습관이라 의도적으로 종류 단위다).
// workbench components/header/ledger.ts 에서 옮겼다.
//
// 저장하는 건 **예외뿐**이다: 조각의 기본 자리는 선언(defaultPlace)이 말하고, 장부에는 사용자가 옮긴 것만
// 적힌다 — 그래야 나중에 추가된 조각이 "목록에 없다"는 이유로 숨지 않는다. 기본 자리로 되돌리면 항목을 지운다.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { parseSlot } from "../shell/slots.js"; // 순수 모듈 — dock·카탈로그 무의존이라 순환이 없다
import type { ControlPlace, ControlSpec, HeaderDecl, InfoPlace, InfoSpec } from "./spec.js";

/** 장부 키 — 패널 **종류**. 슬롯 문법이 아닌 id 는 그대로 쓴다. */
export const typeKeyOf = (panelId: string): string => parseSlot(panelId)?.base ?? panelId;

export interface LayoutEntry {
    info?: Record<string, InfoPlace>;
    controls?: Record<string, ControlPlace>;
}
export type LayoutLedger = Record<string, LayoutEntry>;

const INFO_PLACES: readonly InfoPlace[] = ["hidden", "tab", "line", "bottom"];
const CONTROL_PLACES: readonly ControlPlace[] = ["sheet", "line"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 모르는 값은 항목 단위로 버린다 — 장부 전체를 버리면 멀쩡한 다른 패널의 자리까지 초기화된다. */
export function parseLayout(raw: unknown): LayoutLedger {
    if (!isRecord(raw)) return {};
    const out: LayoutLedger = {};
    for (const [typeKey, entry] of Object.entries(raw)) {
        if (!isRecord(entry)) continue;
        const info: Record<string, InfoPlace> = {};
        const controls: Record<string, ControlPlace> = {};
        if (isRecord(entry.info)) {
            for (const [id, p] of Object.entries(entry.info)) if (INFO_PLACES.includes(p as InfoPlace)) info[id] = p as InfoPlace;
        }
        if (isRecord(entry.controls)) {
            for (const [id, p] of Object.entries(entry.controls)) if (CONTROL_PLACES.includes(p as ControlPlace)) controls[id] = p as ControlPlace;
        }
        const e: LayoutEntry = {};
        if (Object.keys(info).length > 0) e.info = info;
        if (Object.keys(controls).length > 0) e.controls = controls;
        if (Object.keys(e).length > 0) out[typeKey] = e;
    }
    return out;
}

// ── 순수 판정(테스트 표면) ─────────────────────────────────────────────────────

const infoDefault = (spec: InfoSpec): InfoPlace => spec.defaultPlace ?? "line";
const controlDefault = (spec: ControlSpec): ControlPlace => spec.defaultPlace ?? "sheet";

/** 정보의 실제 자리 — transient 는 배치 밖(늘 오버레이), 나머지는 장부 예외 → 선언 기본 → "line". */
export function infoPlaceOf(spec: InfoSpec, entry: LayoutEntry | undefined): InfoPlace {
    if (spec.transient === true) return "hidden";
    return entry?.info?.[spec.id] ?? infoDefault(spec);
}

/** 컨트롤의 실제 자리 — 어떤 컨트롤이든 장부 예외 → 선언 기본 → "sheet"(기본은 판 안). */
export function controlPlaceOf(spec: ControlSpec, entry: LayoutEntry | undefined): ControlPlace {
    return entry?.controls?.[spec.id] ?? controlDefault(spec);
}

export interface HeaderLines {
    tab: InfoSpec[];
    lineInfo: InfoSpec[];
    lineControls: ControlSpec[];
    bottom: InfoSpec[];
}

/**
 * 선언 × 장부 → 각 자리의 조각 목록. **라인의 존재 = 여기 배치된 조각이 있는가**(정적) —
 * 순간의 값(text() === null)은 자리만 비우지 라인을 죽이지 않는다(본문 높이 출렁임 방지).
 */
export function linesOf(decl: HeaderDecl, entry: LayoutEntry | undefined): HeaderLines {
    const out: HeaderLines = { tab: [], lineInfo: [], lineControls: [], bottom: [] };
    for (const i of decl.info) {
        if (i.transient === true) continue;
        const place = infoPlaceOf(i, entry);
        if (place === "tab") out.tab.push(i);
        else if (place === "line") out.lineInfo.push(i);
        else if (place === "bottom") out.bottom.push(i);
    }
    for (const c of decl.controls) if (controlPlaceOf(c, entry) === "line") out.lineControls.push(c);
    return out;
}

/** 자리 하나 바꾸기 — 기본 자리와 같아지면 항목을 지우고, 빈 껍데기도 지운다(장부에 `{}` 가 쌓이지 않게). */
function place<K extends "info" | "controls">(ledger: LayoutLedger, typeKey: string, kind: K, id: string, value: string, isDefault: boolean): LayoutLedger {
    const cur = ledger[typeKey] ?? {};
    const map: Record<string, string> = { ...cur[kind] };
    if (isDefault) delete map[id];
    else map[id] = value;
    const entry: LayoutEntry = { ...cur, [kind]: map };
    if (Object.keys(map).length === 0) delete entry[kind];
    const next = { ...ledger };
    if (Object.keys(entry).length === 0) delete next[typeKey];
    else next[typeKey] = entry;
    return next;
}

// ── 영속 store ────────────────────────────────────────────────────────────────

interface HeaderLedgerStore {
    layout: LayoutLedger;
    setInfoPlace: (typeKey: string, spec: InfoSpec, place: InfoPlace) => void;
    setControlPlace: (typeKey: string, spec: ControlSpec, place: ControlPlace) => void;
}

export const useHeaderLedger = create<HeaderLedgerStore>()(
    persist(
        (set) => ({
            layout: {},
            setInfoPlace: (typeKey, spec, p) => set((s) => ({ layout: place(s.layout, typeKey, "info", spec.id, p, p === infoDefault(spec)) })),
            setControlPlace: (typeKey, spec, p) => set((s) => ({ layout: place(s.layout, typeKey, "controls", spec.id, p, p === controlDefault(spec)) })),
        }),
        {
            name: "trade-lab.header",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            partialize: (st) => ({ layout: st.layout }),
            merge: (persisted, current) => ({ ...current, layout: parseLayout((persisted as { layout?: unknown } | undefined)?.layout) }),
        },
    ),
);
