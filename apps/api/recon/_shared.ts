// 격자 recon 공용 유틸 — infra/kiwoom/recon/_shared.ts 의 축소판(API 정찰 대신 로컬 DB·캐시 실측).
// 결과는 콘솔 요약 + logs/grid-report/{label}-{ts}.json (gitignored) — 사람/AI 사후 검수용.
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), "logs/grid-report");

/** 리포트를 파일로 저장하고 경로를 돌려준다. 콘솔에는 경로만 — 본문 요약은 호출자가 찍는다. */
export function saveReport(label: string, payload: unknown): string {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const filePath = path.join(OUTPUT_DIR, `${label}-${ts}.json`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`💾 리포트: ${filePath}`);
    return filePath;
}

/** `--name value` / `--name=value` 플래그 파서(숫자). 없으면 fallback. */
export function numFlag(name: string, fallback: number): number {
    const argv = process.argv;
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === `--${name}`) {
            const v = Number(argv[i + 1]);
            return Number.isFinite(v) ? v : fallback;
        }
        if (a.startsWith(`--${name}=`)) {
            const v = Number(a.slice(name.length + 3));
            return Number.isFinite(v) ? v : fallback;
        }
    }
    return fallback;
}

/** 문자열 플래그. 플래그는 있는데 값이 없으면(다음 토큰이 또 플래그) **던진다** — `--dir` 값 누락을
 *  undefined 로 삼키면 기본 루트(실캐시)로 조용히 떨어져, A/B 격리가 깨지는 바로 그 사고가 된다. */
export function strFlag(name: string): string | undefined {
    const argv = process.argv;
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === `--${name}`) {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith("--")) throw new Error(`--${name} 값 누락`);
            return v;
        }
        if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
    }
    return undefined;
}

/** 분포 요약 — 정렬 후 p50/p90/p99/max. 빈 배열이면 전부 0. */
export function distributionOf(values: number[]): { n: number; p50: number; p90: number; p99: number; max: number; sum: number } {
    if (values.length === 0) return { n: 0, p50: 0, p90: 0, p99: 0, max: 0, sum: 0 };
    const s = [...values].sort((a, b) => a - b);
    const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
    return { n: s.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: s[s.length - 1], sum: s.reduce((a, b) => a + b, 0) };
}

/** "HH:MM:SS" → 자정기준 분 — 손 타점 시각을 격자 시각(분)과 같은 자에 놓는다. */
export function toMin(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}
