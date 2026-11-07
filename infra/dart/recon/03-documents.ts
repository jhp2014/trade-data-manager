// 정찰 3: document.xml — 정기보고서 원문에서 "사업의 내용"을 뽑을 수 있는가.
//
// 닫을 미지수:
//   ⓐ zip 구성 — 파일이 몇 개고 본문은 어느 것인가, 크기는 얼마인가(저장 방식·AI 비용을 가른다).
//   ⓑ 인코딩 — UTF-8 인가, 옛 문서는 EUC-KR 인가.
//   ⓒ 절 추출 — "사업의 내용"의 머리(TITLE)를 기계로 찾아 자를 수 있는가, 연도별로 서식이 바뀌는가.
//   ⓓ 분기·반기보고서에도 사업의 내용이 실리는가.
//   ⓔ 낱말 — 시간에 따라 사업 전환이 보이는가, 고객사가 실명으로 나오는가.
//
//   ⓕ 전환이 사업의 내용 밖(회사의 개요·타법인출자 등)에만 나오는가 — 큰 절마다 낱말을 센다.
//
// 사용: pnpm --filter @trade-data-manager/dart recon:doc 290690 "조명,바이오,알츠하이머" [all:2021]
//   기본: 02 가 저장한 공시 목록에서 연도별 첫 사업보고서 + 최근 반기·분기 각 1건 + 정정본 1건.
//   all:YYYY: 그 해 이후 정기공시 전부.
import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR, ensureOutputDir, handleError, loadFilings, makeDart } from "./_shared.js";
import type { DartDisclosure } from "../src/index.js";

/**
 * 실측: 옛 문서는 XML 선언이 utf-8 인데 내용은 EUC-KR 이다 — 선언을 믿지 않고 바이트로 가른다.
 * UTF-8 로 엄격 디코딩이 되면 UTF-8, 아니면 EUC-KR.
 */
function decode(bytes: Uint8Array): { text: string; encoding: string } {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
    const declared = /encoding=["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase() ?? "없음";
    try {
        return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: `utf-8(선언 ${declared})` };
    } catch {
        return { text: new TextDecoder("euc-kr").decode(bytes), encoding: `euc-kr(선언 ${declared})` };
    }
}

