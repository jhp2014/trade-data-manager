import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AlertConfigStore } from "../configStore.js";

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-alerts-"));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const fileIn = (d: string): string => path.join(d, "alerts.json");

describe("AlertConfigStore", () => {
    it("파일 없음 = 빈 설정, 저장 후 재로드 라운드트립", () => {
        const p = fileIn(dir);
        const a = new AlertConfigStore(p);
        expect(a.load()).toBeNull();
        expect(a.watchlist).toEqual([]);

        a.addWatch("005930");
        const rule = a.addRule({ code: "005930", band: { baseline: 70000, lowerPct: 5, upperPct: null } });

        const b = new AlertConfigStore(p);
        b.load();
        expect(b.watchlist).toEqual(["005930"]);
        expect(b.rules).toEqual([rule]);
    });

    it("addWatch 멱등, removeWatch 는 그 종목 룰 연쇄 삭제", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        expect(a.addWatch("005930")).toBe(true);
        expect(a.addWatch("005930")).toBe(false);
        a.addRule({ code: "005930", band: { baseline: 100, lowerPct: null, upperPct: -5 } });
        a.addRule({ code: "000660", rank: { theme: "HBM", mode: "reach", threshold: 1 } }); // watchlist 자동 승격
        expect(a.watchlist).toEqual(["005930", "000660"]);

        a.removeWatch("005930");
        expect(a.watchlist).toEqual(["000660"]);
        expect(a.rules.map((r) => r.code)).toEqual(["000660"]);
    });

    it("removeRule: 있으면 true, 없으면 false(저장 안 함)", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        const r = a.addRule({ code: "005930", band: { baseline: 100, lowerPct: 5, upperPct: null } });
        expect(a.removeRule(r.id)).toBe(true);
        expect(a.removeRule(r.id)).toBe(false);
        expect(a.rules).toEqual([]);
    });

    it("손상 파일 = .corrupt-* 백업 후 빈 설정(원본 보존, 유실 확정 방지)", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, "{ 이건 JSON 아님", "utf8");
        const a = new AlertConfigStore(p);
        const backup = a.load();
        expect(backup).toMatch(/\.corrupt-\d+$/);
        expect(fs.existsSync(backup as string)).toBe(true);
        expect(a.watchlist).toEqual([]);
        a.addWatch("005930"); // 저장이 원본을 덮지 않고 새 파일로
        expect(JSON.parse(fs.readFileSync(p, "utf8")).watchlist).toEqual(["005930"]);
    });
});
