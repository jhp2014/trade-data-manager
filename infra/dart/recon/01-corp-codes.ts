// 정찰 1: corpCode.xml — 전 법인 고유번호 목록.
//
// 닫을 미지수:
//   ⓐ 인증·zip 응답이 실제로 도는가, 몇 건·몇 MB 인가.
//   ⓑ 상장폐지 종목이 stock_code 를 유지한 채 남아 있는가(공식 문서에 설명 없음).
//      → 우리 쪽 코드 목록을 파일로 받아 몇 개가 잡히는지 잰다.
//   ⓒ 한 종목코드에 법인이 둘 이상인 경우가 있는가(코드 재사용이면 stock_code 를 키로 못 쓴다).
//   ⓓ modify_date 분포 — 스냅샷 비교로 변경을 잡을 때의 재료가 되는가.
//
// 사용: pnpm --filter @trade-data-manager/dart recon:corp [코드목록 파일...]
//   파일 = 한 줄에 종목코드 하나(뒤에 탭으로 무엇이 붙어도 첫 칸만 읽는다).
import fs from "node:fs";
import path from "node:path";
import { dist, handleError, makeDart, saveJson } from "./_shared.js";

function readCodes(file: string): string[] {
    return fs
        .readFileSync(file, "utf-8")
        .split(/\r?\n/)
        .map((l) => (l.split("\t")[0] ?? "").trim())
        .filter(Boolean);
}

async function main() {
    const dart = makeDart();
    const corps = await dart.rest.getCorpCodes();
    const cachePath = saveJson("corp-codes.json", corps);

    const listed = corps.filter((c) => c.stockCode);
    const byStock = new Map<string, typeof corps>();
    for (const c of listed) {
        const code = c.stockCode as string;
        byStock.set(code, [...(byStock.get(code) ?? []), c]);
    }
    const dupes = [...byStock.entries()].filter(([, v]) => v.length > 1);

    console.log(`법인 ${corps.length} / 종목코드 있음 ${listed.length} / 서로 다른 종목코드 ${byStock.size}`);
    console.log(`저장 ${cachePath} (${(fs.statSync(cachePath).size / 1024 / 1024).toFixed(1)} MB)`);
    console.log("종목코드 길이:", JSON.stringify(dist(listed, (c) => `len=${c.stockCode?.length}`)));
    console.log(`한 종목코드에 법인 둘 이상: ${dupes.length}건`);
    for (const [code, v] of dupes.slice(0, 10)) {
        console.log(`  ${code}: ${v.map((c) => `${c.corpName}(${c.corpCode}, ${c.modifyDate})`).join(" / ")}`);
    }
    console.log("modify_date 연도 분포(종목코드 있음):");
    const years = dist(listed, (c) => c.modifyDate.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0]));
    console.log(" ", years.map(([y, n]) => `${y}:${n}`).join(" "));

    for (const file of process.argv.slice(2)) {
        const codes = readCodes(file);
        const hits = codes.map((code) => ({ code, corps: byStock.get(code) ?? [] }));
        const found = hits.filter((h) => h.corps.length > 0);
        const missing = hits.filter((h) => h.corps.length === 0).map((h) => h.code);
        console.log(`\n[${path.basename(file)}] ${codes.length}개 중 잡힘 ${found.length} / 없음 ${missing.length}`);
        console.log("  잡힌 표본:");
        for (const h of found.slice(0, 12)) {
            console.log(`    ${h.code} ${h.corps.map((c) => `${c.corpName}(${c.corpCode}, ${c.modifyDate})`).join(" / ")}`);
        }
        console.log(`  없는 코드: ${missing.slice(0, 40).join(" ")}${missing.length > 40 ? " …" : ""}`);
    }
}

main().catch(handleError);
