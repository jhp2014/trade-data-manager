// 봉 우클릭 메뉴 — "이 캔들로 무엇을 할까"가 한자리에 모인다(복기 차트 전용, 실시간은 기존 토글 유지).
//
// **시장은 메뉴 전체의 토글 하나**다. 옛날엔 UN·KRX 를 두 줄로 펼쳤는데, 실제로는 한 번에 한 시장만 보고
// 지목하므로 줄만 두 배가 됐다. 토글이면 같은 자리에서 값이 바뀌어 **두 시장 값을 비교하기도 더 쉽다**
// (자리가 안 움직이니 숫자만 갈아끼워진다 — NXT 오염 캔들은 그 차이로 알아본다).
// 선택은 패널에 남는다(sticky) — 오염을 피해 KRX 로 보는 중이면 봉마다 다시 누를 이유가 없다.
//
// **props 는 관심사 그룹**(lines·ignore·dailySkeleton·minuteSkeleton)이다 — 평평한 17개였을 때 param 이
// 하나 늘 때마다 이 시그니처와 패널 배선이 같이 자랐다. 그룹이면 새 param = 그룹 하나 추가로 끝난다.
// 시고저종 버튼 줄은 세 섹션이 똑같이 쓰므로 FieldButtonRow 하나로(세 벌 복붙이던 마크업).
//
//  · 선 긋기 = 기준선 후보 추가(선=앵커 통합). 어느 선이 계산 축의 기준선이 되는지는 리졸버(가격 최저)가
//    정한다 — 차트의 하늘색 선이 그것.
//  · 골격 점 = 형태 분류의 입력. 값별 토글이고, **찍는 순서가 아니라 캔들·값이 순서를 정한다**(시→고→종은 정리).
//  · 무시 캔들 = 차트 소유 토글(일봉만). 타점 선택이 필요 없다.
//  · 선 근처 우클릭이면 그 선 삭제만 — 즉시 삭제 대신 메뉴를 거쳐 오발을 막는다.
import { ANCHOR_FIELDS, anchorParamByKey, IGNORE_CANDLE_PARAM, SKELETON_MINUTE_PARAM, SKELETON_PARAM, type AnchorField, type AnchorMarket } from "@trade-data-manager/market/domain";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { SKELETON } from "../styles/palette.js";
import type { RenderLine } from "../lib/chartFrame.js";

/** 캔들 한 시장의 OHLC(원). 로드된 번들 raw 에서 뽑는다 — KRX 는 세션 부재(NXT 단독 시간대)면 null. */
export interface MenuBar {
    open: number;
    high: number;
    low: number;
    close: number;
}

/** 이 캔들에 찍힌 골격 점 하나 — 값과 **저장된 시장**(사람이 지목한 그것)을 함께 보여주려고 쌍으로 든다. */
export interface SkeletonPivotAtCandle {
    field: AnchorField;
    market: AnchorMarket;
}

export interface CandleMenuProps {
    anchor: { x: number; y: number };
    /** 우클릭한 캔들. 선 근처 우클릭(nearLine 전용 메뉴)이면 없음. */
    candle?: { date: string; time?: string };
    bars?: { un: MenuBar | null; krx: MenuBar | null };
    /** 근처 우클릭된 선 — 삭제 항목만 노출. */
    nearLine?: RenderLine;
    /** 시장 토글(패널 영속). 분봉 캔들에선 무시되고 언제나 UN 이다(서버 규칙). */
    market: AnchorMarket;
    onMarketChange: (m: AnchorMarket) => void;
    /** 선(기준선 후보) — idAtCandle 이 있으면 "이 봉의 선 삭제"가 함께 뜬다(토글 감각 보존). */
    lines: {
        idAtCandle?: string;
        onAdd: (field: AnchorField, market: AnchorMarket) => void;
        onRemove: (id: string) => void;
    };
    /** 무시 캔들(차트 소유·일봉만) — on = 이 봉이 지정돼 있음. */
    ignore: {
        on: boolean;
        onToggle: () => void;
    };
    /** 일봉 골격(차트 소유) — pivots = 이 봉에 찍힌 값들(저장된 시장 배지 표시용). */
    dailySkeleton: {
        pivots: readonly SkeletonPivotAtCandle[];
        onToggle: (field: AnchorField, market: AnchorMarket) => void;
    };
    /** 분봉 골격(차트 소유 — 일봉 골격과 동일) — 그 날 장중 어느 봉이든 찍는다. 타점 상한은 읽기 절단의 몫. */
    minuteSkeleton: {
        pivots: readonly SkeletonPivotAtCandle[];
        onToggle: (field: AnchorField) => void;
    };
    onClose: () => void;
}

