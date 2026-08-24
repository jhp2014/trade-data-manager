// 얹는 선(기준선·후보·전일 종가선) 층 — 정규화 선과 **같은 pct 환산**으로 가격 수준선을 얹는다.
//
// **주인이 스타일을 정한다**(사용자 확정): 색은 그 선과 똑같이(visualOf 결과를 owner 로 받는다) —
// 그룹 목록을 훑을 때 선은 무리 색인데 가로선만 앰버로 뜨면 "이게 어느 항목의 선이냐"를 다시
// 찾아야 했다(사용자 지적). 선이 이미 색으로 정해져 있으니 가로선은 그 색을 따라가면 그만이다.
//
// ## 한 가로선의 두 끝이 각자 한 가지만 진다(2026-08-24 확정 — 옛 왼쪽 한 줄 라벨의 후임)
//   · **좌측 태그 칸(TAG_W, 그림 밖)** = 무슨 선인가. 승자 = 채운 칩 `기준`, 나머지 = 점 + 글자
//     (`후보`·`전일 UN`). 패널과 앵커의 grain 이 다르면 `일`/`분` 접두.
//   · **값 칩(그림 안 우단)** = 얼마인가. 선분 글리프(그 선의 굵기·점선 흉내) + 값 —
//     분봉은 `정규화%p (전일比%)` 두 값, 일봉은 baseRate=0 이라 저절로 하나다.
// 태그와 값 칩은 **같은 벌리기**(layoutReadoutRows)를 타 언제나 같은 높이에 서고, 그 사이를 가로선이
// 잇는다 — 밀리면 둘이 같이 밀리고 값 칩에서 꼬리(점선)만 제 선으로 남는다. 창 밖 값은 가장자리로
// 당겨 ▲▼(거터·판독과 같은 문법). 옛 "전일 종가선만 가장자리 라벨" 특례는 이 일반 규칙에 흡수됐다.
//
// **기준선·후보는 실선** — 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
// **전일 종가선(0%)만 점선**이다 — 가격이 아니라 기준(시장이 준 원점)이라 종류가 다르다.
// 값 표기도 특례가 없다: 전일 종가선의 `y + baseRate` 는 정확히 0 이라 `−26.0% (+0.0%)` 가
// 규칙 그대로 "이 선이 진짜 0%"를 말한다(옛 `0% (KRX)` 하드코딩의 후임).
import type { CSSProperties } from "react";
import { pct, type NormLine } from "./overlay.js";
import { TAG_W } from "./anchorDisplay.js";
import { layoutReadoutRows } from "../canvas/readout.js";
import { fmtPct } from "../../lib/format.js";
import { clamp, median } from "../../lib/num.js";

/**
 * 수준선 하나 — 가격(원)과 종류. 기준선 후보는 앵커 복제본을 번들 캔들로 해소한 것,
 * `zero` 는 그 시장의 전일 종가(분봉 %p 공간에서 사라진 "진짜 0%")다.
 */
export interface NormLevel {
    price: number;
    baseline: boolean;
    /** 전일 종가선이면 그 시장 — 태그가 `전일 KRX` 로 서고 점선으로 그려진다. */
    zero?: "krx" | "un";
    /** 앵커 grain(분봉이면 true) — 패널 grain 과 다르면 태그에 `일`/`분` 접두. zero 는 없음. */
    minute?: boolean;
}

/** 수준선을 받을 선 하나 — 색은 부모(선택·호버 규칙의 주인)가 정해 내려보낸다. */
export interface LevelOwner {
    s: NormLine;
    color: string;
}

/** 후보선 태그의 상한 — 기준선·전일 종가선은 상한 밖(keep), 후보만 예산을 쓴다. 넘치면 +N 뱃지. */
const CAND_CAP = 6;
/** 태그·값 칩의 최소 세로 간격(px). */
const ROW_GAP = 15;
/** 칩·가로선의 세로 클램프 여백(px). */
const EDGE_PAD = 8;

interface Box { left: number; top: number; width: number; height: number }

/** 자리를 잡은 수준선 한 줄 — 가로선(y)과 칩·태그(labelY)가 이 하나에서 나온다. */
export interface LevelRow {
    key: string;
    color: string;
    /** 선의 진짜 화면 y — 클립이 자른다(칩은 labelY 로 당겨진다). */
    y: number;
    /** 칩·태그가 서는 y(클램프 + 벌린 뒤). */
    labelY: number;
    /** 진짜 값이 상자 밖이라 당겨졌나 — 값 칩에 ▲▼ 로 남는다. */
    off: "up" | "down" | null;
    /** 좌측 태그 글자(grain 접두 포함). */
    tag: string;
    /** 채운 태그인가 — 승자(기준선)만. */
    winner: boolean;
    /** 값 칩 글자(▲▼ 제외 — 그리는 쪽이 off 로 붙인다). */
    value: string;
    stroke: { width: number; dash?: string; opacity: number };
    /** 툴팁 — 태그·값·주인을 한 줄로. */
    tip: string;
}

