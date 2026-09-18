// 표식 글리프 **단일 출처** — 차트와 목록이 같은 기호·같은 크기를 쓴다(decisions 「집합」 표식 어휘).
//
// ## 셋은 슬롯 조합으로 말한다 — 합성 기호(◈)를 만들지 않는다
// 윗줄 ◇(후보) · 아랫줄 ◆(라벨). "둘 다"는 외울 기호가 아니라 **둘이 보이는 것**이다.
//
// ## 두 마름모는 **완전히 동일**하다(6.5px · 선 1.1)
// 채운 쪽이 커 보이는 착시를 **크기로 보정하지 않는다** — 보정하면 나중에 "왜 0.5px 다르지"만 남는다.
// hover 확대도 양쪽 같은 배율이다(◇ 만 커지면 같은 좌표의 둘이 따로 논다).
//
// ## ▼ 는 마름모보다 **더 작다**(7×6)
// "지금 여기"는 색(검정)과 파란 세로선 두 채널을 이미 들고 있어 크기까지 쓸 필요가 없다.
import type { CSSProperties } from "react";
import { AUTO_POINT, MARKER_NOW } from "../styles/palette.js";

/** 마름모 한 변(대각) px — 두 종류가 같은 값을 쓴다. */
export const MARK_SIZE = 6.5;
/** 두 줄 간격(윗줄 중심 → 아랫줄 중심). */
export const MARK_ROW_GAP = 9;
/** 표식 층이 먹는 상단 높이 — 옛 24 에서 줄었다(캔들이 그만큼 커진다). */
export const MARK_BAND_H = 18;
/** 클릭 표적 폭 — **그림이 작아져도 손은 안 작아진다**(줄이지 말 것). */
export const MARK_HIT_W = 18;

const STROKE = 1.1;

const diamondPoints = (s: number): string => {
    const h = s / 2;
    const c = h + 1; // 1px 여백 — 획이 뷰박스에 안 잘리게
    return `${c},${c - h} ${c + h},${c} ${c},${c + h} ${c - h},${c}`;
};

/**
 * 마름모 — `filled` 로 뜻이 갈린다(속 빈 = 후보 ◇ · 채움 = 라벨 ◆).
 * `now` 는 "지금 시각이 이 좌표 위"(검정), `active` 는 hover(확대) — **다른 채널**에 싣는다.
 */
export function MarkDiamond({ filled, color, active = false, now = false }: {
    filled: boolean;
    /** 라벨이면 그룹색, 후보면 기본 청록. now 면 무시된다. */
    color?: string;
    active?: boolean;
    now?: boolean;
}): JSX.Element {
    const box = MARK_SIZE + 2;
    const stroke = now ? MARKER_NOW : filled ? "var(--bg-primary, #ffffff)" : (color ?? AUTO_POINT);
    const fill = now ? MARKER_NOW : filled ? (color ?? AUTO_POINT) : "var(--bg-primary, #ffffff)";
    return (
        <svg
            width={box}
            height={box}
            viewBox={`0 0 ${box} ${box}`}
            style={{
                display: "block",
                overflow: "visible",
                pointerEvents: "none",
                filter: active ? "drop-shadow(0 2px 2.5px rgba(0,0,0,0.5))" : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.3))",
                transform: active ? "scale(1.3)" : "none",
                transformOrigin: "50% 50%",
                transition: "transform 0.1s ease",
            }}
        >
            <polygon points={diamondPoints(MARK_SIZE)} fill={fill} stroke={stroke} strokeWidth={STROKE} />
        </svg>
    );
}

/** 시간선 ▼ — 색은 언제나 MARKER_NOW(호출부 하나). 마름모보다 작다. */
export function MarkTriangle(): JSX.Element {
    return (
        <svg width={7} height={6} viewBox="0 0 7 6" style={{ display: "block", overflow: "visible", pointerEvents: "none", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))" }}>
            <polygon points="0.5,0.5 6.5,0.5 3.5,5.5" fill={MARKER_NOW} stroke={MARKER_NOW} strokeWidth={1} />
        </svg>
    );
}

/** 표식 한 칸의 자리 — 차트는 x 절대배치, 목록은 인라인. 크기 계약만 공유한다. */
export const markSeat = (x: number, row: 0 | 1, zIndex: number): CSSProperties => ({
    position: "absolute",
    left: x - MARK_HIT_W / 2,
    top: row === 0 ? 0 : MARK_ROW_GAP,
    width: MARK_HIT_W,
    height: MARK_SIZE + 3,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    zIndex,
});
