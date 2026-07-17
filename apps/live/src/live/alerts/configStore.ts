// watchlist + 알람 규칙 영속 — DB-free 결정: 설정만 JSON 파일, 런타임 상태(무장·발화이력)는 메모리.
// 쓰기는 원자적(tmp→rename) — 저장 중 크래시로 반쪽 파일이 남지 않게. 재기동 시 load()로 재구축.
// 손상 파일은 .corrupt-<ts> 로 옮겨두고 빈 설정으로 시작(다음 저장이 유실을 확정하지 않게 원본 보존).
//
// 파일 v2(4b 통합): { watchlist, alarms: AlarmRule[](code?=스코프), blacklist }.
// v1(rules=AlertLeaf·universe 섹션)은 로드 시 **자동 변환**(사용자 규칙 보존) — price/rank leaf →
// price/themeRank 술어. 변환 후 첫 저장부터 v2 로 쓰인다(롤백 시 옛 코드는 이 규칙들을 탈락시킴 — 수용).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AlarmPredicateInstance, AlarmRule, BlacklistEntry } from "./types.js";

interface AlertConfigFile {
    watchlist: string[];
    alarms: AlarmRule[];
    blacklist: BlacklistEntry[];
}

const EMPTY: AlertConfigFile = { watchlist: [], alarms: [], blacklist: [] };

/** 최소 형태 검증 — 손상 항목을 로드 시 탈락. 술어 상세는 쓰기(컨트롤러)에서 검증됨. */
function isAlarmShape(r: unknown): r is AlarmRule {
    const o = r as { id?: unknown; code?: unknown; predicates?: unknown; output?: unknown };
    return (
        typeof o?.id === "string" &&
        (o.code === undefined || typeof o.code === "string") &&
        Array.isArray(o.predicates) &&
        o.predicates.length > 0 &&
        (o.output === "telegram" || o.output === "log")
    );
}

function isBlacklistShape(b: unknown): b is BlacklistEntry {
    const o = b as { code?: unknown; until?: unknown };
    return typeof o?.code === "string" && typeof o?.until === "number";
}

// ── v1 → v2 변환 — 옛 AlertLeaf(price/rank)·universe 섹션을 통합 규칙으로(사용자 규칙 보존). ──

interface LegacyLeaf {
    kind?: unknown;
    op?: unknown;
    value?: unknown;
    theme?: unknown;
    market?: unknown;
    mode?: unknown;
    threshold?: unknown;
}

function convertLeaf(l: LegacyLeaf): AlarmPredicateInstance | null {
    if (l.kind === "price" && typeof l.value === "number") {
        return { kind: "price", params: { op: l.op === "lte" ? 1 : 0, value: l.value } };
    }
    if (l.kind === "rank" && typeof l.theme === "string" && typeof l.threshold === "number") {
        return {
            kind: "themeRank",
            params: { market: l.market === "krx" ? 0 : 1, mode: l.mode === "delta" ? 1 : 0, threshold: l.threshold },
            textParams: { theme: l.theme },
        };
    }
    return null; // 미지 leaf — 탈락(규칙 자체가 버려지지 않게 호출측이 필터)
}

function convertLegacy(raw: Record<string, unknown>): AlarmRule[] {
    const out: AlarmRule[] = [];
    // v1 watchlist 룰: { id, code, leaves, cooldownMs?, note? }
    if (Array.isArray(raw.rules)) {
        for (const r of raw.rules as Array<Record<string, unknown>>) {
            if (typeof r?.id !== "string" || typeof r?.code !== "string" || !Array.isArray(r.leaves)) continue;
            const predicates = (r.leaves as LegacyLeaf[]).map(convertLeaf).filter((p): p is AlarmPredicateInstance => p !== null);
            if (predicates.length === 0) continue;
            out.push({
                id: r.id,
                code: r.code,
                name: typeof r.note === "string" && r.note ? r.note : undefined,
                predicates,
                output: "telegram", // v1 watchlist 룰은 전부 텔레그램행이었다
                cooldownMs: typeof r.cooldownMs === "number" ? r.cooldownMs : undefined,
            });
        }
    }
    // v1 universe 룰: 이미 술어 기반 — 모양 검증만 거쳐 그대로 승계.
    const uni = (raw.universe ?? {}) as { rules?: unknown };
    if (Array.isArray(uni.rules)) for (const r of uni.rules) if (isAlarmShape(r)) out.push(r);
    return out;
}

export class AlertConfigStore {
    private cfg: AlertConfigFile = structuredClone(EMPTY);
    private readonly abs: string;

