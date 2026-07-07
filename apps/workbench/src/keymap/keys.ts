// 코드 문자열(chord) 정규화 — 이벤트/작성값을 같은 규칙으로 canonical 화해 매칭·표시에 쓴다.
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
