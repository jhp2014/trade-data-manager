// 정찰 4: 상호변경안내 공시 — 사명 이력의 재료가 되는가.
//
// 닫을 미지수:
//   ⓐ 거래소 공시(접수번호 9로 시작하는 자리)도 document.xml 로 본문을 받을 수 있는가.
//   ⓑ 본문에서 옛 이름·새 이름·변경일을 뽑을 수 있는가.
//   ⓒ KRX ISU_NM 이력이 있는데도 이것이 더 주는 것이 있는가.
//
// 사용: pnpm --filter @trade-data-manager/dart recon:rename 230980,139050,290690
import { handleError, loadCorpCodes, makeDart, today } from "./_shared.js";

const PAGE_COUNT = 100;
const MAX_PAGES = 20;

function decode(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder("euc-kr").decode(bytes);
    }
}

const toText = (xml: string): string =>
    xml
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<\/(TD|TH|TE|TU)>/gi, " | ")
        .replace(/<\/(TR|P|TITLE)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&cr;/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();

async function main() {
    const codes = (process.argv[2] ?? "230980").split(",").map((c) => c.trim()).filter(Boolean);
    const dart = makeDart();
    const corps = await loadCorpCodes(dart);

    for (const code of codes) {
        const corp = corps.find((c) => c.stockCode === code);
        console.log(`\n${"=".repeat(70)}\n${code}: ${corp?.corpName ?? "corpCode 에 없음"}`);
        if (!corp) continue;

        for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
            const res = await dart.rest.searchDisclosures({
                corpCode: corp.corpCode,
                bgnDe: "19990101",
                endDe: today(),
                lastReprtAt: "N",
                sort: "date",
                sortMth: "asc",
                pageNo,
                pageCount: PAGE_COUNT,
            });
            for (const r of res.list ?? []) {
                if (!/상호변경/.test(r.report_nm)) continue;
                console.log(`\n${r.rcept_dt} ${r.report_nm.trim()} (${r.rcept_no}) 제출=${r.flr_nm}`);
                try {
                    const files = await dart.rest.getDocumentFiles(r.rcept_no);
                    const main = files.sort((a, b) => b.bytes.length - a.bytes.length)[0];
                    console.log(main ? toText(decode(main.bytes)).slice(0, 700) : "  파일 없음");
                } catch (err) {
                    console.log("  본문 받기 실패:", err instanceof Error ? err.message : "알 수 없는 오류");
                }
            }
            const totalPage = res.total_page ?? 1;
            if (pageNo >= totalPage) break;
            // 오름차순이라 상한에 걸리면 최신 쪽이 잘린다 — "상호변경 없음"으로 오독하지 않게 알린다.
            if (pageNo === MAX_PAGES) {
                console.warn(`  ⚠ 전체 ${res.total_count}건 중 ${MAX_PAGES}쪽까지만 봄 — 그 뒤 공시는 확인 안 됨`);
            }
        }
    }
}

main().catch(handleError);
