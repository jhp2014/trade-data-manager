// 정찰 9: 종합 시황/공시(제목) FHKST01011800 의 과거조회 깊이(retention) 실측.
//   스펙상 FID_INPUT_DATE_1(00YYYYMMDD)/FID_INPUT_HOUR_1(0000HHMMSS) 로 과거 시각 앵커 가능.
//   (1) 포맷 확정: 알려진 거래일(0626)에 후보 포맷을 때려 어느 게 그 날짜로 앵커되는지 확인.
//   (2) 깊이 sweep: 확정 포맷으로 -3d ~ -1y 되감으며 보관 경계 탐색.
// 사용: pnpm --filter @trade-data-manager/kis exec tsx recon/09-news-depth.ts [format|sweep]
import { makeKis, saveExploration, argv, handleError } from "./_shared.js";

type Item = Record<string, string>;

function summarize(list: Item[]): { count: number; newest: string; oldest: string } {
    if (list.length === 0) return { count: 0, newest: "-", oldest: "-" };
    const stamp = (it: Item) => `${it.data_dt ?? "?"}/${it.data_tm ?? "?"}`;
    return { count: list.length, newest: stamp(list[0]), oldest: stamp(list[list.length - 1]) };
}

async function probe(
    k: ReturnType<typeof makeKis>,
    label: string,
    params: { date: string; time: string },
): Promise<Item[]> {
    const res = await k.rest.getNewsTitles(params);
    const list = (res.data.output ?? []) as Item[];
    const s = summarize(list);
    console.log(
        `[${label}] date="${params.date}" time="${params.time}" → rt_cd=${res.data.rt_cd} ` +
            `msg="${res.data.msg1}" count=${s.count} newest=${s.newest} oldest=${s.oldest}`,
    );
    saveExploration({
        trId: "FHKST01011800",
        label: `depth-${label}`,
        request: params,
        headers: { trCont: res.trCont, rt_cd: res.data.rt_cd, msg_cd: res.data.msg_cd, msg1: res.data.msg1 },
        response: { ...s, outputKeys: Object.keys(list[0] ?? {}) },
        raw: res.data,
    });
    return list;
}

