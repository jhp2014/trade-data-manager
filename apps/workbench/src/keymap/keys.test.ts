import { describe, it, expect } from "vitest";
import { chordOf, canonicalChord, formatChord } from "./keys.js";

// KeyboardEvent 최소 스텁 — chordOf 가 읽는 필드만.
function ev(key: string, mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey" | "shiftKey">> = {}): KeyboardEvent {
    return { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods } as KeyboardEvent;
}

describe("chordOf", () => {
    it("수식키 없는 알파벳/기호", () => {
        expect(chordOf(ev("a"))).toBe("a");
        expect(chordOf(ev("K"))).toBe("k"); // 대문자 → 소문자
    });
    it("Ctrl+K vs Ctrl+Shift+K 구분(알파벳엔 shift 붙임)", () => {
        expect(chordOf(ev("k", { ctrlKey: true }))).toBe("ctrl+k");
        expect(chordOf(ev("K", { ctrlKey: true, shiftKey: true }))).toBe("ctrl+shift+k");
    });
    it("shift 로 만든 기호는 shift 를 붙이지 않음(문자에 녹아있음)", () => {
        expect(chordOf(ev("?", { shiftKey: true }))).toBe("?");
    });
    it("Space·명명키·수식키 조합", () => {
        expect(chordOf(ev(" "))).toBe("space");
        expect(chordOf(ev("Tab", { shiftKey: true }))).toBe("shift+tab");
        expect(chordOf(ev(",", { ctrlKey: true }))).toBe("ctrl+,");
    });
});

describe("canonicalChord", () => {
    it("수식키 순서·대소문자 정규화", () => {
        expect(canonicalChord("Ctrl+Shift+K")).toBe("ctrl+shift+k");
        expect(canonicalChord("shift+ctrl+k")).toBe("ctrl+shift+k");
        expect(canonicalChord("?")).toBe("?");
        expect(canonicalChord("Ctrl+,")).toBe("ctrl+,");
    });
    it("작성값의 chordOf 결과와 왕복 일치", () => {
        expect(canonicalChord("Ctrl+K")).toBe(chordOf(ev("k", { ctrlKey: true })));
    });
});

describe("formatChord", () => {
    it("사람용 표시", () => {
        expect(formatChord("ctrl+shift+k")).toBe("Ctrl + Shift + K");
        expect(formatChord("space")).toBe("Space");
        expect(formatChord("shift+tab")).toBe("Shift + Tab");
        expect(formatChord("?")).toBe("?");
    });
});
