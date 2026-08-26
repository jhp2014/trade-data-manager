// 앵커 **표기 레지스트리 + 표식 계산** — 정규화 패널과 차트 패널이 함께 보는 한 곳.
//
// ## 표기는 param 별 명시다 — 도메인 성질(needsPrice)에서 파생하지 않는다(사용자 확정)
// needsPrice 는 **저장 검증**의 관심사(field·market 을 받느냐)지 표기의 관심사가 아니다. 지금은 우연히
// 일치하지만, "가격은 있는데 가로선은 긋기 싫은" param(목표가·체결 표식류)이 하나만 생겨도 깨진다.
// 그래서 param 하나 = 표기 한 줄이고, 레지스트리에 없는 param 은 **어느 화면에도 안 뜬다** — 그 침묵이
// 사고가 되지 않도록 ANCHOR_PARAMS 전수가 여기 있는지 테스트가 잰다(누락 = 새 param 등록 시 표기도 정하라).
//
// ## 두 화면이 공유하는 것과 갈리는 것
//   · **공유** = 레지스트리(어느 param 이 뜨나·무슨 글자)·grain 필터·승자/후보 판정 결과의 소비·계단식 쌓기.
//     새 param = 아래 한 줄이면 정규화와 차트에 **동시에** 뜬다(차트 컴포넌트는 안 바뀐다).
//   · **갈림** = x 환산. 차트는 lightweight-charts 의 `Time`(날짜 문자열 / unix초), 정규화는 주인 선 기준
//     상대 좌표(`t − baseT`)라 단위가 애초에 다르다. 그래서 buildMarks 는 **좌표 원본만 싣고** 환산은 호출부가 한다.
//   · `AnchorDisplayDef.line`(가로 수준선 + 값 칩 + 좌측 태그)은 **정규화만 소비한다** — 차트는 제 가로선
//     경로(resolveChartAnchorLines → usePriceLineSet)가 따로 있다. 공유되는 건 `mark` 쪽이다.
import { BASELINE_PARAM, IGNORE_CANDLE_PARAM, anchorParamByKey, chartAnchorKey, type AnchorField, type ChartAnchor } from "@trade-data-manager/market/domain";

/** 표식 칩 한 장의 폭/높이/줄 간격(px) — 계단식 쌓기(stackMarkRows)와 그리기가 같은 값을 봐야 한다. */
export const MARK_W = 28;
export const MARK_H = 13;
export const MARK_ROW_H = 15;

/** 드롭선이 봉 고가에서 떨어지는 간격(px) — 정규화 원점 점선의 LOW_GAP(저가 아래 8px)과 거울 대칭. */
export const HIGH_GAP = 8;

/** param 하나의 표기 — 레지스트리에 없는 param 은 화면에 안 뜬다. */
export interface AnchorDisplayDef {
    /** 태그·표식 칩에 적는 짧은 이름(2자) — AnchorParamDef.name 은 칩 26px 에 안 든다. */
    short: string;
    /** 가로 수준선 + 값 칩 + 좌측 태그를 받나(정규화 전용). */
    line: boolean;
    /** 상단 표식 칩 + 드롭선을 받나(패널과 grain 이 같은 앵커만). */
    mark: boolean;
}

/** param → 표기. **여기 한 줄이 곧 화면 등장**이다. */
export const ANCHOR_DISPLAY: Readonly<Record<string, AnchorDisplayDef>> = {
    [BASELINE_PARAM]: { short: "기준", line: true, mark: true },
    [IGNORE_CANDLE_PARAM]: { short: "무시", line: false, mark: true },
};

export const displayOf = (param: string): AnchorDisplayDef | undefined => ANCHOR_DISPLAY[param];

// ── 상단 표식 ───────────────────────────────────────────────────────────────

/**
 * 표식 하나 — **좌표 원본까지만** 안다. 화면 x 는 각 화면이 제 자로 만든다
 * (차트: `timeToCoordinate` / 정규화: `t − baseT`).
 */
export interface AnchorMark {
    /**
     * 표식의 정체 = **앵커 전체 키**(`chartAnchorKey`). 좌표만으로는 모자란다: 같은 봉에 field 만 다른
     * 기준선 둘이 정당하고(도메인이 명시적으로 허용), 좌표를 키로 쓰면 그 둘이 **같은 React key** 를 갖는다.
     */
    key: string;
    param: string;
    /** 칩 글자 — 기준선 후보는 "후보"로 갈린다(승자만 "기준"). */
    short: string;
    /** 채운 칩인가 — 승자·단일 param 은 채우고, 기준선 후보만 비운다. */
    solid: boolean;
    /** 가리키는 캔들의 거래일. */
    anchorDate: string;
    /** 있으면 분봉 앵커. 없으면 일봉 앵커 — grain 은 이 유무가 말한다(도메인 규칙 그대로). */
    anchorTime?: string;
    /** 툴팁 — 종류·좌표·(가격 앵커면) 시장·필드. 칩엔 short 만 적는다. */
    tip: string;
}

const FIELD_LABEL: Record<AnchorField, string> = { high: "고가", low: "저가", open: "시가", close: "종가" };

/**
 * 이 차트의 앵커들 → 표식 목록. **패널과 grain 이 같은 것만** — 일봉 앵커는 일봉 화면에, 분봉 앵커는
 * 분봉 화면에(사용자 확정). grain 은 anchorTime 유무가 말한다.
 *
 * `winnerKey` 는 기준선 승자(가격 최저)의 **앵커 전체 키** — 승자만 채운 칩 "기준", 나머지는 빈 칩 "후보".
 * 좌표가 아니라 전체 키인 이유: 같은 봉에 field 만 다른 기준선 둘이 있을 때 좌표로 재면 **둘 다 "기준"** 이
 * 되는데, 가로선은 하나만 하늘색이라 화면이 1 대 2 로 갈린다(실측에서 실제로 났다).
 * **판정은 여기서 하지 않는다**: 정규화는 levelsOf, 차트는 resolveChartAnchorLines 가 유일한 판정자이고
 * 이 함수는 그 결과를 받아 글자로 옮길 뿐이다(두 벌이 되면 채운 칩 ≠ 하늘색 선이 조용히 생긴다).
 *
 * 좌표가 그 화면 데이터에 없는 경우(번들 창 밖 등)는 **호출부가 버린다** — x 를 아는 쪽이 거기라서다.
 */
export function buildMarks(
    anchors: readonly ChartAnchor[],
    opts: { minutePanel: boolean; winnerKey: string | null },
): AnchorMark[] {
    const out: AnchorMark[] = [];
    for (const a of anchors) {
        const d = displayOf(a.param);
        if (!d?.mark) continue;
        const isMinute = a.anchorTime != null;
        if (isMinute !== opts.minutePanel) continue;
        const isBaseline = a.param === BASELINE_PARAM;
        const key = chartAnchorKey(a);
        const solid = !isBaseline || key === opts.winnerKey;
        const name = anchorParamByKey.get(a.param)?.name ?? a.param;
        const when = `${a.anchorDate}${a.anchorTime ? ` ${a.anchorTime.slice(0, 5)}` : ""}`;
        const what = a.field && a.market ? ` · ${a.market.toUpperCase()} ${FIELD_LABEL[a.field]}` : "";
        out.push({
            key,
            param: a.param,
            short: isBaseline && !solid ? "후보" : d.short,
            solid,
            anchorDate: a.anchorDate,
            anchorTime: a.anchorTime,
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
