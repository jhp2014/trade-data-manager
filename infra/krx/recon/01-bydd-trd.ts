// 정찰 1: 일별매매정보 {stk|ksq|knx}_bydd_trd — 기준일 하루의 전종목 매매정보 실측.
//
// 배경: 시총 백필이 KIS 예탁원 이벤트로 주식수를 역산하는데, 재상장류(액면분할·병합·감자)에서
//   issue_stk_qty 가 delta 가 아니라 "재상장 전량"이라 과거 주식수가 0/음수로 무너진다
//   (실측: 855,873행 중 60,518행이 0 이하, 310종목). tot_issue_stk_qty 는 모든 행 동일한
//   현재 스냅샷이라 복원 수단이 없다 → 이 API 의 LIST_SHRS 가 그 값을 직접 준다는 게 가설.
//
// 닫을 미지수:
//   ⓐ 인증 — 헤더 AUTH_KEY 로 실제 통과하는지(스펙 docx 엔 인증 언급이 없다).
//   ⓑ 요청 형식 — GET 쿼리 basDd 하나로 되는지(docx request Sample 은 JSON 처럼 적혀 있다).
//   ⓒ ISU_CD 포맷 — 단축 6자리인지 ISIN 12자리인지(우리 stock_code 는 6자리).
//   ⓓ 값 서식 — 콤마·공백 패딩·부호 유무. 그리고 MKTCAP == TDD_CLSPRC × LIST_SHRS 인지 자체검산.
//   ⓔ 휴장일 응답 — 빈 배열인지 에러인지.
//   ⓕ 유니버스 구성 — MKT_NM 분포, 리츠·스팩·우선주가 섞이는지(샘플 첫 행이 NH프라임리츠였다).
//   ⓖ **거래정지 종목 행이 오는가** — 오염 종목 대부분이 정지 상태였다. 거래량 0 행에도
//      LIST_SHRS 가 실리는지가 이 안의 성패를 가른다.
//   ⓗ SECT_TP_NM(소속부) 값 분포 — 관리종목 등 식별에 쓸 수 있는지(우리한텐 그런 표식이 없다).
//   ⓘ 당일 데이터 반영 시각 — 야간 수집(20:30) 시점에 당일치가 올라와 있으면 소스를 하나로 줄일 수 있다.
//
// 사용: pnpm --filter @trade-data-manager/krx recon:bydd [stk|ksq|knx] [YYYYMMDD] [종목코드,콤마]
//   예) recon:bydd stk 20260626 012160,014990        (액면병합·무상감자 직전일 — 우리가 0 을 쓴 날)
//       recon:bydd ksq 20260626 042040,043220
//       recon:bydd stk 20260830 ""                    (일요일 — 휴장일 응답 ⓔ)
//       recon:bydd stk 20260902 ""                    (오늘 — 반영 시각 ⓘ)
import { makeKrx, saveExploration, argv, handleError } from "./_shared.js";
import type { KrxByddTrdRow, KrxMarket } from "../src/index.js";

/** 수치 문자열 → BigInt. 콤마·공백·빈값 방어(서식이 ⓓ 미지수라 관대하게 받는다). */
const big = (s: string | undefined): bigint | null => {
    const t = String(s ?? "").trim().replace(/,/g, "");
    if (t === "" || t === "-" || !/^-?\d+$/.test(t)) return null;
    return BigInt(t);
};