    constructor(filePath: string) {
        this.abs = path.resolve(process.cwd(), filePath);
    }

    /** 파일 로드(+v1 자동 변환). 없음=빈 설정. 손상=원본 백업 후 빈 설정. @returns 손상 백업 경로(정상이면 null) */
    load(): string | null {
        if (!fs.existsSync(this.abs)) {
            this.cfg = structuredClone(EMPTY);
            return null;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(this.abs, "utf8")) as Record<string, unknown>;
            const isV2 = Array.isArray(raw.alarms);
            const uni = (raw.universe ?? {}) as { blacklist?: unknown };
            this.cfg = {
                watchlist: Array.isArray(raw.watchlist) ? (raw.watchlist as unknown[]).filter((c): c is string => typeof c === "string") : [],
                alarms: isV2 ? (raw.alarms as unknown[]).filter(isAlarmShape) : convertLegacy(raw),
                blacklist: (Array.isArray(raw.blacklist) ? (raw.blacklist as unknown[]) : Array.isArray(uni.blacklist) ? (uni.blacklist as unknown[]) : []).filter(isBlacklistShape),
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
    /** 전체 규칙(스코프 무관) — 엔진은 이대로 평가(스코프는 규칙이 안다). */
    get alarms(): readonly AlarmRule[] {
        return this.cfg.alarms;
    }
    /** 유니버스(스코프 없는) 규칙 — GET/PUT /universe 표면. */
    get universeRules(): readonly AlarmRule[] {
        return this.cfg.alarms.filter((a) => a.code == null);
    }
    /** 활성 블랙리스트(만료분 제외). 만료 항목은 다음 저장 때 정리(읽기는 순수). */
    activeBlacklist(now: number): readonly BlacklistEntry[] {
        return this.cfg.blacklist.filter((b) => b.until > now);
    }

    /** watchlist 추가(멱등). @returns 새로 추가됐으면 true */
    addWatch(code: string): boolean {
        if (this.cfg.watchlist.includes(code)) return false;
        this.cfg.watchlist.push(code);
        this.save();
        return true;
    }

    /** watchlist 제거 + 그 종목 스코프 규칙 연쇄 삭제. */
    removeWatch(code: string): void {
        this.cfg.watchlist = this.cfg.watchlist.filter((c) => c !== code);
        this.cfg.alarms = this.cfg.alarms.filter((a) => a.code !== code);
        this.save();
    }

    /** 규칙 추가 — id 는 서버 발급. code 스코프면 watchlist 자동 승격(알람은 타겟에만 불변식 유지). */
    addAlarm(input: Omit<AlarmRule, "id">): AlarmRule {
        const rule: AlarmRule = { ...input, id: randomUUID() };
        if (rule.code && !this.cfg.watchlist.includes(rule.code)) this.cfg.watchlist.push(rule.code);
        this.cfg.alarms.push(rule);
        this.save();
        return rule;
    }

    /** @returns 지웠으면 true(없는 id 면 false) */
    removeAlarm(id: string): boolean {
        const before = this.cfg.alarms.length;
        this.cfg.alarms = this.cfg.alarms.filter((a) => a.id !== id);
        if (this.cfg.alarms.length === before) return false;
        this.save();
        return true;
    }

    /** 유니버스 규칙 전체 교체(PUT) — **스코프 규칙은 보존**. id 없는 규칙은 서버 발급. */
    setUniverseRules(rules: readonly (Omit<AlarmRule, "id" | "code"> & { id?: string })[]): AlarmRule[] {
        const scoped = this.cfg.alarms.filter((a) => a.code != null);
        const unscoped = rules.map((r) => ({ ...r, code: undefined, id: r.id ?? randomUUID() }));
        this.cfg.alarms = [...scoped, ...unscoped];
        this.save();
        return [...unscoped];
    }

    /** 블랙리스트 추가/갱신(같은 코드는 until·scope 교체) — 만료분 정리 겸. */
    addBlacklist(code: string, until: number, now: number, scope: "telegram" | "all" = "telegram"): BlacklistEntry {
        this.cfg.blacklist = this.cfg.blacklist.filter((b) => b.code !== code && b.until > now);
        const entry: BlacklistEntry = { code, until, scope };
        this.cfg.blacklist.push(entry);
        this.save();
        return entry;
    }

    removeBlacklist(code: string): void {
        this.cfg.blacklist = this.cfg.blacklist.filter((b) => b.code !== code);
        this.save();
    }

    private save(): void {
        fs.mkdirSync(path.dirname(this.abs), { recursive: true });
        const tmp = `${this.abs}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2), "utf8");
        fs.renameSync(tmp, this.abs);
    }
}