// YYYYMMDD (offset 일수 전).
function ymd(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function runFormat(k: ReturnType<typeof makeKis>) {
    const day = "20260626"; // 알려진 거래일(금)
    console.log(`\n=== 포맷 확정 (기준일 ${day}) ===`);
    await probe(k, "fmt-v1-00date-blank", { date: `00${day}`, time: "" });
    await probe(k, "fmt-v2-rawdate-blank", { date: day, time: "" });
    await probe(k, "fmt-v3-00date-0000hms", { date: `00${day}`, time: `0000150000` });
    await probe(k, "fmt-v4-rawdate-hms", { date: day, time: `150000` });
    console.log("\n→ newest/oldest 의 data_dt 가 20260626 으로 찍히는 포맷이 정답.");
}

async function runSweep(k: ReturnType<typeof makeKis>) {
    console.log(`\n=== 깊이 sweep ===`);
    for (const daysAgo of [3, 7, 14, 30, 60, 90, 180, 365]) {
        const d = ymd(daysAgo);
        await probe(k, `back-${String(daysAgo).padStart(3, "0")}d-${d}`, { date: `00${d}`, time: "" });
    }
}

// 깊은 경계 탐색 — 1년 너머 어디까지 보관하나.
async function runDeep(k: ReturnType<typeof makeKis>) {
    console.log(`\n=== 1년 너머 경계 탐색 ===`);
    for (const daysAgo of [365, 540, 730, 1095, 1460, 1825]) {
        const d = ymd(daysAgo);
        await probe(k, `deep-${String(daysAgo).padStart(4, "0")}d-${d}`, { date: `00${d}`, time: "" });
    }
}

// 하루 전체를 시각 앵커 페이지네이션으로 긁을 수 있나 — 과거일(0626)에서 아침까지 되감기.
async function runPaginate(k: ReturnType<typeof makeKis>) {
    const day = "20260626";
    console.log(`\n=== 페이지네이션 검증 (${day}, 아침까지 되감기) ===`);
    let time = ""; // 첫 호출 = 그 날 최신
    const seen = new Set<string>();
    for (let page = 1; page <= 8; page++) {
        const list = await probe(k, `pg${page}-${day}`, { date: `00${day}`, time });
        if (list.length === 0) break;
        for (const it of list) seen.add(it.cntt_usiq_srno);
        const oldest = list[list.length - 1];
        const t = oldest.data_tm ?? "";
        if (t <= "090000") {
            console.log(`→ 장 시작(09시)대 도달, 누적 유니크 ${seen.size}건`);
            break;
        }
        time = `0000${t}`; // 다음 페이지는 이 시각 이전
    }
    console.log(`→ ${day} 누적 유니크 헤드라인 ${seen.size}건 (8페이지 한도)`);
}

// 자정 경계 — 한 응답이 전날 항목까지 섞어주나? (연속 워크 가능 여부의 핵심)
async function runCross(k: ReturnType<typeof makeKis>) {
    const day = "20260626";
    console.log(`\n=== 자정 경계 검증 (${day} 새벽 시각 앵커 → 전날(0625) 섞이나) ===`);
    // 0626 새벽 이른 시각으로 앵커: 그 시각 이전 항목이 40건 안 되면 0625 후반이 채워져야 함.
    for (const hms of ["000500", "010000", "020000"]) {
        const list = await probe(k, `cross-${day}-${hms}`, { date: `00${day}`, time: `0000${hms}` });
        const dates = [...new Set(list.map((it) => it.data_dt))].sort();
        console.log(`   → 응답에 섞인 data_dt 집합: [${dates.join(", ")}]`);
    }
    console.log("→ 집합에 20260625 가 함께 있으면 자정 넘김 = 연속 워크 가능.");
}

// 서비스(KisNewsAdapter+NewsBackfillService) 워크 재현 — 페이지당 신규 유니크(앵커 전진폭) 측정.
async function runWalk(k: ReturnType<typeof makeKis>) {
    const day = "20260626";
    console.log(`\n=== 워크 재현 (${day}, 페이지당 신규 유니크) ===`);
    const seen = new Set<string>();
    let anchor = { date: day, time: "235959" }; // 서비스 시작 앵커
    let prevOldestSrno: string | null = null;
    let prevOldestTm = "999999";
    for (let p = 1; p <= 80; p++) {
        const res = await k.rest.getNewsTitles({ date: `00${anchor.date}`, time: `0000${anchor.time}` });
        let list = (res.data.output ?? []) as Item[];
        const before = seen.size;
        const removedOverlap = prevOldestSrno !== null && list[0]?.cntt_usiq_srno === prevOldestSrno;
        if (removedOverlap) list = list.slice(1);
        for (const it of list) seen.add(it.cntt_usiq_srno);
        const oldest = list[list.length - 1];
        const newCnt = seen.size - before;
        const stuck = oldest && oldest.data_tm >= prevOldestTm ? " ⚠STUCK/JUMP" : "";
        if (newCnt < 30 || stuck || p <= 3 || p % 10 === 0) {
            console.log(
                `p${p}: 받음=${list.length} 신규=${newCnt} overlap제거=${removedOverlap} ` +
                    `newest=${list[0]?.data_tm} oldest=${oldest?.data_tm}/${oldest?.data_dt} 누적=${seen.size}${stuck}`,
            );
        }
        if (!oldest) break;
        prevOldestSrno = oldest.cntt_usiq_srno;
        prevOldestTm = oldest.data_tm;
        anchor = { date: oldest.data_dt, time: oldest.data_tm };
    }
}

// fresh 절대앵커가 각 시각에서 깔끔히 내림차순인지(=하루 깊은 페이지네이션 가능한지) 점검.
async function runFresh(k: ReturnType<typeof makeKis>) {
    const day = "20260626";
    console.log(`\n=== fresh 절대앵커 35회 순차 (${day}, 10분씩 하강) — wrap이 호출#에서 터지나 시각에서 터지나 ===`);
    let total = 0;
    for (let i = 0; i < 35; i++) {
        const minsBack = i * 10;
        const hh = 23 - Math.floor(minsBack / 60);
        const mm = 50 - (minsBack % 60);
        const h = ((hh + Math.floor(mm / 60) + 24) % 24).toString().padStart(2, "0");
        const m = ((mm % 60) + 60) % 60;
        const hms = `${h}${m.toString().padStart(2, "0")}00`;
        const res = await k.rest.getNewsTitles({ date: `00${day}`, time: `0000${hms}` });
        const list = (res.data.output ?? []) as Item[];
        total += list.length;
        const newest = list[0]?.data_tm;
        const oldest = list[list.length - 1]?.data_tm;
        const wrapped = oldest && newest && oldest > newest;
        console.log(
            `call#${i + 1} anchor=${hms} newest=${newest} oldest=${oldest} 누적호출건수=${total}${wrapped ? " ⚠WRAP" : ""}`,
        );
    }
}

// 수정안 검증 — 앵커 윈도(≤anchor) 필터 + strictly-older 전진. wrap 무시하고 0625로 크로스하나.
async function runWalk2(k: ReturnType<typeof makeKis>) {
    console.log(`\n=== walk2 (윈도필터 전진) — 0625 크로스까지 ===`);
    const seen = new Set<string>();
    let anchor = { date: "20260626", time: "235959" };
    const le = (it: Item) =>
        it.data_dt < anchor.date || (it.data_dt === anchor.date && it.data_tm <= anchor.time);
    const lt = (it: Item) =>
        it.data_dt < anchor.date || (it.data_dt === anchor.date && it.data_tm < anchor.time);
    let lastDate = anchor.date;
    for (let p = 1; p <= 200; p++) {
        const res = await k.rest.getNewsTitles({ date: `00${anchor.date}`, time: `0000${anchor.time}` });
        const list = (res.data.output ?? []) as Item[];
        const inWin = list.filter(le);
        const before = seen.size;
        for (const it of inWin) seen.add(it.cntt_usiq_srno);
        const older = list.filter(lt); // 내림차순이라 마지막이 최소
        const crossed = inWin.some((it) => it.data_dt < "20260626");
        if (p <= 3 || p % 20 === 0 || crossed || older.length === 0) {
            console.log(
                `p${p}: anchor=${anchor.date}/${anchor.time} inWin=${inWin.length} 신규=${seen.size - before} ` +
                    `older=${older.length} 누적=${seen.size}${crossed ? " ✅CROSSED-0625" : ""}`,
            );
        }
        if (crossed) {
            console.log(`→ 0626 완주 + 0625 진입. 0626 유니크 ≈ ${[...seen].filter((s) => s.startsWith("20260626")).length}`);
            break;
        }
        if (older.length === 0) {
            console.log(`→ 진전 정지(older 0). anchor=${anchor.time}`);
            break;
        }
        const oldest = older[older.length - 1];
        anchor = { date: oldest.data_dt, time: oldest.data_tm };
        lastDate = anchor.date;
    }
    void lastDate;
}

// (date YYYYMMDD, time HHMMSS) 를 deltaSec 만큼 과거로(자정 넘으면 전날). UTC 산술(날짜계산이라 TZ무관).
function stepBack(date: string, time: string, deltaSec: number): { date: string; time: string } {
    const dt = new Date(
        Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +time.slice(0, 2), +time.slice(2, 4), +time.slice(4, 6)),
    );
    dt.setUTCSeconds(dt.getUTCSeconds() - deltaSec);
    const p = (n: number) => String(n).padStart(2, "0");
    return {
        date: `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`,
        time: `${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}`,
    };
}

