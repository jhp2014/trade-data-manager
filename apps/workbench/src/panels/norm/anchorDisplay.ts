// 정규화 패널의 **앵커 표기 레지스트리 + 순수 계산** — 어느 param 이 무엇을 얻는가(2026-08-24 확정).
//
// ## 표기는 param 별 명시다 — 도메인 성질(needsPrice)에서 파생하지 않는다(사용자 확정)
// needsPrice 는 **저장 검증**의 관심사(field·market 을 받느냐)지 표기의 관심사가 아니다. 지금은 우연히
// 일치하지만, "가격은 있는데 가로선은 긋기 싫은" param(목표가·체결 표식류)이 하나만 생겨도 깨진다.
// 그래서 param 하나 = 표기 한 줄이고, 레지스트리에 없는 param 은 **안 그린다** — 그 침묵이 사고가 되지
// 않도록 ANCHOR_PARAMS 전수가 여기 있는지 테스트가 잰다(누락 = 새 param 등록 시 표기도 정하라는 강제).
//
// ## 화면 어휘(왜 세 자리인가)
//   · **좌측 이름 칸(TAG_W, 상시)** = 종류 태그. 승자 = 채운 칩, 나머지 = 점 + 글자.
//     패널과 앵커의 grain 이 다르면 `일`/`분` 접두 — 표식은 grain 일치만 받으므로(아래) 이 접두가
//     "가로선은 있는데 표식은 없는" 조합의 설명이 된다.
//   · **그림 안 우단** = 값 칩(선분 글리프 + 값). 눈금과 같은 쪽이라 둘이 나란히 읽힌다.
//     태그와 값 칩은 **같은 벌리기**(layoutReadoutRows)를 타 언제나 같은 높이 — 사이를 가로선이 잇고,
//     밀리면 둘이 같이 밀리고 꼬리(점선)만 제 선으로 남는다.
//   · **그림 안 최상단** = 표식 칩 + 봉당 드롭선 하나. 밴드/레인을 안 떼는 이유: 그림 높이가
//     데이터에 따라 출렁이면 안 된다(거터 폭을 토글이 정하는 그 규칙). 겹침은 세로·가로 모두
//     계단식 쌓기 하나로 답한다(stackMarkRows).
//
// ## 드롭선은 "값을 가리킬 때만"이 아니라 **언제나** 긋는다(사용자 확정 — 봉 지목도 선이 진다)
// 다만 끝이 다르다: 봉의 고가에서 한 뼘 떨어져 끊긴다(원점 점선이 저가 아래서 시작하는 규칙의 거울).
import { BASELINE_PARAM, IGNORE_CANDLE_PARAM, anchorCoordKey, anchorParamByKey, type AnchorField, type ChartAnchor } from "@trade-data-manager/market/domain";
import { minutesOfDay } from "../../lib/date.js";

/** 좌측 종류 태그 칸의 폭(px) — 그림 상자 왼쪽 바깥, 상시(토글 없음). `전일 KRX` 가 드는 최소치. */
export const TAG_W = 44;

/** 표식 칩 한 장의 폭/높이/줄 간격(px) — 계단식 쌓기(stackMarkRows)와 그리기가 같은 값을 봐야 한다. */
export const MARK_W = 28;
export const MARK_H = 13;
export const MARK_ROW_H = 15;

/** 드롭선이 봉 고가에서 떨어지는 간격(px) — 원점 점선의 LOW_GAP(저가 아래 8px)과 거울 대칭. */
export const HIGH_GAP = 8;

/** param 하나의 표기 — 레지스트리에 없는 param 은 이 패널에 안 뜬다. */
export interface AnchorDisplayDef {
    /** 태그·표식 칩에 적는 짧은 이름(2자) — AnchorParamDef.name 은 칩 26px 에 안 든다. */
    short: string;
    /** 가로 수준선 + 값 칩 + 좌측 태그를 받나. */
    line: boolean;
    /** 상단 표식 칩 + 드롭선을 받나(패널과 grain 이 같은 앵커만). */
    mark: boolean;
}

/**
 * param → 표기. **여기 한 줄이 곧 화면 등장**이다 — 도메인 레지스트리(저장 규칙)와 별개로,
 * 화면(정규화 패널)이 그 param 을 어떻게 보여줄지는 화면 쪽이 정한다(차트 패널은 제 방식이 따로 있다).
 */
export const ANCHOR_DISPLAY: Readonly<Record<string, AnchorDisplayDef>> = {
    [BASELINE_PARAM]: { short: "기준", line: true, mark: true },
    [IGNORE_CANDLE_PARAM]: { short: "무시", line: false, mark: true },
};

