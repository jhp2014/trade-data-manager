// 배치·단축키 장부 — **종류(idBase) 단위** 영속. 차트 1·2 같은 인스턴스들이 한 벌을 공유한다.
//
// 저장하는 건 **예외뿐**이다: 조각의 기본 자리는 선언(defaultPlace)이 말하고, 장부에는 사용자가
// 옮긴 것만 적힌다 — 그래야 나중에 추가된 조각이 "목록에 없다"는 이유로 숨지 않는다(옛 headerPins
// 와 같은 원칙). 기본 자리로 되돌리면 항목을 지운다.
//
// 옛 `wb.headerPins.*` 는 읽는 코드 없이 방치한다(청소 장치를 새로 짓지 않는다 — 기존 선례).
import { create } from "zustand";
import { persistedField } from "../../store/persist.js";
import { parseSlotId } from "../../shell/panelSlots.js"; // 순수 모듈 — dock/카탈로그 무의존이라 순환이 없다
import type { ControlPlace, ControlSpec, HeaderDecl, InfoPlace, InfoSpec, SlotDigit } from "./spec.js";

/** 장부 키 — 패널 **종류**(슬롯 밑동). 슬롯 문법이 아닌 id(구형)는 그대로 쓴다. */
export const typeKeyOf = (panelId: string): string => parseSlotId(panelId)?.base ?? panelId;

export interface LayoutEntry {
    info?: Record<string, InfoPlace>;
    controls?: Record<string, ControlPlace>;
}
export type LayoutLedger = Record<string, LayoutEntry>;
/** 숫자 키는 JSON 특성상 문자열("1"~"5")로 적힌다. */
export type KeysEntry = Partial<Record<string, string>>;
export type KeysLedger = Record<string, KeysEntry>;

