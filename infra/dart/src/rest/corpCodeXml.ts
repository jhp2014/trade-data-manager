import type { DartCorpCode } from "./types.js";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const decodeEntities = (s: string): string => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, k: string) => ENTITIES[k] ?? "");

function field(block: string, tag: string): string {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
    return m ? decodeEntities(m[1] ?? "").trim() : "";
}

/** corpCode.xml 본문 → 법인 목록. 구조가 `<list>` 나열뿐이라 XML 파서 없이 푼다. 빈 칸은 null. */
export function parseCorpCodeXml(xml: string): DartCorpCode[] {
    const out: DartCorpCode[] = [];
    for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
        const block = m[1] ?? "";
        out.push({
            corpCode: field(block, "corp_code"),
            corpName: field(block, "corp_name"),
            corpEngName: field(block, "corp_eng_name") || null,
            stockCode: field(block, "stock_code") || null,
            modifyDate: field(block, "modify_date"),
        });
    }
    return out;
}