/** 값 분포 세기 — 상위 n 개만. */
function dist(rows: KrxByddTrdRow[], pick: (r: KrxByddTrdRow) => string, n = 12): [string, number][] {
    const m = new Map<string, number>();
    for (const r of rows) {
        const k = pick(r);
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
    const market = argv(2, "stk") as KrxMarket;
    const basDd = argv(3, "20260626");
    const codes = argv(4, "012160,014990")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

    const krx = makeKrx();
    const res = await krx.rest.getByddTrd(market, basDd);

    const topKeys = Object.keys(res.data as Record<string, unknown>);
    const rows: KrxByddTrdRow[] = res.data.OutBlock_1 ?? [];

    // ⓐⓑ 인증·요청형식 — 여기까지 왔으면 200 + 객체. OutBlock_1 이 없으면 본문째 남긴다.
    if (rows.length === 0) {
        saveExploration({
            apiId: `${market}_bydd_trd`,
            label: `empty-${basDd}`,
            request: { market, basDd },
            response: { status: res.status, topKeys, rowCount: 0, body: res.data },
            headers: res.headers,
            raw: res.data,
        });
        console.log("\n행 0건 — 휴장일(ⓔ)이거나 인증/파라미터 문제(ⓐⓑ). 위 body 를 볼 것.");
        return;
    }

    // ⓒ 종목코드 포맷
    const codeLen = dist(rows, (r) => `len=${String(r.ISU_CD ?? "").trim().length}`);

    // ⓓ 값 서식 + 자체검산(MKTCAP == 종가 × 상장주식수)
    const hasComma = rows.filter((r) => /,/.test(`${r.MKTCAP}${r.LIST_SHRS}${r.TDD_CLSPRC}`)).length;
    const hasPad = rows.filter((r) => `${r.MKTCAP}` !== `${r.MKTCAP}`.trim()).length;
    const mismatches: { code: string; name: string; mktcap: string; calc: string }[] = [];
    let checked = 0;
    for (const r of rows) {
        const cap = big(r.MKTCAP);
        const prc = big(r.TDD_CLSPRC);
        const shr = big(r.LIST_SHRS);
        if (cap === null || prc === null || shr === null) continue;
        checked++;
        if (cap !== prc * shr) {
            if (mismatches.length < 5)
                mismatches.push({
                    code: r.ISU_CD,
                    name: r.ISU_NM,
                    mktcap: r.MKTCAP,
                    calc: (prc * shr).toString(),
                });
        }
    }

    // ⓕ 유니버스 · ⓗ 소속부
    const mktDist = dist(rows, (r) => r.MKT_NM ?? "");
    const sectDist = dist(rows, (r) => (String(r.SECT_TP_NM ?? "").trim() || "(빈값)"));

    // ⓖ 거래정지 후보(거래량 0) 에도 상장주식수가 실리는가 — 이 안의 성패
    const zeroVol = rows.filter((r) => big(r.ACC_TRDVOL) === 0n);
    const zeroVolWithShares = zeroVol.filter((r) => (big(r.LIST_SHRS) ?? 0n) > 0n);
    const missingShares = rows.filter((r) => (big(r.LIST_SHRS) ?? 0n) <= 0n);

    // 대조용 — 지정 종목 행 전체(우리 DB 와의 대조는 이 출력을 밖에서 psql 과 맞춘다)
    const picked = codes.map((c) => rows.find((r) => String(r.ISU_CD).trim() === c) ?? { ISU_CD: c, NOT_FOUND: true });

    saveExploration({
        apiId: `${market}_bydd_trd`,
        label: `${basDd}`,
        request: { market, basDd, codes },
        response: {
            status: res.status,
            topKeys,
            rowCount: rows.length,
            firstRow: rows[0],
            codeLenDist: codeLen,
            format: { hasComma, hasPad, checked, mismatchCount: mismatches.length, mismatches },
            marketDist: mktDist,
            sectorDist: sectDist,
            halted: {
                zeroVolume: zeroVol.length,
                zeroVolumeWithShares: zeroVolWithShares.length,
                sample: zeroVol.slice(0, 3),
            },
            missingShares: { count: missingShares.length, sample: missingShares.slice(0, 3) },
            picked,
        },
        headers: res.headers,
        raw: res.data,
    });

    console.log("\n요약");
    console.log(`  행 ${rows.length} / 코드길이 ${JSON.stringify(codeLen)}`);
    console.log(`  MKTCAP 검산 ${checked}건 중 불일치 ${mismatches.length}`);
    console.log(`  거래량 0 ${zeroVol.length}건 중 상장주식수 있음 ${zeroVolWithShares.length}`);
    console.log(`  상장주식수 결측 ${missingShares.length}`);
}

main().catch(handleError);
