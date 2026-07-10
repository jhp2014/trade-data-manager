import fs from "node:fs";
import path from "node:path";
import { config, policy } from "./config";
import { sourceDbName } from "./pg";
import * as gdrive from "./gdrive";
import type { Logger } from "./logger";

interface BackupName {
    name: string;
    ts: string; // YYYYMMDD-HHmmss
    month: string; // YYYY-MM
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function backupRegex(): RegExp {
    return new RegExp(`^${escapeRe(sourceDbName() + "_")}(\\d{8})-(\\d{6})\\.dump$`);
}

/** 유효 덤프(.dump)만 파싱. manifest/.failed 등은 null → 보관정책 대상 아님. */
function parseBackupName(name: string): BackupName | null {
    const m = name.match(backupRegex());
    if (!m) return null;
    return { name, ts: `${m[1]}-${m[2]}`, month: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}` };
}

/** 보관 대상 = 최근 keepRecent 개 ∪ 최근 keepMonths 개월의 각 월 최신 1개. */
export function computeKeep(names: string[]): Set<string> {
    const files = names
        .map(parseBackupName)
        .filter((f): f is BackupName => f !== null)
        .sort((a, b) => b.ts.localeCompare(a.ts)); // 최신 우선

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

/** 로컬 디렉터리의 유효 덤프 파일명 목록. */
export function listLocalDumpNames(): string[] {
    if (!fs.existsSync(config.localDir)) return [];
    return fs.readdirSync(config.localDir).filter((n) => parseBackupName(n) !== null);
}

/** 덤프 이름들 중 최신(타임스탬프 최대) 1개. 유효 덤프 없으면 null. (restore 기본 소스 선택용) */
export function pickLatestDump(names: string[]): string | null {
    const files = names
        .map(parseBackupName)
        .filter((f): f is BackupName => f !== null)
        .sort((a, b) => b.ts.localeCompare(a.ts));
    return files[0]?.name ?? null;
}

/** 로컬(파일시스템) 보관 정책 적용. 검증 통과 후에만 호출. */
export function applyLocalRetention(log: Logger): void {
    const names = listLocalDumpNames();
    const keep = computeKeep(names);
    for (const name of names) {
        if (!keep.has(name)) {
            fs.rmSync(path.join(config.localDir, name));
            log.info(`로컬 보관정리 삭제: ${name}`);
        }
    }
}

/** Google Drive 보관 정책 적용 (덤프 파일만 대상, manifest 는 건드리지 않음). */
export async function applyDriveRetention(log: Logger): Promise<void> {
    const files = (await gdrive.listFiles()).filter((f) => parseBackupName(f.name) !== null);
    const keep = computeKeep(files.map((f) => f.name));
    for (const f of files) {
        if (!keep.has(f.name)) {
            await gdrive.deleteFile(f.id);
            log.info(`Drive 보관정리 삭제: ${f.name}`);
        }
    }
}
