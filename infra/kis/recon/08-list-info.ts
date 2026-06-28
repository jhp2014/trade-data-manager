// 정찰 8: 예탁원정보(상장정보일정) HHKDB669107C0 — 상장 변동 이벤트(신규상장·증자·감자·액분 등) 실측.
// 닫을 미지수:
//   ① 커버리지 깊이 — F_DT 를 과거로 밀어 가장 오래된 list_dt 가 어디까지 오는지.
//   ② CTS 페이징 — 응답 raw 의 top-level 키/trCont 에 다음 CTS 가 있는지(문서엔 응답 CTS 없음).
//   ③ 신규상장 행 + issue_price=공모가 확인. issue_type 분포.
//   ④ shares(D) 복원 — list_dt ≤ D 중 최신 tot_issue_stk_qty. (원주가close × shares(D) = 시총 백필 입력)
//   ⑤ 액분·감자 이벤트가 오는지 + tot_issue_stk_qty 반영 방식.
// 사용: pnpm --filter @trade-data-manager/kis recon:list-info [종목코드(공백=전체)] [F_DT] [T_DT] [기준일D]
//   예) recon:list-info 475560 20230101 20261231 20250101   (더본코리아 전체 이력 + 2025-01-01 주식수)
//       recon:list-info "" 20260501 20260628                (전체 종목 최근 한 달 변동 — 신규상장 탐색)
import { makeKis, saveExploration, argv, today, handleError } from "./_shared.js";
import type { KisListInfoEvent } from "../src/index.js";

const num = (s: string): number => Number(String(s).trim() || "0");

async function main() {
    const shtCd = argv(2, "475560");
    const fromDate = argv(3, "20230101");
    const toDate = argv(4, today());
    const probeD = argv(5, ""); // 주식수 복원 기준일(선택)

    const k = makeKis();
    const res = await k.rest.getListInfo(shtCd, fromDate, toDate);
    const all: KisListInfoEvent[] = res.data.output1 ?? [];
    // output1 은 100슬롯 고정버퍼 — 빈 행(list_dt 공백) 다수. 실제 이벤트만.
    const events = all.filter((e) => e.list_dt.trim());
    const asc = [...events].sort((a, b) => a.list_dt.localeCompare(b.list_dt));

    // ① 커버리지(실제 이벤트 기준)
    const dates = asc.map((e) => e.list_dt);
    const coverage = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "(이벤트 0)";

    // ② CTS 후보 — 응답 top-level 키와 trCont (100슬롯 다 차면 페이징 필요)
    const topKeys = Object.keys(res.data);
    const ctsCandidates = topKeys.filter((k2) => /cts|next|cont/i.test(k2));

    // ③ issue_type 분포 + 공모가 후보(신규상장 시기 유상증자 행)
    const typeDist: Record<string, number> = {};
    for (const e of asc) typeDist[e.issue_type] = (typeDist[e.issue_type] ?? 0) + 1;

    // ④ shares(D) = list_dt ≤ D 인 delta(issue_stk_qty) 누적합. (tot 는 모든 행 동일=현재총수 스냅샷이라 못 씀)
    const sumDelta = (until?: string): number =>
        asc.filter((e) => !until || e.list_dt <= until).reduce((s, e) => s + num(e.issue_stk_qty), 0);
    const totalDeltas = sumDelta();
    const totSnapshot = asc.length ? num(asc[asc.length - 1].tot_issue_stk_qty) : 0;

    console.log("─".repeat(80));
    console.log(`종목=${shtCd || "전체"}  범위=[${fromDate}~${toDate}]  실이벤트=${events.length}/${all.length}슬롯`);
    console.log(`① 커버리지(list_dt): ${coverage}`);
    console.log(`② CTS 후보키=${JSON.stringify(ctsCandidates)}  trCont="${res.trCont}"  버퍼=${events.length}/100${events.length >= 100 ? " ⚠️포화→페이징필요" : ""}`);
    console.log(`③ issue_type 분포: ${JSON.stringify(typeDist)}`);
    console.log(`   Σdelta=${totalDeltas.toLocaleString()}  vs  tot스냅샷=${totSnapshot.toLocaleString()}  ${totalDeltas === totSnapshot ? "✅일치(=현재총주식수)" : "⚠️불일치"}`);
    if (probeD) {
        console.log(`④ shares(${probeD}) = ${sumDelta(probeD).toLocaleString()}  (≤${probeD} delta 누적합)`);
    }

    saveExploration({
        trId: "HHKDB669107C0",
        label: `list-info-${shtCd || "all"}`,
        request: { shtCd, fromDate, toDate, probeD },
        headers: { trCont: res.trCont, rt_cd: res.data.rt_cd, msg_cd: res.data.msg_cd, msg1: res.data.msg1 },
        response: { count: events.length, coverage, typeDist, ctsCandidates, topKeys, firstThree: asc.slice(0, 3), lastThree: asc.slice(-3) },
        raw: res.data,
    });
}

main().catch(handleError);