/** 표는 칸을 ` | ` 로, 줄은 개행으로 살리고 나머지 태그를 지운다(news 의 dart:viewer 와 같은 꼴). */
function toText(xml: string): string {
    return xml
        .replace(/<\/(TD|TH|TE|TU)>/gi, " | ")
        .replace(/<\/(TR|P|TITLE)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        // 실측: 줄바꿈이 &amp;cr; 로 이중 이스케이프돼 온다 — &amp; 를 먼저 풀어야 &cr; 가 잡힌다.
        .replace(/&amp;/g, "&")
        .replace(/&cr;/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/( \| )+\n/g, "\n")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}

const titlesOf = (xml: string): string[] =>
    [...xml.matchAll(/<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi)].map((m) => toText(m[1] ?? ""));

/**
 * "사업의 내용" 머리부터 같은 깊이의 다음 절 머리까지 자른다.
 * 머리 앞의 가장 가까운 SECTION-n 으로 깊이를 알아내고, 그 깊이의 다음 여는 태그에서 끝낸다.
 */
function extractBusinessSection(xml: string): { body: string; tag: string | null } | null {
    const title = /<TITLE[^>]*>[^<]*사업의\s*내용[^<]*<\/TITLE>/i.exec(xml);
    if (!title) return null;
    const before = xml.slice(0, title.index);
    const opens = [...before.matchAll(/<(SECTION-\d)\b/gi)];
    const tag = opens[opens.length - 1]?.[1]?.toUpperCase() ?? null;
    const start = title.index + title[0].length;
    if (!tag) return { body: xml.slice(start), tag };
    const next = new RegExp(`<${tag}\\b`, "i").exec(xml.slice(start));
    return { body: next ? xml.slice(start, start + next.index) : xml.slice(start), tag };
}

function pick(filings: DartDisclosure[]): DartDisclosure[] {
    const isAmended = (r: DartDisclosure) => /정정/.test(r.report_nm);
    const annual = filings.filter((r) => /사업보고서/.test(r.report_nm) && !isAmended(r));
    const byYear = new Map<string, DartDisclosure>();
    for (const r of annual) if (!byYear.has(r.rcept_dt.slice(0, 4))) byYear.set(r.rcept_dt.slice(0, 4), r);
    const lastOf = (re: RegExp) => [...filings].reverse().find((r) => re.test(r.report_nm) && !isAmended(r));
    const amended = [...filings].reverse().find(isAmended);
    const chosen = [...byYear.values(), lastOf(/반기보고서/), lastOf(/분기보고서/), amended];
    return [...new Map(chosen.filter((r): r is DartDisclosure => !!r).map((r) => [r.rcept_no, r])).values()];
}

async function main() {
    const code = process.argv[2] ?? "290690";
    const words = (process.argv[3] ?? "").split(",").map((w) => w.trim()).filter(Boolean);
    const allSince = /^all:(\d{4})$/.exec(process.argv[4] ?? "")?.[1];
    const dart = makeDart();
    ensureOutputDir();

    const filings = loadFilings(code);
    const targets = allSince ? filings.filter((r) => r.rcept_dt.slice(0, 4) >= allSince) : pick(filings);

    for (const r of targets) {
        console.log(`\n${"-".repeat(70)}\n${r.rcept_dt} ${r.report_nm.trim()} (${r.rcept_no}) [이름: ${r.corp_name}]`);
        let files;
        try {
            files = await dart.rest.getDocumentFiles(r.rcept_no);
        } catch (err) {
            console.log("  받기 실패:", err instanceof Error ? err.message : "알 수 없는 오류");
            continue;
        }
        console.log("  파일:", files.map((f) => `${f.name}(${(f.bytes.length / 1024).toFixed(0)}KB)`).join(", "));

        // 본문 = 접수번호와 같은 이름의 xml(실측: 첨부는 뒤에 _00760 등이 붙고, 이름 앞에 / 가 붙기도 한다).
        // 없으면 가장 큰 xml.
        const xmls = files.filter((f) => /\.xml$/i.test(f.name)).sort((a, b) => b.bytes.length - a.bytes.length);
        const main = xmls.find((f) => f.name.replace(/^\//, "") === `${r.rcept_no}.xml`) ?? xmls[0];
        if (!main) {
            console.log("  xml 없음");
            continue;
        }
        const { text: xml, encoding } = decode(main.bytes);
        const titles = titlesOf(xml);
        console.log(`  본문 ${main.name} 인코딩=${encoding} ${(xml.length / 1024).toFixed(0)}K자 / TITLE ${titles.length}개`);
        console.log("  머리 표본:", titles.slice(0, 14).join(" · "));

        if (words.length > 0) {
            const parts = xml.split(/(?=<SECTION-1\b)/i).slice(1);
            const rows = parts.map((part) => {
                const body = toText(part);
                const title = titlesOf(part)[0] ?? "?";
                return `${title.slice(0, 14)}[${words.map((w) => body.split(w).length - 1).join("/")}]`;
            });
            console.log(`  절별 낱말(${words.join("/")}):`, rows.join(" "));
        }

        const section = extractBusinessSection(xml);
        if (!section) {
            console.log("  ⚠ 사업의 내용 머리를 못 찾음");
            continue;
        }
        const text = toText(section.body);
        const subTitles = titlesOf(section.body);
        console.log(`  사업의 내용: 태그=${section.tag} 원문 ${(section.body.length / 1024).toFixed(0)}K자 → 글 ${(text.length / 1024).toFixed(1)}K자`);
        console.log("  하위 머리:", subTitles.slice(0, 12).join(" · "));
        if (words.length > 0) {
            console.log("  낱말:", words.map((w) => `${w}=${text.split(w).length - 1}`).join(" "));
        }
        const buyer = [...text.matchAll(/[^\n]*(주요\s*(매출처|고객|거래처|판매처)|납품처)[^\n]*/g)].slice(0, 4).map((m) => m[0].slice(0, 160));
        if (buyer.length > 0) console.log("  매출처 줄:", buyer.join(" ⏎ "));

        fs.writeFileSync(path.join(OUTPUT_DIR, `doc-${code}-${r.rcept_no}.txt`), text, "utf-8");
    }
}

main().catch(handleError);
