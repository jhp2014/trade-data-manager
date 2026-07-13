import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EngineConfigStore } from "../engineConfigStore.js";

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-config-"));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const fileIn = (d: string): string => path.join(d, "live-engine.json");

describe("EngineConfigStore", () => {
    it("파일 없음 → 미설정(null, env 폴백 신호)", () => {
        const store = new EngineConfigStore(fileIn(dir));
        expect(store.load()).toBeNull();
        expect(store.conditionName).toBeNull();
    });

    it("저장 → 재로드 라운드트립(재기동 유지)", () => {
        const p = fileIn(dir);
        const store = new EngineConfigStore(p);
        store.load();
        store.setConditionName("눌림목");
        const again = new EngineConfigStore(p);
        expect(again.load()).toBeNull();
        expect(again.conditionName).toBe("눌림목");
    });

    it("빈 문자열 = 명시적 해제 — null(미설정)과 구분되어 env 를 덮는다", () => {
        const p = fileIn(dir);
        const store = new EngineConfigStore(p);
        store.load();
        store.setConditionName("");
        const again = new EngineConfigStore(p);
        again.load();
        expect(again.conditionName).toBe(""); // null 아님 — env 폴백 차단
    });

    it("손상 파일 → 백업 후 빈 설정(원본 보존)", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, "{not json", "utf8");
        const store = new EngineConfigStore(p);
        const backup = store.load();
        expect(backup).toMatch(/\.corrupt-\d+$/);
        expect(fs.existsSync(backup!)).toBe(true);
        expect(store.conditionName).toBeNull();
    });

    it("타입 오염(conditionName 비문자열)은 버린다", () => {
        const p = fileIn(dir);
        fs.writeFileSync(p, JSON.stringify({ conditionName: 42 }), "utf8");
        const store = new EngineConfigStore(p);
        expect(store.load()).toBeNull();
        expect(store.conditionName).toBeNull();
    });
});
