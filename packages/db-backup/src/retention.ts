import fs from "node:fs";
import path from "node:path";
import { config, policy } from "./config";
import { sourceDbName } from "./pg";
import type { Logger } from "./logger";

interface BackupFile {
    name: string;
    ts: string; // YYYYMMDD-HHmmss
    month: string; // YYYY-MM
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 디렉터리에서 유효 덤프(.dump) 목록을 최신순으로 반환. (.failed.dump 는 제외) */
function listBackups(dir: string): BackupFile[] {
    if (!fs.existsSync(dir)) return [];
    const prefix = sourceDbName() + "_";
    const re = new RegExp(`^${escapeRe(prefix)}(\\d{8})-(\\d{6})\\.dump$`);
    const out: BackupFile[] = [];
    for (const name of fs.readdirSync(dir)) {
        const m = name.match(re);
        if (!m) continue;
        out.push({
            name,
            ts: `${m[1]}-${m[2]}`,
            month: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}`,
        });
    }
    return out.sort((a, b) => b.ts.localeCompare(a.ts)); // 최신 우선
}

/** 보관 대상 = 최근 keepRecent 개 ∪ 최근 keepMonths 개월의 각 월 최신 1개 */
function keepSet(files: BackupFile[]): Set<string> {
    const keep = new Set<string>();
    for (const f of files.slice(0, policy.keepRecent)) keep.add(f.name);

    const seenMonths: string[] = [];
    for (const f of files) {
        if (seenMonths.includes(f.month)) continue;
        if (seenMonths.length >= policy.keepMonths) continue;
        seenMonths.push(f.month);
        keep.add(f.name); // 최신순이므로 해당 월 첫 등장 = 그 달 최신본
    }
    return keep;
}

/**
 * local / mybox 양쪽에 보관 정책 적용.
 * 반드시 "검증 통과 + 신규 백업 보관 완료" 후에만 호출할 것.
 */
export function applyRetention(log: Logger): void {
    for (const dir of [config.localDir, config.myboxDir]) {
        const files = listBackups(dir);
        const keep = keepSet(files);
        for (const f of files) {
            if (!keep.has(f.name)) {
                fs.rmSync(path.join(dir, f.name));
                log.info(`보관 정리 삭제: ${path.basename(dir)}/${f.name}`);
            }
        }
    }
}