// 라벨은 UI 소유, 값 집합·순서는 도메인(ANCHOR_FIELDS) 소유 — Record 가 완전성을 강제해 필드가 늘면 컴파일이 잡는다.
const FIELD_LABEL: Record<AnchorField, string> = { high: "고", low: "저", open: "시", close: "종" };

const fmt = (v: number): string => v.toLocaleString();

/** 필드 버튼 한 칸의 표시 — 세 섹션(선·일봉 골격·분봉 골격)이 같은 줄 모양을 쓰기 위한 계약. */
interface FieldCell {
    /** 켜짐(찍혀 있음) — 테두리·글자가 SKELETON 색. */
    on?: boolean;
    disabled?: boolean;
    title: string;
    /** 값 자리 표시 override(저장된 시장 배지 등). 기본 = 현재 시장의 캔들 값. */
    text?: string;
}

/**
 * 시고저종 버튼 한 줄 — 라벨 + 필드 4버튼. 섹션마다 달랐던 건 상태(on/disabled)·타이틀뿐이라 cellOf 로 주입.
 * 스타일 문자열 세 벌 복붙이던 것 — param 이 늘면 네 벌째가 될 자리를 여기 하나로 고정한다.
 */
function FieldButtonRow({ rowLabel, rowColor, bar, cellOf, onPick }: {
    rowLabel: string;
    rowColor: string;
    bar: MenuBar | null;
    cellOf: (field: AnchorField) => FieldCell;
    onPick: (field: AnchorField) => void;
}): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px 4px" }}>
            <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: rowColor }}>{rowLabel}</span>
            {ANCHOR_FIELDS.map((field) => {
                const c = cellOf(field);
                const disabled = c.disabled ?? !bar;
                const fg = c.on ? SKELETON : disabled ? "var(--text-tertiary)" : "var(--text-primary)";
                return (
                    <button key={field} disabled={disabled} onClick={() => onPick(field)} title={c.title}
                        style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: `1px solid ${c.on ? SKELETON : "var(--border-default)"}`, borderRadius: 4, background: c.on ? `${SKELETON}22` : "transparent", color: fg, cursor: disabled ? "default" : "pointer", opacity: disabled && !c.on ? 0.6 : 1, fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                        <span style={{ color: c.on ? SKELETON : "var(--text-tertiary)" }}>{FIELD_LABEL[field]}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{c.text ?? (bar ? fmt(bar[field]) : "—")}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** 섹션 구분선 위 라벨. */
function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <MenuLabel>{children}</MenuLabel>
        </div>
    );
}

export function CandleMenu({ anchor, candle, bars, nearLine, market, onMarketChange, lines, ignore, dailySkeleton, minuteSkeleton, onClose }: CandleMenuProps): JSX.Element {
    const title = candle ? `${candle.date}${candle.time ? ` ${candle.time.slice(0, 5)}` : " 일봉"}` : "가격선";
    // 분봉 앵커는 UN 고정(서버 규칙), KRX 바가 없는 일봉도 UN 으로 되돌린다 — 없는 시장을 지목할 수는 없다.
    const eff: AnchorMarket = candle?.time || !bars?.krx ? "un" : market;
    const bar = bars?.[eff] ?? null;
    const canToggle = !candle?.time && bars?.krx != null && bars?.un != null;
    const other: AnchorMarket = eff === "un" ? "krx" : "un";
    // 분봉 골격 — 분봉 캔들이면 어디든(차트 소유·당일 장중 경로). 값이 없는 봉만 비활성.
    const minuteSkelVisible = candle?.time != null;
    const minuteSkelEnabled = minuteSkelVisible && !!bar;

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={210} padding={0} placement="beside" offset={6}>
            {/* 제목 줄 — 시장 토글이 우측 빈자리를 쓴다(아래 선·골격 줄이 이 시장을 따른다).
                별도 줄로 두면 "기준 시장" 같은 설명 라벨이 필요해지는데, 버튼이 값(UN/KRX)을 이미 말한다. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 8px 4px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                {candle && (
                    <button
                        disabled={!canToggle}
                        onClick={() => canToggle && onMarketChange(other)}
                        title={canToggle ? `${other.toUpperCase()} 값으로 전환` : candle.time ? "분봉은 UN 만(KRX 는 세션 부재가 있다)" : "이 봉엔 KRX 세션이 없습니다"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, border: "1px solid var(--border-default)", borderRadius: 4, background: "transparent", color: canToggle ? "var(--text-primary)" : "var(--text-tertiary)", cursor: canToggle ? "pointer" : "default", fontSize: 10.5, fontWeight: 700, padding: "2px 6px", lineHeight: 1.4 }}
                    >
                        {eff.toUpperCase()}
                        {canToggle && <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>⇄ {other.toUpperCase()}</span>}
                    </button>
                )}
            </div>

            {nearLine && (
                <MenuItem onClick={() => { lines.onRemove(nearLine.id); onClose(); }} style={{ color: "var(--rise)" }}>
                    이 선 삭제{nearLine.label ? ` (${nearLine.label})` : ""}
                </MenuItem>
            )}

            {candle && (
                <>
                    <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 4 }}>
                        <FieldButtonRow rowLabel="선" rowColor="var(--text-tertiary)" bar={bar}
                            cellOf={(field) => ({ title: bar ? `${eff.toUpperCase()} ${FIELD_LABEL[field]} ${fmt(bar[field])} 에 선 긋기` : "값 없음" })}
                            onPick={(field) => { lines.onAdd(field, eff); onClose(); }} />
                    </div>
                    {lines.idAtCandle && (
                        <MenuItem onClick={() => { lines.onRemove(lines.idAtCandle!); onClose(); }} style={{ color: "var(--rise)" }}>
                            이 봉의 선 삭제
                        </MenuItem>
                    )}

                    {minuteSkelVisible && (
                        <>
                            <SectionLabel>{anchorParamByKey.get(SKELETON_MINUTE_PARAM)?.name ?? "분봉 골격"}</SectionLabel>
                            <FieldButtonRow rowLabel="골격" rowColor={minuteSkelEnabled ? SKELETON : "var(--text-tertiary)"} bar={bar}
                                cellOf={(field) => {
                                    const on = minuteSkeleton.pivots.some((p) => p.field === field);
                                    return {
                                        on,
                                        disabled: !minuteSkelEnabled,
                                        title: on ? `${FIELD_LABEL[field]} 점 해제` : bar ? `UN ${FIELD_LABEL[field]} ${fmt(bar[field])} 를 골격 점으로` : "값 없음",
                                    };
                                }}
                                onPick={(field) => { minuteSkeleton.onToggle(field); onClose(); }} />
                        </>
                    )}

                    {!candle.time && (
                        <>
                            <SectionLabel>{anchorParamByKey.get(SKELETON_PARAM)?.name ?? "골격"} 점 — 찍은 값이 순서를 정한다(시→고→종)</SectionLabel>
                            <FieldButtonRow rowLabel="골격" rowColor={SKELETON} bar={bar}
                                cellOf={(field) => {
                                    const saved = dailySkeleton.pivots.find((p) => p.field === field);
                                    return {
                                        on: !!saved,
                                        // 저장된 시장이 지금 보는 시장과 다를 수 있다 — 그럴 땐 저장된 쪽을 적는다(사람이 지목한 그것).
                                        text: saved && saved.market !== eff ? saved.market.toUpperCase() : undefined,
                                        title: saved ? `${FIELD_LABEL[field]} 점 해제 (저장: ${saved.market.toUpperCase()})` : bar ? `${eff.toUpperCase()} ${FIELD_LABEL[field]} ${fmt(bar[field])} 를 골격 점으로` : "값 없음",
                                    };
                                }}
                                onPick={(field) => { dailySkeleton.onToggle(field, eff); onClose(); }} />

                            <SectionLabel>{anchorParamByKey.get(IGNORE_CANDLE_PARAM)?.name ?? "무시 캔들"} — 이 차트의 과거 스캔에서 제외</SectionLabel>
                            <MenuItem onClick={() => { ignore.onToggle(); onClose(); }} style={ignore.on ? { color: "var(--text-tertiary)" } : undefined}>
                                {ignore.on ? "이 캔들 해제" : "이 캔들 지정"}
                            </MenuItem>
                        </>
                    )}
                </>
            )}
        </AnchoredPopover>
    );
}