const INFO_PLACES: readonly InfoPlace[] = ["hidden", "tab", "line", "bottom"];
const CONTROL_PLACES: readonly ControlPlace[] = ["sheet", "line"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 모르는 값은 항목 단위로 버린다 — 장부 전체를 버리면 멀쩡한 다른 패널의 배치까지 초기화된다. */
export function parseLayout(raw: unknown): LayoutLedger | null {
    if (!isRecord(raw)) return null;
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

export function parseKeys(raw: unknown): KeysLedger | null {
    if (!isRecord(raw)) return null;
    const out: KeysLedger = {};
    for (const [typeKey, entry] of Object.entries(raw)) {
        if (!isRecord(entry)) continue;
        const e: KeysEntry = {};
        for (const [digit, id] of Object.entries(entry)) {
            if (/^[1-5]$/.test(digit) && typeof id === "string") e[digit] = id;
        }
        if (Object.keys(e).length > 0) out[typeKey] = e;
    }
    return out;
}

// ── 순수 판정(테스트 표면) ─────────────────────────────────────────────────────

/** 정보의 실제 자리 — transient 는 배치 밖(늘 오버레이), 나머지는 장부 예외 → 선언 기본 → "line". */
export function infoPlaceOf(spec: InfoSpec, entry: LayoutEntry | undefined): InfoPlace {
    if (spec.transient === true) return "hidden";
    return entry?.info?.[spec.id] ?? spec.defaultPlace ?? "line";
}

/** 컨트롤의 실제 자리 — 항해형(nav)만 첫 줄에 설 수 있고, 나머지는 언제나 모음 판이다. */
export function controlPlaceOf(spec: ControlSpec, entry: LayoutEntry | undefined): ControlPlace {
    if (spec.nav !== true) return "sheet";
    return entry?.controls?.[spec.id] ?? spec.defaultPlace ?? "line";
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
        if (i.available === false || i.transient === true) continue;
        const place = infoPlaceOf(i, entry);
        if (place === "tab") out.tab.push(i);
        else if (place === "line") out.lineInfo.push(i);
        else if (place === "bottom") out.bottom.push(i);
    }
    for (const c of decl.controls) {
        if (c.available === false) continue;
        if (controlPlaceOf(c, entry) === "line") out.lineControls.push(c);
    }
    return out;
}

/** 이 컨트롤에 배정된 숫자(없으면 null) — 모음 판의 숫자 배지가 본다. */
export function digitOf(entry: KeysEntry | undefined, controlId: string): SlotDigit | null {
    if (entry === undefined) return null;
    for (const [digit, id] of Object.entries(entry)) if (id === controlId) return Number(digit) as SlotDigit;
    return null;
}

/**
 * 숫자 배정 — 한 컨트롤은 숫자 하나만(다른 숫자에 있었다면 옮긴다). 그 숫자의 기존 주인은 자리를
 * 잃는다(교체). 같은 컨트롤을 같은 숫자에 다시 배정하면 해제다(배지 클릭 두 번 = 끄기).
 */
export function assignDigit(entry: KeysEntry | undefined, digit: SlotDigit, controlId: string): KeysEntry {
    const key = String(digit);
    const next: KeysEntry = {};
    for (const [d, id] of Object.entries(entry ?? {})) if (id !== controlId) next[d] = id;
    if (entry?.[key] !== controlId) next[key] = controlId;
    else delete next[key];
    return next;
}

// ── 영속 store ────────────────────────────────────────────────────────────────

const LAYOUT = persistedField<LayoutLedger>("wb.header.layout", parseLayout, {});
const KEYS = persistedField<KeysLedger>("wb.header.keys", parseKeys, {});

interface HeaderLedgerStore {
    layout: LayoutLedger;
    keys: KeysLedger;
    /** 자리 바꾸기 — 기본 자리와 같아지면 항목을 지운다(예외만 저장). */
    setInfoPlace: (typeKey: string, spec: InfoSpec, place: InfoPlace) => void;
    setControlPlace: (typeKey: string, spec: ControlSpec, place: ControlPlace) => void;
    assignKey: (typeKey: string, digit: SlotDigit, controlId: string) => void;
}

/** 빈 껍데기는 지운다 — 장부에 `{}` 가 쌓이지 않게. */
const prune = <T extends LayoutEntry | KeysEntry>(ledger: Record<string, T>, typeKey: string, entry: T): Record<string, T> => {
    const next = { ...ledger };
    const empty = Object.values(entry).every((v) => v === undefined || (typeof v === "object" && Object.keys(v).length === 0));
    if (empty) delete next[typeKey];
    else next[typeKey] = entry;
    return next;
};

export const useHeaderLedger = create<HeaderLedgerStore>((set) => ({
    layout: LAYOUT.load(),
    keys: KEYS.load(),
    setInfoPlace: (typeKey, spec, place) =>
        set((s) => {
            const cur = s.layout[typeKey] ?? {};
            const info = { ...cur.info };
            if (place === (spec.defaultPlace ?? "line")) delete info[spec.id];
            else info[spec.id] = place;
            const entry: LayoutEntry = { ...cur, info };
            if (Object.keys(info).length === 0) delete entry.info;
            return { layout: LAYOUT.save(prune(s.layout, typeKey, entry)) };
        }),
    setControlPlace: (typeKey, spec, place) =>
        set((s) => {
            const cur = s.layout[typeKey] ?? {};
            const controls = { ...cur.controls };
            if (place === (spec.defaultPlace ?? "line")) delete controls[spec.id];
            else controls[spec.id] = place;
            const entry: LayoutEntry = { ...cur, controls };
            if (Object.keys(controls).length === 0) delete entry.controls;
            return { layout: LAYOUT.save(prune(s.layout, typeKey, entry)) };
        }),
    assignKey: (typeKey, digit, controlId) =>
        set((s) => ({ keys: KEYS.save(prune(s.keys, typeKey, assignDigit(s.keys[typeKey], digit, controlId))) })),
}));