const KEY = (it: Item) => (it.data_dt ?? "") + (it.data_tm ?? "");

// B 프로토타입 — stall(older 0) 시 앵커를 강제로 10분씩 내려 stall 아래 데이터가 내려오는지 + 전날 크로스되는지.
async function runBProto(k: ReturnType<typeof makeKis>) {
    const startDate = "20250630";
    console.log(`\n=== B 프로토타입 (${startDate}, stall 시 forced step 10분) ===`);
    let anchor = { date: startDate, time: "235959" };
    const seen = new Set<string>();
    let forced = 0;
    let minReached = "235959";
    for (let p = 1; p <= 200; p++) {
        const res = await k.rest.getNewsTitles({ date: `00${anchor.date}`, time: `0000${anchor.time}` });
        const list = (res.data.output ?? []) as Item[];
        const aKey = anchor.date + anchor.time;
        const inWin = list.filter((it) => KEY(it) <= aKey);
        for (const it of inWin) seen.add(it.cntt_usiq_srno);
        const older = inWin.filter((it) => KEY(it) < aKey);
        const crossed = inWin.some((it) => (it.data_dt ?? "") < startDate);
        if (anchor.date === startDate && anchor.time < minReached) minReached = anchor.time;
        if (p <= 3 || p % 20 === 0 || crossed || (older.length === 0 && forced < 10)) {
            console.log(
                `p${p}: anchor=${anchor.date}/${anchor.time} inWin=${inWin.length} older=${older.length} forced=${forced} uniq=${seen.size}${crossed ? " ✅CROSS-0629" : older.length === 0 ? " (stall→forced)" : ""}`,
            );
        }
        if (crossed) {
            console.log(`→ ✅ 0629 진입! forced ${forced}회. 0630 최저도달 ${minReached}. B 가능.`);
            return;
        }
        if (older.length > 0) {
            let min = older[0];
            for (const it of older) if (KEY(it) < KEY(min)) min = it;
            anchor = { date: min.data_dt, time: min.data_tm };
        } else {
            forced++;
            anchor = stepBack(anchor.date, anchor.time, 600); // 10분 강제 하강
            if (anchor.date < startDate) {
                console.log(`→ forced step 으로 ${startDate} 바닥 통과(전날 진입). uniq=${seen.size}, forced=${forced}`);
                return;
            }
        }
    }
    console.log(`→ 200p 종료. 0630 최저 ${minReached}, forced=${forced}, uniq=${seen.size} (0629 크로스 실패 시 깊이 한계).`);
}

