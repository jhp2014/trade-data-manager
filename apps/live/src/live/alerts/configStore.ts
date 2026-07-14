// watchlist + 알람룰 영속 — DB-free 결정: 설정만 JSON 파일, 런타임 상태(무장·발화이력)는 메모리.
// 쓰기는 원자적(tmp→rename) — 저장 중 크래시로 반쪽 파일이 남지 않게. 재기동 시 load()로 재구축.
// 손상 파일은 .corrupt-<ts> 로 옮겨두고 빈 설정으로 시작(다음 저장이 유실을 확정하지 않게 원본 보존).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AlertRule } from "./types.js";

interface AlertConfigFile {
    watchlist: string[];
    rules: AlertRule[];
}

const EMPTY: AlertConfigFile = { watchlist: [], rules: [] };

/** 최소 형태 검증 — 옛 스키마(band/rank)·손상 항목을 로드 시 탈락시켜 자동 리셋. leaf 상세는 쓰기(컨트롤러)에서 검증됨. */
function isRuleShape(r: unknown): r is AlertRule {
    const o = r as { id?: unknown; code?: unknown; groups?: unknown };
    return (
        typeof o?.id === "string" &&
        typeof o?.code === "string" &&
        Array.isArray(o.groups) &&
        o.groups.length > 0 &&
        o.groups.every((g) => Array.isArray((g as { leaves?: unknown })?.leaves) && (g as { leaves: unknown[] }).leaves.length > 0)
    );
}

export class AlertConfigStore {
    private cfg: AlertConfigFile = { watchlist: [], rules: [] };
    private readonly abs: string;

    constructor(filePath: string) {
        this.abs = path.resolve(process.cwd(), filePath);
    }

    /** 파일 로드. 없음=빈 설정. 손상=원본 백업 후 빈 설정(경고는 호출자 로깅). @returns 손상 백업 경로(정상이면 null) */
    load(): string | null {
        if (!fs.existsSync(this.abs)) {
            this.cfg = structuredClone(EMPTY);
            return null;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(this.abs, "utf8")) as Partial<AlertConfigFile>;
            this.cfg = {
                watchlist: Array.isArray(raw.watchlist) ? raw.watchlist.filter((c): c is string => typeof c === "string") : [],
                rules: Array.isArray(raw.rules) ? (raw.rules as unknown[]).filter(isRuleShape) : [], // 옛 스키마·손상 항목 자동 탈락(리셋)
            };
            return null;
        } catch {
            const backup = `${this.abs}.corrupt-${Date.now()}`;
            fs.renameSync(this.abs, backup);
            this.cfg = structuredClone(EMPTY);
            return backup;
        }
    }

    get watchlist(): readonly string[] {
        return this.cfg.watchlist;
    }
    get rules(): readonly AlertRule[] {
        return this.cfg.rules;
    }

    /** watchlist 추가(멱등). @returns 새로 추가됐으면 true */
    addWatch(code: string): boolean {
        if (this.cfg.watchlist.includes(code)) return false;
        this.cfg.watchlist.push(code);
        this.save();
        return true;
    }

    /** watchlist 제거 + 그 종목 룰 연쇄 삭제. */
    removeWatch(code: string): void {
        this.cfg.watchlist = this.cfg.watchlist.filter((c) => c !== code);
        this.cfg.rules = this.cfg.rules.filter((r) => r.code !== code);
        this.save();
    }

    /** 룰 추가 — id 는 서버 발급. 종목이 watchlist 에 없으면 자동 승격(알람은 타겟에만이라는 불변식 유지). */
    addRule(input: Omit<AlertRule, "id">): AlertRule {
        const rule: AlertRule = { ...input, id: randomUUID() };
        if (!this.cfg.watchlist.includes(rule.code)) this.cfg.watchlist.push(rule.code);
        this.cfg.rules.push(rule);
        this.save();
        return rule;
    }

    /** @returns 지웠으면 true(없는 id 면 false) */
    removeRule(id: string): boolean {
        const before = this.cfg.rules.length;
        this.cfg.rules = this.cfg.rules.filter((r) => r.id !== id);
        if (this.cfg.rules.length === before) return false;
        this.save();
        return true;
    }

    private save(): void {
        fs.mkdirSync(path.dirname(this.abs), { recursive: true });
        const tmp = `${this.abs}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2), "utf8");
        fs.renameSync(tmp, this.abs);
    }
}
