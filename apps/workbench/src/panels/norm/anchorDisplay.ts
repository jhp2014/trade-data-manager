// 정규화 패널의 **앵커 표기 중 이 화면만의 몫** — 좌측 태그 칸과 x 환산.
// 레지스트리·표식 계산·계단식 쌓기·칩 상수는 두 화면(정규화·차트)이 함께 보는 `lib/anchorMarks.ts` 로 갔다.
//
// ## 화면 어휘(왜 세 자리인가)
//   · **좌측 이름 칸(TAG_W, 상시)** = 종류 태그. 승자 = 채운 칩, 나머지 = 점 + 글자.
//     패널과 앵커의 grain 이 다르면 `일`/`분` 접두 — 표식은 grain 일치만 받으므로(buildMarks) 이 접두가
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
import { minutesOfDay } from "../../lib/date.js";
import type { AnchorMark } from "../../lib/anchorMarks.js";

/** 좌측 종류 태그 칸의 폭(px) — 그림 상자 왼쪽 바깥, 상시(토글 없음). `전일 KRX` 가 드는 최소치. */
export const TAG_W = 44;

/** 이 패널의 표식 — 공용 표식에 **이 화면의 x**(벽시계 t)를 붙인 것. */
export type NormMark = AnchorMark & {
    /**
     * 벽시계 t — 일봉: 번들 daily 인덱스 / 분봉: minutesOfDay. 선·캔들이 x 를 만들 때 쓴 바로 그 단위라
     * `t − line.baseT` 가 곧 뷰 x 다(같은 자여야 표식이 제 봉 위에 선다).
     */
    t: number;
};

/**
 * 공용 표식 → 이 패널의 표식. `dailyIndexOf` 가 −1 이면(번들 창 밖 — 2년 초과) 그 표식은 **결손으로
 * 버린다** — x 를 지어내지 않는다. 차트는 같은 자리에서 `timeToCoordinate` 로 갈리므로 환산이 화면 몫이다.
 */
export function toNormMarks(
    marks: readonly AnchorMark[],
    opts: { minute: boolean; dailyIndexOf: (date: string) => number },
): NormMark[] {
    const out: NormMark[] = [];
    for (const m of marks) {
        const t = opts.minute ? minutesOfDay(m.anchorTime!) : opts.dailyIndexOf(m.anchorDate);
        if (t < 0) continue; // 앵커 캔들이 번들 창 밖 — 결손은 결손
        out.push({ ...m, t });
    }
    return out;
}
