// probe CLI — inbound 서비스를 실 어댑터(시트+DB)에 물려 e2e 로 찔러보고 로그를 모은다.
//
//   review <date>                                그날 리뷰 행(검수 데이터) 요약 출력 + 전체 JSON 로그저장
//   confirm <date> <code> <issue> [--author A] [--comment C]   확정 이슈 행 추가(멱등)
//   remove  <date> <code> <issue>                확정 이슈 행 삭제
import fs from "node:fs";
import path from "node:path";
import type { DaySummary } from "@trade-data-manager/market";
import { createProbeRuntime } from "./composition.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(d: string | undefined, label: string): asserts d is string {
    if (!d || !DATE_RE.test(d)) throw new Error(`잘못된 ${label}(YYYY-MM-DD): ${d}`);
}

function flagValue(raw: string[], name: string): string | undefined {
    const i = raw.indexOf(name);
    if (i === -1) return undefined;
    const v = raw[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
}

function saveLog(name: string, payload: unknown): string {
    const dir = path.resolve(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
    return file;
}

function printSummary(s: DaySummary): void {
    const unclassified = s.stocks.filter((x) => x.themes.length === 0).length;
    const confirmed = s.stocks.filter((x) => x.issues.length > 0).length;
    const multi = s.stocks.filter((x) => x.themes.length > 1).length;

    // 테마별 종목 수(byTheme 는 코드 참조 → 길이 = 종목 수).
    const top = Object.entries(s.byTheme)
        .map(([theme, codes]) => [theme, codes.length] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    console.log(`▶ summary ${s.date}`);
    console.log(
        `  universe ${s.stockCount} · 분류됨 ${s.stockCount - unclassified} · 미분류 ${unclassified} · ` +
            `다중테마 ${multi} · 확정행보유 ${confirmed}`,
    );
    console.log(`  테마 분포(상위 ${top.length}):`);
    for (const [t, n] of top) console.log(`    ${t}: ${n}`);
    const sample = s.stocks.slice(0, 8).map((x) => {
        const themes = x.themes.length ? x.themes.map((t) => t.theme).join("·") : "미분류";
        return `${x.stockCode}${x.name ? `(${x.name})` : ""}→${themes}`;
    });
    console.log(`  샘플: ${sample.join("  ")}`);
}

const USAGE =
    "사용법:\n" +
    "  review <date>\n" +
    "  confirm <date> <code> <issue> [--author A] [--comment C]\n" +
    "  remove  <date> <code> <issue>";

async function main(): Promise<void> {
    const raw = process.argv.slice(2);
    const [cmd, a1, a2, a3] = raw.filter((a) => !a.startsWith("--"));
    if (!cmd) {
        console.error(USAGE);
        process.exit(1);
    }

    const rt = createProbeRuntime();
    try {
        switch (cmd) {
            case "review": {
                assertDate(a1, "date");
                const summary = await rt.summary.summaryByDate(a1);
                printSummary(summary);
                console.log(`💾 ${saveLog(`review-${a1}`, summary)}`);
                break;
            }
            case "confirm": {
                assertDate(a1, "date");
                if (!a2 || !a3) throw new Error("사용법: confirm <date> <code> <issue> [--author A] [--comment C]");
                const author = flagValue(raw, "--author") ?? "me";
                const comment = flagValue(raw, "--comment");
                await rt.editor.addIssues([{ date: a1, stockCode: a2, issue: a3, author, comment }]);
                console.log(`✓ 확정: ${a1} ${a2} "${a3}" (author=${author}${comment ? `, comment=${comment}` : ""})`);
                break;
            }
            case "remove": {
                assertDate(a1, "date");
                if (!a2 || !a3) throw new Error("사용법: remove <date> <code> <issue>");
                await rt.editor.removeIssue(a1, a2, a3);
                console.log(`✓ 삭제: ${a1} ${a2} "${a3}"`);
                break;
            }
            default:
                console.error(`알 수 없는 명령: ${cmd}\n${USAGE}`);
                process.exitCode = 1;
                return;
        }
        console.log("✅ 완료");
    } catch (err) {
        console.error("\n❌ 실패");
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
        process.exitCode = 1;
    } finally {
        await rt.close();
    }
}

void main();
