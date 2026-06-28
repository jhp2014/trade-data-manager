// 정찰 2: 분봉 과거 깊이 경계 실측 — 같은 날짜를 키움·KIS 양쪽에서 떠 "며칠 전까지 분봉을 주는지"를 대조.
// 목적: 라우팅 임계값 N(오늘 기준 N일 이전 → 키움 단독, 이내 → 키움/KIS 라운드로빈)을 실측으로 정한다.
//       또한 설계 전제 = "키움이 KIS보다 깊다(그 사이 구간 존재)"가 사실인지 확인한다.
//       메모리 [[kis-api-addition]] "분봉깊이 둘다~1년"이 근사라, 둘이 같으면 키움단독 라우팅 전제가 무너짐.
//
// 방법: 오늘부터 과거로 표본 날짜를 만들어(주말은 직전 평일로 보정) 각 날짜·벤더의 분봉 존재(개수>0)를 본다.
//       롤오프 경계는 "연속으로 빈 구간"으로 드러난다(휴장 단발 빈값과 구분). UN(통합) 시장 1종목으로 확인.
//       휴장(대선 등 임시공휴일)은 양쪽 모두 0 + 전후엔 데이터 → 일단위 스캔으로 깊이경계와 구분한다.
// 사용: pnpm --filter @trade-data-manager/broker recon:minute-depth [종목코드] [fromOffset] [toOffset] [step]
//       인자 없으면 coarse(최근+10일간격), 주면 from..to 를 step 일단위로 정밀 스캔.
import fs from "node:fs";
import path from "node:path";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKis } from "@trade-data-manager/kis";

/** Date → YYYYMMDD */
function ymd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 오늘 - offsetDays. 주말이면 직전 금요일로 보정(주말은 양쪽 모두 빈값이라 노이즈). */
function probeDate(offsetDays: number): { date: string; offset: number } {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return { date: ymd(d), offset: offsetDays };
}

async function main() {
    const stockCode = process.argv[2] || "005930";
    const kw = createKiwoom();
    const kis = createKis();

    const fromArg = process.argv[3] ? Number(process.argv[3]) : null;
    const toArg = process.argv[4] ? Number(process.argv[4]) : null;
    const stepArg = process.argv[5] ? Number(process.argv[5]) : 1;

    const offsets: number[] = [];
    if (fromArg !== null && toArg !== null) {
        // 정밀 스캔: from..to 를 step 일단위로(휴장 단발 0 과 깊이경계 구분).
        for (let o = fromArg; o <= toArg; o += stepArg) offsets.push(o);
    } else {
        // coarse: 최근(정상 존재 확인) + 경계 의심 구간(~10~14개월) 10일 간격.
        offsets.push(5, 30, 90, 180, 270);
        for (let o = 300; o <= 450; o += 10) offsets.push(o);
    }

    const seen = new Set<string>();
    const probes = offsets
        .map(probeDate)
        .filter((p) => (seen.has(p.date) ? false : (seen.add(p.date), true)));

    interface Row {
        offset: number;
        date: string;
        kiwoom: number;
        kis: number;
        kiwoomRange: [string, string] | null;
        kisRange: [string, string] | null;
    }
    const rows: Row[] = [];

    for (const { date, offset } of probes) {
        // KIS: 단일콜(120봉) 존재 확인. UN(통합). 153000 기준 과거.
        let kisCount = 0;
        let kisRange: [string, string] | null = null;
        try {
            const res = await kis.rest.getDailyMinuteChart(stockCode, {
                date,
                time: "153000",
                marketDiv: "UN",
            });
            const c = (res.data.output2 ?? []).filter((r) => r.stck_bsop_date === date);
            kisCount = c.length;
            if (c.length) {
                const times = c.map((r) => r.stck_cntg_hour).sort();
                kisRange = [times[0], times[times.length - 1]];
            }
        } catch (e) {
            kisCount = -1; // 오류(유량/토큰 등) — 빈값과 구분
        }

        // 키움: 단일 페이지 존재 확인. UN = 코드_AL. base_dt 기준 최신→과거.
        let kwCount = 0;
        let kwRange: [string, string] | null = null;
        try {
            const res = await kw.rest.getMinuteChart(`${stockCode}_AL`, { baseDate: date });
            const c = (res.data.stk_min_pole_chart_qry ?? []).filter(
                (r) => r.cntr_tm.substring(0, 8) === date,
            );
            kwCount = c.length;
            if (c.length) {
                const times = c.map((r) => r.cntr_tm.substring(8, 14)).sort();
                kwRange = [times[0], times[times.length - 1]];
            }
        } catch (e) {
            kwCount = -1;
        }

        rows.push({ offset, date, kiwoom: kwCount, kis: kisCount, kiwoomRange: kwRange, kisRange: kisRange });
        console.log(
            `D-${String(offset).padStart(3)}  ${date}  키움=${String(kwCount).padStart(4)}  KIS=${String(kisCount).padStart(4)}` +
                `   ${kwCount > 0 && kisCount === 0 ? "◀ 키움only(폴백구간)" : ""}`,
        );
    }

    // 경계 추정: KIS 가 연속으로 0 이 되기 시작하는 첫 offset.
    const kisBoundary = rows.find((r, i) => r.kis === 0 && rows.slice(i).every((x) => x.kis <= 0));
    const kwBoundary = rows.find((r, i) => r.kiwoom === 0 && rows.slice(i).every((x) => x.kiwoom <= 0));

    console.log("─".repeat(80));
    console.log(`종목=${stockCode}`);
    console.log(`KIS  경계(연속0 시작): ${kisBoundary ? `D-${kisBoundary.offset} (${kisBoundary.date})` : "표본 내 끊김 없음"}`);
    console.log(`키움 경계(연속0 시작): ${kwBoundary ? `D-${kwBoundary.offset} (${kwBoundary.date})` : "표본 내 끊김 없음"}`);
    console.log(
        `전제 검증: ${
            kisBoundary && (!kwBoundary || kwBoundary.offset > kisBoundary.offset)
                ? "✅ 키움이 KIS보다 깊음 → 키움단독 라우팅 유효"
                : "⚠️ 깊이 차 불명확 — 라우팅 전제 재검토"
        }`,
    );

    const dir = path.resolve(process.cwd(), "logs/raw-samples");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `minute-depth-${stockCode}-${ymd(new Date())}.json`);
    fs.writeFileSync(file, JSON.stringify({ stockCode, rows, kisBoundary, kwBoundary }, null, 2), "utf-8");
    console.log(`💾 Saved: ${file}`);
    console.log("─".repeat(80));
}

main().catch((err) => {
    console.error("\n❌ 정찰 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
