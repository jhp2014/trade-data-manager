// 정찰 5: 지금 DB 의 분봉과 같은가 — 겹치는 날짜(2025-07-01~)에서 토스 원주가 분봉을 lab-api /minutes(읽기 전용)와 맞춘다.
// 시각 기준이 다를 수 있어(토스 문서 = 봉 끝) 어긋남 -1·0·+1분을 다 맞춰 본다. 칸별 일치 수를 내므로 거래량 정의만 달라도 시각 기준은 가려진다.
// 유령 판정(core ghostFixOf)의 전제도 함께 본다: 정규장 밖에 실제 체결이 있는 KRX 봉이 있는가 — 있다면 통합뿐인 토스로는 시각만으로 NXT 단독을 못 가른다.
// DB 분봉은 프루닝 후보만 있으니 ourBars=0 이면 그 표본은 대조 불가다. 먼저 개발 lab-api(3310)를 띄울 것.
//
// 실측(2026-11-07, 005930·247540 × 2025-07-15·2026-10-15): 어긋남 -1분에서 체결 봉 2,694개 중 2,692개가 다섯 칸 전부 일치
// (틀린 2개는 시가만, 호가 단위 하나). 토스 = 봉 끝 시각, 우리 = 봉 시작 시각 확정.
// ⚠ 환산 함정 — 종가 동시호가 봉이 표본상 2025-03-04 부터 15:31 인 종목(005930)과 계속 15:30 인 종목(003545)이 있다. 2025-02-28 까지는 전부 15:30. 수능일은 16:30·16:31.
//    일괄 -1분이면 옛 날짜 동시호가가 15:29 로 밀린다. 끝 시각 15:30·15:31 은 둘 다 우리 15:30 이다.
// 우리에게만 있는 봉 = 15:35 시간외 하나(토스는 일봉에만 반영). 2026-09 부터 우리 KRX 칸에 16:00~ 봉이 있다(원인 미확인, KRX 쪽 변화로 보임).
// 사용: pnpm --filter @trade-data-manager/toss recon:compare [코드,코드…] [YYYY-MM-DD,…] [lab-api 주소]
import { fetchDayMinutes, handleError, listArg, makeToss, minutesOf, num, saveJson, type DayBar } from "./_shared.js";

interface LabBar {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}
interface LabMinute {
    time: string;
    krx: LabBar | null;
    un: LabBar;
}

const fmt = (m: number): string =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

function matchAt(toss: DayBar[], ours: Map<string, LabMinute>, shiftMin: number) {
    const m = { shiftMin, joined: 0, open: 0, high: 0, low: 0, close: 0, volume: 0, all: 0 };
    const samples: unknown[] = [];
    for (const t of toss) {
        const key = fmt(minutesOf(t.kstTime) + shiftMin);
        const u = ours.get(key)?.un;
        if (!u) continue;
        m.joined++;
        const open = num(t.openPrice) === num(u.open);
        const high = num(t.highPrice) === num(u.high);
        const low = num(t.lowPrice) === num(u.low);
        const close = num(t.closePrice) === num(u.close);
        const volume = num(t.volume) === num(u.volume);
        if (open) m.open++;
        if (high) m.high++;
        if (low) m.low++;
        if (close) m.close++;
        if (volume) m.volume++;
        if (open && high && low && close && volume) m.all++;
        else if (samples.length < 5) samples.push({ key, toss: [t.openPrice, t.highPrice, t.lowPrice, t.closePrice, t.volume], ours: u });
    }
    return { ...m, samples };
}

async function main(): Promise<void> {
    const codes = listArg(2, ["005930", "247540"]);
    const dates = listArg(3, ["2025-07-15", "2026-10-15"]);
    const base = process.argv[4] ?? "http://127.0.0.1:3310";
    const toss = makeToss();
    const rows: unknown[] = [];

    for (const code of codes) {
        for (const date of dates) {
            const res = await fetch(`${base}/minutes?code=${code}&date=${date}`);
            if (!res.ok) throw new Error(`lab-api /minutes ${res.status} (${code} ${date})`);
            const body = (await res.json()) as { minutes: LabMinute[] };
            // dense 채움 봉(무거래)은 체결이 아니다 — 양쪽 다 거래 있는 봉끼리 센다
            const ours = body.minutes.filter((m) => num(m.un.volume) > 0);
            const oursByTime = new Map(ours.map((m) => [m.time, m]));
            const { bars, duplicates } = await fetchDayMinutes(toss, code, date, false);
            const traded = bars.filter((b) => num(b.volume) > 0);

            const row = {
                code,
                date,
                tossBars: bars.length,
                tossTradedBars: traded.length,
                duplicates,
                ourBars: ours.length,
                tossRange: [traded[0]?.kstTime ?? null, traded[traded.length - 1]?.kstTime ?? null],
                ourRange: [ours[0]?.time ?? null, ours[ours.length - 1]?.time ?? null],
                matches: [-1, 0, 1].map((shift) => matchAt(traded, oursByTime, shift)),
                // krx 채움 봉(거래량 0)은 체결이 아니다 — ghostFixOf 는 채움 전 원본을 본다
                ourKrxOutsideRegular: ours
                    .filter((m) => m.krx !== null && num(m.krx.volume) > 0 && (m.time < "09:00:00" || m.time > "15:30:00"))
                    .map((m) => m.time),
            };
            rows.push(row);
            console.log(JSON.stringify(row, null, 2));
        }
    }

    console.log("\n저장:", saveJson("toss-05-compare.json", rows));
}

main().catch(handleError);