export const displayOf = (param: string): AnchorDisplayDef | undefined => ANCHOR_DISPLAY[param];

// ── 상단 표식 ───────────────────────────────────────────────────────────────

/** 표식 하나 — 봉의 x(벽시계 t)까지만 안다. 화면 x(t − baseT)는 주인 선이 정한다. */
export interface NormMark {
    /** 좌표 정체(anchorCoordKey + param) — React key 와 dedupe 의 재료. */
    key: string;
    param: string;
    /** 칩 글자 — 기준선 후보는 "후보"로 갈린다(승자만 "기준"). */
    short: string;
    /** 채운 칩인가 — 승자·단일 param 은 채우고, 기준선 후보만 비운다. */
    solid: boolean;
    /**
     * 벽시계 t — 일봉: 번들 daily 인덱스 / 분봉: minutesOfDay. 선·캔들이 x 를 만들 때 쓴 바로 그 단위라
     * `t − line.baseT` 가 곧 뷰 x 다(같은 자여야 표식이 제 봉 위에 선다).
     */
    t: number;
    /** 툴팁 — 종류·좌표·(가격 앵커면) 시장·필드. 칩엔 short 만 적는다. */
    tip: string;
}

const FIELD_LABEL: Record<AnchorField, string> = { high: "고가", low: "저가", open: "시가", close: "종가" };

/**
 * 이 차트의 앵커들 → 표식 목록. **패널과 grain 이 같은 것만** — 일봉 앵커는 일봉 패널에, 분봉 앵커는
 * 분봉 패널에(사용자 확정). grain 은 anchorTime 유무가 말한다(도메인 규칙 그대로).
 *
 * `dailyIndexOf` 가 −1 이면(번들 창 밖 — 2년 초과) 그 표식은 결손으로 버린다 — x 를 지어내지 않는다.
 * `winnerCoord` 는 기준선 승자(가격 최저)의 좌표 — 승자만 채운 칩 "기준", 나머지는 빈 칩 "후보".
 */
export function buildMarks(
    anchors: readonly ChartAnchor[],
    opts: {
        minutePanel: boolean;
        dailyIndexOf: (date: string) => number;
        winnerCoord: string | null;
    },
): NormMark[] {
    const out: NormMark[] = [];
    for (const a of anchors) {
        const d = displayOf(a.param);
        if (!d?.mark) continue;
        const isMinute = a.anchorTime != null;
        if (isMinute !== opts.minutePanel) continue;
        const t = isMinute ? minutesOfDay(a.anchorTime!) : opts.dailyIndexOf(a.anchorDate);
        if (t < 0) continue; // 앵커 캔들이 번들 창 밖 — 결손은 결손
        const isBaseline = a.param === BASELINE_PARAM;
        const solid = !isBaseline || anchorCoordKey(a) === opts.winnerCoord;
        const name = anchorParamByKey.get(a.param)?.name ?? a.param;
        const when = `${a.anchorDate}${a.anchorTime ? ` ${a.anchorTime.slice(0, 5)}` : ""}`;
        const what = a.field && a.market ? ` · ${a.market.toUpperCase()} ${FIELD_LABEL[a.field]}` : "";
        out.push({
            key: `${a.param}@${anchorCoordKey(a)}`,
            param: a.param,
            short: isBaseline && !solid ? "후보" : d.short,
            solid,
            t,
            tip: `${isBaseline && !solid ? "기준선 후보" : name} · ${when}${what}`,
        });
    }
    return out;
}

/**
 * 표식 칩의 계단식 쌓기 — 같은 봉(같은 x)이든 이웃 봉이든 **한 규칙**: 가로로 부딪히면 한 줄 아래로.
 * 탐욕 배치(x 오름차순, 자리가 나는 첫 줄)라 표식이 드문 평시엔 전부 0줄이고, 뭉친 자리만 계단이 선다.
 * 뭉침을 +N 으로 접지 않는 이유: 접으면 **어느 봉인지**가 사라진다 — 표식의 본론이 x 다.
 */
export function stackMarkRows<T>(
    items: readonly { item: T; x: number }[],
    chipW = MARK_W,
    gap = 2,
): { item: T; x: number; row: number }[] {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const lastRight: number[] = []; // 줄별로 마지막 칩의 오른끝
    return sorted.map(({ item, x }) => {
        let row = lastRight.findIndex((r) => x - chipW / 2 > r + gap);
        if (row < 0) row = lastRight.length;
        lastRight[row] = x + chipW / 2;
        return { item, x, row };
    });
}
