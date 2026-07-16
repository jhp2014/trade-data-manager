// watchlist + 알람룰 영속 — DB-free 결정: 설정만 JSON 파일, 런타임 상태(무장·발화이력)는 메모리.
// 쓰기는 원자적(tmp→rename) — 저장 중 크래시로 반쪽 파일이 남지 않게. 재기동 시 load()로 재구축.
// 손상 파일은 .corrupt-<ts> 로 옮겨두고 빈 설정으로 시작(다음 저장이 유실을 확정하지 않게 원본 보존).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AlertRule, BlacklistEntry, UniverseRule } from "./types.js";

interface UniverseSection {
    rules: UniverseRule[];
    blacklist: BlacklistEntry[];
}

interface AlertConfigFile {
    watchlist: string[];
    rules: AlertRule[];
    universe: UniverseSection;
}

const EMPTY: AlertConfigFile = { watchlist: [], rules: [], universe: { rules: [], blacklist: [] } };

/** 최소 형태 검증 — 옛 스키마(band/rank·groups)·손상 항목을 로드 시 탈락시켜 자동 리셋. leaf 상세는 쓰기(컨트롤러)에서 검증됨. */
function isRuleShape(r: unknown): r is AlertRule {
    const o = r as { id?: unknown; code?: unknown; leaves?: unknown };
    return typeof o?.id === "string" && typeof o?.code === "string" && Array.isArray(o.leaves) && o.leaves.length > 0;
}

/** 유니버스 규칙 최소 형태 — 술어 상세는 쓰기(컨트롤러)에서 검증됨. */
function isUniverseRuleShape(r: unknown): r is UniverseRule {
    const o = r as { id?: unknown; predicates?: unknown; output?: unknown };
    return typeof o?.id === "string" && Array.isArray(o.predicates) && o.predicates.length > 0 && (o.output === "telegram" || o.output === "log");
}

function isBlacklistShape(b: unknown): b is BlacklistEntry {
    const o = b as { code?: unknown; until?: unknown };
    return typeof o?.code === "string" && typeof o?.until === "number";
}

export class AlertConfigStore {
    private cfg: AlertConfigFile = structuredClone(EMPTY);
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
            const uni = (raw.universe ?? {}) as Partial<UniverseSection>;
            this.cfg = {
                watchlist: Array.isArray(raw.watchlist) ? raw.watchlist.filter((c): c is string => typeof c === "string") : [],
                rules: Array.isArray(raw.rules) ? (raw.rules as unknown[]).filter(isRuleShape) : [], // 옛 스키마·손상 항목 자동 탈락(리셋)
                universe: {
                    rules: Array.isArray(uni.rules) ? (uni.rules as unknown[]).filter(isUniverseRuleShape) : [],
                    blacklist: Array.isArray(uni.blacklist) ? (uni.blacklist as unknown[]).filter(isBlacklistShape) : [],
                },
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
    get universeRules(): readonly UniverseRule[] {
        return this.cfg.universe.rules;
    }
    /** 활성 블랙리스트(만료분 제외). 만료 항목은 다음 저장 때 정리(읽기는 순수). */
    activeBlacklist(now: number): readonly BlacklistEntry[] {
        return this.cfg.universe.blacklist.filter((b) => b.until > now);
    }

    /** 유니버스 규칙 전체 교체(PUT) — id 없는 규칙은 서버 발급. 교체된 규칙의 엣지 상태는 자연 초기화(무장만). */
    setUniverseRules(rules: readonly (Omit<UniverseRule, "id"> & { id?: string })[]): UniverseRule[] {
        this.cfg.universe.rules = rules.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
        this.save();
        return [...this.cfg.universe.rules];
    }

    /** 블랙리스트 추가/갱신(같은 코드는 until 연장) — 만료분 정리 겸. */
    addBlacklist(code: string, until: number, now: number): BlacklistEntry {
        this.cfg.universe.blacklist = this.cfg.universe.blacklist.filter((b) => b.code !== code && b.until > now);
        const entry: BlacklistEntry = { code, until };
        this.cfg.universe.blacklist.push(entry);
        this.save();
        return entry;
    }

    removeBlacklist(code: string): void {
        this.cfg.universe.blacklist = this.cfg.universe.blacklist.filter((b) => b.code !== code);
        this.save();
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