export interface LevelRowsView {
    rows: LevelRow[];
    /** 상한에 밀려 태그·값을 못 단 후보 수 — 좌측 칸의 +N 뱃지. 선 자체는 그린다(rows 에 없다). */
    hidden: { y: number; color: string; stroke: LevelRow["stroke"] }[];
}

const strokeOf = (lv: NormLevel): LevelRow["stroke"] =>
    lv.zero !== undefined ? { width: 1.4, dash: "5 3", opacity: 0.85 }
        : lv.baseline ? { width: 2.6, opacity: 0.95 }
            : { width: 1.2, opacity: 0.8 };

/**
 * 주인들의 수준선 → 자리 잡은 줄. 벌리기는 **주인을 가로질러 한 목록**이다 — 두 주인의 선이 값이
 * 비슷하면 서로를 모르고 겹치기 때문(거터가 항목·테마를 한 목록에서 벌리는 그 이유).
 */
export function buildLevelRows(
    owners: readonly LevelOwner[],
    levelsOf: (chartKey: string) => readonly NormLevel[],
    scaleY: (v: number) => number,
    box: Box,
    minutePanel: boolean,
    nameOf: (code: string) => string,
): LevelRowsView {
    interface Cand { key: string; color: string; y: number; tag: string; winner: boolean; value: string; stroke: LevelRow["stroke"]; tip: string; keep: boolean }
    const cands: Cand[] = [];
    const hidden: LevelRowsView["hidden"] = [];
    for (const { s, color } of owners) {
        let budget = CAND_CAP;
        levelsOf(s.chartKey).forEach((lv, i) => {
            // 가격 → y 는 언제나 pct(price, basePrice) − baseRate — 선과 같은 환산이어야 한 공간이다.
            const yPct = pct(lv.price, s.basePrice) - s.baseRate;
            const y = scaleY(yPct);
            const stroke = strokeOf(lv);
            const keep = lv.baseline || lv.zero !== undefined;
            if (!keep && budget <= 0) { hidden.push({ y, color, stroke }); return; }
            if (!keep) budget -= 1;
            const prefix = lv.minute !== undefined && lv.minute !== minutePanel ? (lv.minute ? "분 " : "일 ") : "";
            const tag = lv.zero !== undefined ? `전일 ${lv.zero.toUpperCase()}` : `${prefix}${lv.baseline ? "기준" : "후보"}`;
            const value = `${fmtPct(yPct)}${s.baseRate !== 0 ? ` (${fmtPct(yPct + s.baseRate)})` : ""}`;
            cands.push({
                key: `${s.key}-${i}`, color, y, tag, winner: lv.baseline, value, stroke, keep,
                tip: `${nameOf(s.stockCode)} ${tag} ${value}`,
            });
        });
    }
    const rows = layoutReadoutRows(
        cands.map((c) => ({ item: c, y: c.y })),
        { min: box.top + EDGE_PAD, max: box.top + box.height - EDGE_PAD },
        ROW_GAP,
    ).map((r) => ({ ...r.item, labelY: r.labelY, off: r.off }));
    return { rows, hidden };
}

// ── 그리기 ──────────────────────────────────────────────────────────────────

/** 값 칩 안 선분 글리프의 길이(px). */
const GLYPH_W = 9;

/** 값 칩 폭 — 숫자·기호(tabular 9px)의 근사 폭. 재보다 넉넉히 — 모자라면 값이 잘린다. */
const chipW = (text: string): number => 4 + GLYPH_W + 4 + text.length * 5.2 + 5;

/**
 * 가로선 + 값 칩(그림 안 우단) — **클립 안**이다(팬하면 선이 상자에서 잘려야 한다).
 * 좌측 태그는 상자 밖이라 클립하면 사라진다 — LevelTags 가 따로 그린다(자리는 같은 rows).
 */