// 인포스탁(코드 7) 특징주 보관 — 깊이별 소스 분포 집계. 1년 넘어가면 인포스탁이 빠지나.
async function runSources(k: ReturnType<typeof makeKis>) {
    const NAMES: Record<string, string> = {
        "2": "한경", "4": "이데일리", "5": "머니투데이", "6": "연합", "7": "인포스탁", "8": "아경",
        "9": "뉴스핌", A: "매경", B: "헤럴드", C: "파이낸셜", U: "서울경제", V: "조선i", O: "edailyFX",
        F: "장내공시", G: "코스닥공시",
    };
    console.log(`\n=== 깊이별 소스 분포 (인포스탁=특징주 보관 확인) ===`);
    for (const dd of [3, 30, 90, 180, 270, 365, 400, 545, 730]) {
        const date = ymd(dd);
        let anchor = { date, time: "235959" };
        const tally: Record<string, number> = {};
        let total = 0, info = 0, infoTagged = 0;
        for (let p = 0; p < 4; p++) {
            const res = await k.rest.getNewsTitles({ date: `00${anchor.date}`, time: `0000${anchor.time}` });
            const list = (res.data.output ?? []) as Item[];
            const aKey = anchor.date + anchor.time;
            const inWin = list.filter((it) => KEY(it) <= aKey);
            for (const it of inWin) {
                total++;
                const sc = it.news_ofer_entp_code ?? "?";
                tally[sc] = (tally[sc] ?? 0) + 1;
                if (sc === "7") {
                    info++;
                    if ((it.iscd1 ?? "").trim()) infoTagged++;
                }
            }
            const older = inWin.filter((it) => KEY(it) < aKey);
            if (older.length === 0) break;
            let min = older[0];
            for (const it of older) if (KEY(it) < KEY(min)) min = it;
            anchor = { date: min.data_dt, time: min.data_tm };
        }
        const top = Object.entries(tally)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([c, n]) => `${NAMES[c] ?? c}:${n}`)
            .join(" ");
        console.log(`${date}(${String(dd).padStart(3)}d전): total=${total} 인포스탁=${info}(태그${infoTagged}) | ${top}`);
    }
}

// 장중(11:30) 앵커로 인포스탁(7) 특징주가 깊이별로 잡히나 — 언론기사 ~1년 보관 경계 확정.
async function runInfoDaytime(k: ReturnType<typeof makeKis>) {
    console.log(`\n=== 장중(11:30 앵커) 인포스탁/언론 vs 공시 (깊이별) ===`);
    const DISCLOSURE = new Set(["F", "G", "H", "I", "N"]); // 공시류
    for (const dd of [30, 180, 330, 360, 380, 400, 450]) {
        const date = ymd(dd);
        let anchor = { date, time: "113000" };
        let total = 0, info = 0, media = 0, disc = 0;
        for (let p = 0; p < 5; p++) {
            const res = await k.rest.getNewsTitles({ date: `00${anchor.date}`, time: `0000${anchor.time}` });
            const list = (res.data.output ?? []) as Item[];
            const aKey = anchor.date + anchor.time;
            const inWin = list.filter((it) => KEY(it) <= aKey);
            for (const it of inWin) {
                total++;
                const sc = it.news_ofer_entp_code ?? "?";
                if (sc === "7") info++;
                if (DISCLOSURE.has(sc)) disc++;
                else media++;
            }
            const older = inWin.filter((it) => KEY(it) < aKey);
            if (older.length === 0) break;
            let min = older[0];
            for (const it of older) if (KEY(it) < KEY(min)) min = it;
            anchor = { date: min.data_dt, time: min.data_tm };
        }
        console.log(`${date}(${String(dd).padStart(3)}d전): total=${total} 인포스탁=${info} 언론=${media} 공시=${disc}`);
    }
}

async function main() {
    const mode = argv(2, "format");
    const k = makeKis();
    if (mode === "walk") return void (await runWalk(k));
    if (mode === "walk2") return void (await runWalk2(k));
    if (mode === "bproto") return void (await runBProto(k));
    if (mode === "sources") return void (await runSources(k));
    if (mode === "info") return void (await runInfoDaytime(k));
    if (mode === "fresh") return void (await runFresh(k));
    if (mode === "sweep") await runSweep(k);
    else if (mode === "deep") await runDeep(k);
    else if (mode === "paginate") await runPaginate(k);
    else if (mode === "cross") await runCross(k);
    else await runFormat(k);
}

main().catch(handleError);
