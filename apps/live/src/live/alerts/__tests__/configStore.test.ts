import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AlertConfigStore } from "../configStore.js";
import type { AlarmRule } from "../types.js";

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-alerts-"));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const fileIn = (d: string): string => path.join(d, "alerts.json");

describe("AlertConfigStore (v2 — 통합 AlarmRule)", () => {
    it("파일 없음 = 빈 설정, 저장 후 재로드 라운드트립(스코프·유니버스 규칙 공존)", () => {
        const p = fileIn(dir);
        const a = new AlertConfigStore(p);
        a.load();
        a.addWatch("005930");
        const scoped = a.addAlarm({ code: "005930", predicates: [{ kind: "price", params: { op: 0, value: 70_000 } }], output: "telegram", cooldownMs: 60_000, name: "돌파" });
        const uni = a.setUniverseRules([{ name: "소형주", predicates: [{ kind: "marketCap", params: { lteEok: 5_000 } }], output: "log" }]);

        const b = new AlertConfigStore(p);
        b.load();
        expect(b.watchlist).toEqual(["005930"]);
        expect(b.alarms).toEqual([scoped, ...uni]);
        expect(b.universeRules).toEqual(uni); // 스코프 없는 것만
    });

    it("addAlarm(code 스코프)은 watchlist 자동 승격, removeWatch 는 그 종목 규칙 연쇄 삭제", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        a.addAlarm({ code: "000660", predicates: [{ kind: "price", params: { op: 0, value: 100 } }], output: "telegram" });
        const u = a.setUniverseRules([{ predicates: [{ kind: "marketCap", params: { lteEok: 5_000 } }], output: "telegram" }]);
        expect(a.watchlist).toEqual(["000660"]);
        a.removeWatch("000660");
        expect(a.alarms).toEqual(u); // 유니버스 규칙은 무사
    });

    it("setUniverseRules 는 스코프 규칙을 보존한 채 유니버스 부분만 교체", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        const scoped = a.addAlarm({ code: "005930", predicates: [{ kind: "price", params: { op: 0, value: 1 } }], output: "telegram" });
        a.setUniverseRules([{ predicates: [{ kind: "marketCap", params: { lteEok: 1_000 } }], output: "log" }]);
        const next = a.setUniverseRules([]); // 유니버스 전부 삭제
        expect(next).toEqual([]);
        expect(a.alarms).toEqual([scoped]); // 스코프는 남는다
    });

    it("손상 파일 → .corrupt 백업 + 빈 설정(다음 저장이 원본을 덮지 않음)", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, "{ 이건 JSON 아님", "utf8");
        const a = new AlertConfigStore(p);
        const backup = a.load();
        expect(backup).toMatch(/\.corrupt-\d+$/);
        expect(fs.existsSync(backup as string)).toBe(true);
        expect(a.watchlist).toEqual([]);
        a.addWatch("005930");
        expect(JSON.parse(fs.readFileSync(p, "utf8")).watchlist).toEqual(["005930"]);
    });
});

describe("v1 → v2 자동 변환 — 사용자 규칙 보존", () => {
    it("v1 watchlist 룰(leaves) → price/themeRank 술어 규칙으로", () => {
        const p = fileIn(dir);
        fs.writeFileSync(
            p,
            JSON.stringify({
                watchlist: ["005930"],
                rules: [
                    {
                        id: "w1",
                        code: "005930",
                        leaves: [
                            { kind: "price", op: "gte", value: 70_000 },
                            { kind: "rank", theme: "반도체", market: "un", mode: "reach", threshold: 3 },
                        ],
                        cooldownMs: 60_000,
                        note: "돌파 확인",
                    },
                ],
            }),
            "utf8",
        );
        const a = new AlertConfigStore(p);
        expect(a.load()).toBeNull();
        const expected: AlarmRule = {
            id: "w1",
            code: "005930",
            name: "돌파 확인",
            predicates: [
                { kind: "price", params: { op: 0, value: 70_000 } },
                { kind: "themeRank", params: { market: 1, mode: 0, threshold: 3 }, textParams: { theme: "반도체" } },
            ],
            output: "telegram",
            cooldownMs: 60_000,
        };
        expect(a.alarms).toEqual([expected]);
    });

    it("v1 universe 섹션(규칙·블랙리스트) 승계 + 옛 band 스키마는 탈락(watchlist 는 보존)", () => {
        const p = fileIn(dir);
        fs.writeFileSync(
            p,
            JSON.stringify({
                watchlist: ["005930"],
                rules: [{ id: "old", code: "005930", band: { baseline: 100 } }], // leaves 없음 — 탈락
                universe: {
                    rules: [{ id: "u1", predicates: [{ kind: "marketCap", params: { lteEok: 5_000 } }], output: "telegram" }],
                    blacklist: [{ code: "111111", until: 9_999 }],
                },
            }),
            "utf8",
        );
        const a = new AlertConfigStore(p);
        expect(a.load()).toBeNull();
        expect(a.watchlist).toEqual(["005930"]);
        expect(a.alarms.map((r) => r.id)).toEqual(["u1"]);
        expect(a.activeBlacklist(0)).toEqual([{ code: "111111", until: 9_999 }]);
    });
});

describe("블랙리스트", () => {
    it("추가/갱신(scope 포함) + 만료분 정리 + 해제", () => {
        const a = new AlertConfigStore(fileIn(dir));
        a.load();
        a.addBlacklist("005930", 2_000, 1_000);
        a.addBlacklist("000660", 1_200, 1_000);
        expect(a.activeBlacklist(1_500)).toEqual([{ code: "005930", until: 2_000, scope: "telegram" }]);
        a.addBlacklist("005930", 9_000, 5_000, "all"); // 갱신 + 만료분(000660) 정리
        expect(a.activeBlacklist(5_000)).toEqual([{ code: "005930", until: 9_000, scope: "all" }]);
        a.removeBlacklist("005930");
        expect(a.activeBlacklist(5_000)).toEqual([]);
    });
});