export function LevelsLayer({ view, box, clipId }: {
    view: LevelRowsView;
    box: Box;
    clipId: string;
}): JSX.Element {
    const right = box.left + box.width - 3;
    return (
        <g data-layer="levels" clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
            {/* 상한에 밀린 후보 — 선은 그린다(익명이지만 존재는 보인다. 정체는 +N 뱃지 → 호버 툴팁). */}
            {view.hidden.map((h, i) => (
                <line key={`lvh-${i}`} x1={box.left} x2={box.left + box.width} y1={h.y} y2={h.y}
                    stroke={h.color} strokeWidth={h.stroke.width} strokeDasharray={h.stroke.dash} opacity={h.stroke.opacity * 0.6} />
            ))}
            {view.rows.map((r) => {
                const w = chipW(r.value);
                const x = right - w;
                const text = `${r.off === "up" ? "▲" : r.off === "down" ? "▼" : ""}${r.value}`;
                return (
                    <g key={`lvl-${r.key}`}>
                        <line x1={box.left} x2={box.left + box.width} y1={r.y} y2={r.y}
                            stroke={r.color} strokeWidth={r.stroke.width} strokeDasharray={r.stroke.dash} opacity={r.stroke.opacity} />
                        {/* 꼬리 — 칩이 벌리기로 제 선을 떠났을 때만(선이 창 밖이면 클램프 자리까지). */}
                        {Math.abs(r.labelY - clampY(r.y, box)) > 1 && (
                            <line x1={x - 2} y1={r.labelY} x2={x - 10} y2={clampY(r.y, box)}
                                stroke={r.color} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.6} />
                        )}
                        <g>
                            <title>{r.tip}</title>
                            <rect x={x} y={r.labelY - 6.5} width={w} height={13} rx={3}
                                fill="var(--bg-primary)" fillOpacity={0.92} stroke={r.color} strokeWidth={0.6} />
                            {/* 선분 글리프 — 그 선의 굵기·점선을 그대로 흉내낸다(칩↔선 대응의 끈). */}
                            <line x1={x + 4} x2={x + 4 + GLYPH_W} y1={r.labelY} y2={r.labelY}
                                stroke={r.color} strokeWidth={r.stroke.width} strokeDasharray={r.stroke.dash} />
                            <text x={right - 4} y={r.labelY + 3} textAnchor="end"
                                style={{ fontSize: 9, fill: r.color, fontVariantNumeric: "tabular-nums" }}>
                                {text}
                            </text>
                        </g>
                    </g>
                );
            })}
        </g>
    );
}

const clampY = (y: number, box: Box): number => clamp(y, box.top + EDGE_PAD, box.top + box.height - EDGE_PAD);

/**
 * 좌측 종류 태그 칸 — 그림 상자 **왼쪽 바깥**(TAG_W), 클립 밖. 지시선이 태그와 선의 시작점을 잇는다
 * (태그가 벌리기로 제 선 높이를 떠날 수 있어 이 선이 유일한 대응 표시다 — 거터 지시선의 그 문법).
 */
export function LevelTags({ view, box }: { view: LevelRowsView; box: Box }): JSX.Element {
    return (
        <g data-layer="level-tags">
            {view.rows.map((r) => (
                <g key={`lvt-${r.key}`} style={{ pointerEvents: "all" }}>
                    <title>{r.tip}</title>
                    <line x1={box.left - 4} y1={r.labelY} x2={box.left + 2} y2={clampY(r.y, box)}
                        stroke={r.color} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.5} />
                    <circle cx={box.left + 2} cy={clampY(r.y, box)} r={1.7} fill={r.color} />
                    {r.winner ? (
                        <>
                            <rect x={4} y={r.labelY - 6.5} width={TAG_W - 8} height={13} rx={3} fill={r.color} />
                            <text x={4 + (TAG_W - 8) / 2} y={r.labelY + 3} textAnchor="middle"
                                style={{ fontSize: 8, fill: "var(--bg-primary)", fontWeight: 700 }}>
                                {r.tag}
                            </text>
                        </>
                    ) : (
                        <>
                            <circle cx={8} cy={r.labelY} r={2.2} fill={r.color} />
                            <text x={13} y={r.labelY + 3}
                                style={{ fontSize: 8, fill: "var(--text-secondary)" }}>
                                {r.tag}
                            </text>
                        </>
                    )}
                </g>
            ))}
            {view.hidden.length > 0 && (
                <g style={{ pointerEvents: "all" }}>
                    <title>{`태그를 못 단 후보선 ${view.hidden.length}개`}</title>
                    <text x={4} y={clampY(median(view.hidden.map((h) => h.y)), box) + 3} style={badgeText}>
                        +{view.hidden.length}
                    </text>
                </g>
            )}
        </g>
    );
}

const badgeText: CSSProperties = { fontSize: 8, fill: "var(--text-tertiary)" };
