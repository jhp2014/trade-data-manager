// 정찰 2: list.json — 한 회사의 공시 목록을 전 기간으로.
//
// 닫을 미지수:
//   ⓐ 정기보고서(사업·반기·분기)가 몇 년 전까지 있는가.
//   ⓑ 정정본이 얼마나 잦은가 — 시점 재현은 last_reprt_at=N 으로 버전을 다 받아야 한다.
//   ⓒ corp_name 이 접수 당시 이름인가, 현재 이름인가(사명 변경 전후로 값이 갈리면 당시 이름).
//   ⓓ 상호 변경이 공시 제목(report_nm)으로 잡히는가.
//   ⓔ 공시가 전체 몇 건인가(수집 규모).
//
// 사용: pnpm --filter @trade-data-manager/dart recon:filings 290690,000430,0004V0,000660
import { dist, handleError, loadCorpCodes, makeDart, saveFilings, today } from "./_shared.js";
import type { Dart, DartDisclosure, DartDisclosureQuery } from "../src/index.js";

const PAGE_COUNT = 100;
/** 한 회사당 상한. 대형주의 전 공시를 끝까지 받을 이유는 없다. */
const MAX_PAGES = 30;
const BEGIN = "19990101";

async function fetchAll(dart: Dart, q: DartDisclosureQuery): Promise<{ rows: DartDisclosure[]; total: number }> {
    const rows: DartDisclosure[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
        const res = await dart.rest.searchDisclosures({ ...q, pageNo, pageCount: PAGE_COUNT });
        total = res.total_count ?? total;
        rows.push(...(res.list ?? []));
        if (pageNo >= (res.total_page ?? 1)) break;
    }
    // 오름차순이라 상한에 걸리면 **최신 쪽**이 잘린다 — 이름·상호 집계가 그 앞까지만이라는 뜻.
    if (rows.length < total) {
        console.warn(`  ⚠ ${total}건 중 앞 ${rows.length}건만 받음(상한 ${MAX_PAGES}쪽) — 마지막 ${rows[rows.length - 1]?.rcept_dt} 이후는 집계에 없다`);
    }
    return { rows, total };
}

const KIND = /(사업보고서|반기보고서|분기보고서)/;

function reportKind(name: string): string {
    return KIND.exec(name)?.[1] ?? "기타";
}

async function main() {
    const codes = (process.argv[2] ?? "290690").split(",").map((c) => c.trim()).filter(Boolean);
    const dart = makeDart();
    const corps = await loadCorpCodes(dart);

    for (const code of codes) {
        const corp = corps.find((c) => c.stockCode === code);
        console.log(`\n${"=".repeat(70)}\n${code}: ${corp ? `${corp.corpName} (${corp.corpCode})` : "corpCode 에 없음"}`);
        if (!corp) continue;

        const periodic = await fetchAll(dart, {
            corpCode: corp.corpCode,
            bgnDe: BEGIN,
            endDe: today(),
            pblntfTy: "A",
            lastReprtAt: "N",
            sort: "date",
            sortMth: "asc",
        });
        const all = await fetchAll(dart, {
            corpCode: corp.corpCode,
            bgnDe: BEGIN,
            endDe: today(),
            lastReprtAt: "N",
            sort: "date",
            sortMth: "asc",
        });
        saveFilings(code, periodic.rows);

        // ⓐ 기간·종류
        const first = periodic.rows[0];
        const last = periodic.rows[periodic.rows.length - 1];
        console.log(`정기공시 ${periodic.total}건 (${first?.rcept_dt} ~ ${last?.rcept_dt}) / 전체 공시 ${all.total}건`);
        console.log("  종류:", JSON.stringify(dist(periodic.rows, (r) => reportKind(r.report_nm))));
        console.log("  연도별 접수:", dist(periodic.rows, (r) => r.rcept_dt.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0])).map(([y, n]) => `${y}:${n}`).join(" "));

        // ⓑ 정정 비율 — 제목으로만 센다. 실측: 비고 rm "정"은 정정본이 아니라 "나중에 정정된 원본" 표시다.
        const amended = periodic.rows.filter((r) => /정정/.test(r.report_nm));
        console.log(`  정정본 ${amended.length}건:`, amended.slice(0, 5).map((r) => `${r.rcept_dt} ${r.report_nm.trim()}`).join(" | "));

        // ⓒ 이름이 시간에 따라 갈리는가
        const names = new Map<string, { first: string; last: string; n: number }>();
        for (const r of all.rows) {
            const cur = names.get(r.corp_name);
            if (!cur) names.set(r.corp_name, { first: r.rcept_dt, last: r.rcept_dt, n: 1 });
            else {
                cur.last = r.rcept_dt;
                cur.n += 1;
            }
        }
        console.log("  corp_name 값:", JSON.stringify([...names.entries()]));

        // ⓓ 상호 변경 공시
        const rename = all.rows.filter((r) => /상호|명칭|사명/.test(r.report_nm));
        console.log(`  제목에 상호·명칭·사명: ${rename.length}건`);
        for (const r of rename.slice(0, 8)) console.log(`    ${r.rcept_dt} ${r.report_nm.trim()} (${r.rcept_no})`);
    }
}

main().catch(handleError);
