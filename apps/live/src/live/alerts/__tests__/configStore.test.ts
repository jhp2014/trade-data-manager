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
        const rule = a.addRule({ code: "005930", leaves: [{ kind: "price", op: "gte", value: 70000 }] });

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
        a.addRule({ code: "005930", leaves: [{ kind: "price", op: "lte", value: 95 }] });
        a.addRule({ code: "000660", leaves: [{ kind: "rank", theme: "HBM", market: "un", mode: "reach", threshold: 1 }] }); // watchlist 자동 승격
        expect(a.watchlist).toEqual(["005930", "000660"]);

        a.removeWatch("005930");
        expect(a.watchlist).toEqual(["000660"]);
        expect(a.rules.map((r) => r.code)).toEqual(["000660"]);
    });

    it("removeRule: 있으면 true, 없으면 false(저장 안 함)", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        const r = a.addRule({ code: "005930", leaves: [{ kind: "price", op: "gte", value: 100 }] });
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

    it("옛 스키마(band/rank) 조건은 로드 시 탈락 — watchlist 는 보존(자동 리셋)", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, JSON.stringify({ watchlist: ["005930"], rules: [{ id: "old", code: "005930", band: { baseline: 100, lowerPct: 5, upperPct: null } }] }), "utf8");
        const a = new AlertConfigStore(p);
        expect(a.load()).toBeNull(); // 파싱은 됨(손상 아님)
        expect(a.watchlist).toEqual(["005930"]);
        expect(a.rules).toEqual([]); // 옛 조건은 groups 없음 → 탈락
    });
});

describe("universe 섹션", () => {
    it("규칙·블랙리스트 저장/재로드 라운드트립 — id 없는 규칙은 발급", () => {
        const p = fileIn(dir);
        const a = new AlertConfigStore(p);
        a.load();
        const saved = a.setUniverseRules([
            { name: "돈유입", predicates: [{ kind: "signal", params: { window: 0, rateMin: 0.4, tvMin: 40 } }], output: "telegram", cooldownKey: "code", cooldownMs: 600_000 },
        ]);
        expect(saved[0].id).toBeTruthy();
        a.addBlacklist("005930", 2_000, 1_000);

        const b = new AlertConfigStore(p);
        b.load();
        expect(b.universeRules).toEqual(saved);
        expect(b.activeBlacklist(1_500)).toEqual([{ code: "005930", until: 2_000, scope: "telegram" }]);
        expect(b.activeBlacklist(2_500)).toEqual([]); // 만료 — 읽기에서 걸러짐
    });

    it("universe 없는 옛 파일 → 빈 섹션(하위호환), 손상 규칙은 로드 시 탈락", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, JSON.stringify({ watchlist: ["005930"], rules: [], universe: { rules: [{ id: "u1", predicates: [], output: "telegram" }, { id: "u2", predicates: [{ kind: "marketCap", params: {} }], output: "log" }], blacklist: [{ code: "111111" }] } }), "utf8");
        const a = new AlertConfigStore(p);
        expect(a.load()).toBeNull();
        expect(a.universeRules.map((r) => r.id)).toEqual(["u2"]); // 빈 predicates 탈락
        expect(a.activeBlacklist(0)).toEqual([]); // until 없는 항목 탈락

        const old = fileIn(dir) + ".old";
        fs.writeFileSync(old, JSON.stringify({ watchlist: [], rules: [] }), "utf8"); // universe 필드 자체가 없음
        const b = new AlertConfigStore(old);
        expect(b.load()).toBeNull();
        expect(b.universeRules).toEqual([]);
    });

    it("addBlacklist — 같은 코드 갱신 + 만료분 정리", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        a.addBlacklist("005930", 2_000, 1_000);
        a.addBlacklist("000660", 1_200, 1_000);
        a.addBlacklist("005930", 9_000, 5_000, "all"); // 005930 갱신(scope 포함) + 000660(만료) 정리
        expect(a.activeBlacklist(5_000)).toEqual([{ code: "005930", until: 9_000, scope: "all" }]);
        a.removeBlacklist("005930");
        expect(a.activeBlacklist(5_000)).toEqual([]);
    });
});
