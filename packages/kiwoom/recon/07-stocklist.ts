// 정찰 7: 종목정보 리스트(ka10099) — 전종목 유니버스의 출발점 발굴.
// 목적(복기 자동스캔 ingest 전제):
//   ① 시장별 종목 수(코스피/코스닥) = 프루닝 모수
//   ② 응답에 어떤 필드가 오나 — 특히 ETF/ETN/스팩/관리/거래정지/감리 같은 "제외 플래그"가 여기 있나,
//      아니면 별도 TR이 필요한가 (REPLAY-COLLECTION-PLAN §7 탐침 항목 ⑤)
//   ③ 연속조회(cont-yn) 페이지네이션 동작
// 사용: pnpm --filter @trade-data-manager/kiwoom recon:stocklist [mrkt_tp=0]
//   mrkt_tp: 0=코스피 10=코스닥 8=ETF 3=ELW 50=코넥스 ...
import { makeKiwoom, saveExploration, argv, handleError } from "./_shared.js";

const MARKET_NAMES: Record<string, string> = {
    "0": "코스피",
    "10": "코스닥",
    "8": "ETF",
    "3": "ELW",
    "50": "코넥스",
    "30": "K-OTC",
};

async function main() {
    const mrktTp = argv(2, "0");
    const k = makeKiwoom();

    // 시퀀스 전체를 한 키에 핀 고정(연속조회 커서 유지).
    const lease = k.pool.acquire();
    let contYn = "N";
    let nextKey = "";
    let pages = 0;
    let listKey: string | undefined;
    let firstPageData: Record<string, unknown> | undefined;
    const all: Record<string, unknown>[] = [];

    do {
        const res = await k.rest.request<Record<string, unknown>>(
            "ka10099",
            "/api/dostk/stkinfo",
            { mrkt_tp: mrktTp },
            { lease, contYn, nextKey },
        );
        const data = res.data;
        if (!firstPageData) firstPageData = data;
        // 리스트 배열을 자동 탐지(응답 키 이름을 모르므로 첫 배열형 프로퍼티).
        if (!listKey) listKey = Object.keys(data).find((key) => Array.isArray((data as any)[key]));
        const page = (listKey ? ((data as any)[listKey] as Record<string, unknown>[]) : []) ?? [];
        all.push(...page);
        contYn = res.contYn;
        nextKey = res.nextKey;
        pages++;
    } while (contYn === "Y" && nextKey && pages < 50);

    // 제외 필터 어휘 발굴 — 분류성 필드의 distinct 값 분포.
    const tally = (key: string): Record<string, number> => {
        const m: Record<string, number> = {};
        for (const e of all) {
            const v = String((e as any)[key] ?? "");
            m[v] = (m[v] ?? 0) + 1;
        }
        // 상위 15개만(상태 문자열은 조합이 많아 폭주 방지)
        return Object.fromEntries(
            Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15),
        );
    };
    const classFields = ["kind", "auditInfo", "orderWarning", "companyClassName", "state", "upSizeName"];
    const distributions = Object.fromEntries(classFields.map((f) => [f, tally(f)]));
    const spacByName = all.filter((e) => String((e as any).name ?? "").includes("스팩")).length;

    // 값별 샘플 종목명(의미 파악용) — 특히 kind A/Q 가 뭔지 이름으로 확인.
    const samplesByValue = (key: string, n = 5): Record<string, string[]> => {
        const m: Record<string, string[]> = {};
        for (const e of all) {
            const v = String((e as any)[key] ?? "");
            (m[v] ??= []);
            if (m[v].length < n) m[v].push(String((e as any).name ?? ""));
        }
        return m;
    };
    const kindSamples = samplesByValue("kind");
    const auditSamples = samplesByValue("auditInfo");

    const sample = all[0];
    saveExploration({
        apiId: "ka10099",
        label: `${MARKET_NAMES[mrktTp] ?? mrktTp}`,
        request: { mrkt_tp: mrktTp },
        headers: { lastContYn: contYn, pages },
        response: {
            listKey,
            topLevelKeys: firstPageData ? Object.keys(firstPageData) : [],
            totalCount: all.length,
            sampleEntryKeys: sample ? Object.keys(sample) : [],
            samples: all.slice(0, 3),
        },
    });

    console.log("\n📊 요약");
    console.log(`  시장: ${MARKET_NAMES[mrktTp] ?? mrktTp} (mrkt_tp=${mrktTp})`);
    console.log(`  종목 수: ${all.length}  (페이지 ${pages})`);
    console.log(`  리스트 키: ${listKey}`);
    console.log(`  엔트리 필드: ${sample ? Object.keys(sample).join(", ") : "(없음)"}`);
    console.log(`  이름에 "스팩" 포함: ${spacByName}종목`);
    console.log("\n🔎 분류 필드 distinct 분포 (제외 어휘 발굴):");
    for (const [f, dist] of Object.entries(distributions)) {
        console.log(`  [${f}] ${JSON.stringify(dist)}`);
    }
    console.log("\n🔬 kind 값별 샘플 종목명 (A/Q 의미 파악):");
    for (const [v, names] of Object.entries(kindSamples)) console.log(`  kind=${v}: ${names.join(", ")}`);
    console.log("\n🔬 auditInfo 값별 샘플 종목명:");
    for (const [v, names] of Object.entries(auditSamples)) console.log(`  ${v}: ${names.join(", ")}`);
}

main().catch(handleError);
