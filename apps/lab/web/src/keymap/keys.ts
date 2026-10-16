// 코드 문자열(chord) 정규화 — 이벤트/작성값을 같은 규칙으로 canonical 화해 매칭·표시에 쓴다.
// workbench keymap/keys.ts 에서 옮겼다.
// canonical 순서: ctrl · alt · meta · shift · key. 모두 소문자. 예: "ctrl+shift+k", "?", "shift+tab".
const MOD_ORDER = ["ctrl", "alt", "meta", "shift"] as const;

// 인쇄 가능한 기호(예: shift+/ → "?")는 shift 가 이미 문자에 녹아있으므로 shift 를 붙이지 않는다.
// 반면 알파벳/명명키(Tab, ArrowUp…)는 shift 를 수식키로 붙인다(Ctrl+K vs Ctrl+Shift+K 구분).
export function chordOf(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.metaKey) parts.push("meta");
    const raw = e.key;
    const alphaOrNamed = raw.length > 1 || /[a-zA-Z]/.test(raw);
    if (e.shiftKey && alphaOrNamed) parts.push("shift");
    parts.push(raw === " " ? "space" : raw.toLowerCase());
    return parts.join("+");
}

// 아래 두 판정은 순수 모듈인 여기에 둔다 — 판 안 키 처리가 생기면 registry(스토어를 끌어온다)를 거치지 않고 쓰게.

// SELECT 도 편집 취급 — 셀렉트는 글자 타이핑(typeahead)으로 옵션을 고르므로, 수식키 없는 단축키
// (a/d/f/? 등)가 가로채면 타이핑 선택이 죽는다.
export function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
}

// 활성화 키(Space/Enter)는 포커스된 컨트롤의 것 — 버튼은 클릭 뒤에도 포커스가 남으므로, 버튼을 누른 다음
// Space 가 전역 커맨드로 새어 나갈 수 있다(workbench 사고). 버튼을 "편집"으로 치면 a/d 까지 죽으니
// 활성화 키 두 개만 양보한다.
const ACTIVATION_CHORDS = new Set(["space", "enter"]);
const ACTIVATABLE_ROLES = new Set(["button", "checkbox", "radio", "switch", "tab", "menuitem", "option", "link"]);
export function claimsActivation(target: EventTarget | null, chord: string): boolean {
    if (!ACTIVATION_CHORDS.has(chord)) return false;
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SUMMARY") return true;
    const role = el.getAttribute?.("role");
    return !!role && ACTIVATABLE_ROLES.has(role);
}

// 작성값("Ctrl+Shift+K")을 canonical("ctrl+shift+k")로 — 수식키 순서/대소문자 정규화.
export function canonicalChord(spec: string): string {
    const tokens = spec.split("+").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const mods = MOD_ORDER.filter((m) => tokens.includes(m));
    const key = tokens.filter((t) => !MOD_ORDER.includes(t as (typeof MOD_ORDER)[number])).join("+");
    return [...mods, key].filter(Boolean).join("+");
}

const DISPLAY: Record<string, string> = {
    ctrl: "Ctrl", alt: "Alt", meta: "Meta", shift: "Shift",
    space: "Space", tab: "Tab", escape: "Esc", enter: "Enter",
    arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
};

// canonical chord → 사람용 표시("ctrl+shift+k" → "Ctrl + Shift + K").
export function formatChord(spec: string): string {
    return spec
        .split("+")
        .map((t) => DISPLAY[t] ?? (t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)))
        .join(" + ");
}
