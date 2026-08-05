// 봉 우클릭 메뉴 — "이 캔들로 무엇을 할까"가 한자리에 모인다(복기 차트 전용, 실시간은 기존 토글 유지).
//
// **시장은 메뉴 전체의 토글 하나**다. 옛날엔 UN·KRX 를 두 줄로 펼쳤는데, 실제로는 한 번에 한 시장만 보고
// 지목하므로 줄만 두 배가 됐다. 토글이면 같은 자리에서 값이 바뀌어 **두 시장 값을 비교하기도 더 쉽다**
// (자리가 안 움직이니 숫자만 갈아끼워진다 — NXT 오염 캔들은 그 차이로 알아본다).
// 선택은 패널에 남는다(sticky) — 오염을 피해 KRX 로 보는 중이면 봉마다 다시 누를 이유가 없다.
//
//  · 선 긋기 = 기준선 후보 추가(선=앵커 통합). 어느 선이 계산 축의 기준선이 되는지는 리졸버(가격 최저)가
//    정한다 — 차트의 하늘색 선이 그것.
//  · 골격 점 = 형태 분류의 입력(일봉만). 값별 토글이고, **찍는 순서가 아니라 캔들·값이 순서를 정한다**
//    (시→고→종은 정리) — 그래서 아무 순서로 찍어도 되고 메뉴에 순번이 없다.
//  · 무시 캔들 = 차트 소유 토글(일봉만). 타점 선택이 필요 없다 — 앵커가 차트(종목,날짜) 소유가 됐기 때문.
//  · 선 근처 우클릭이면 그 선 삭제만 — 즉시 삭제 대신 메뉴를 거쳐 오발을 막는다.
import { anchorParamByKey, IGNORE_CANDLE_PARAM, SKELETON_MINUTE_PARAM, SKELETON_PARAM, type AnchorField, type AnchorMarket } from "@trade-data-manager/market/domain";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import { SKELETON } from "../styles/palette.js";
import type { RenderLine } from "../api/chartAnchors.js";

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
    /** 이 캔들에 이미 그어진 선의 id — 있으면 "이 봉의 선 삭제"가 함께 뜬다(토글 감각 보존). */
    lineIdAtCandle?: string;
    /** 이 일봉이 무시 캔들로 지정돼 있는가(차트 소유 — 타점 무관). */
    ignoredAtCandle: boolean;
    /** 이 일봉에 이미 찍힌 골격 점들 — 토글 상태 + 저장된 시장 표시. */
    skeletonAtCandle: readonly SkeletonPivotAtCandle[];
    /** 시장 토글(패널 영속). 분봉 캔들에선 무시되고 언제나 UN 이다(서버 규칙). */
    market: AnchorMarket;
    onMarketChange: (m: AnchorMarket) => void;
    onAddLine: (field: AnchorField, market: AnchorMarket) => void;
    onRemoveLine: (id: string) => void;
    onToggleIgnore: () => void;
    onToggleSkeletonPivot: (field: AnchorField, market: AnchorMarket) => void;
    /**
     * 분봉 골격의 소유 타점 시각(**저장 타점**만 — 포커스 시각이 아니다). null 이면 찍을 곳이 없어 비활성.
     * 옛 타점 소유 앵커 시절의 가드가 이 param 에만 돌아왔다: 소유가 타점이라 저장 타점이 아니면 매달 데가 없다.
     */
    activeTime: string | null;
    /** 이 분봉에 이 타점이 찍은 골격 값들. */
    minuteSkeletonAtCandle: readonly AnchorField[];
    onToggleMinuteSkeletonPivot: (field: AnchorField) => void;
    onClose: () => void;
}

const FIELD_LABELS: { field: AnchorField; label: string }[] = [
    { field: "high", label: "고" },
    { field: "low", label: "저" },
    { field: "open", label: "시" },
    { field: "close", label: "종" },
];

const fmt = (v: number): string => v.toLocaleString();

export function CandleMenu({
    anchor, candle, bars, nearLine, lineIdAtCandle, ignoredAtCandle, skeletonAtCandle,
    market, onMarketChange, onAddLine, onRemoveLine, onToggleIgnore, onToggleSkeletonPivot,
    activeTime, minuteSkeletonAtCandle, onToggleMinuteSkeletonPivot, onClose,
}: CandleMenuProps): JSX.Element {
    const title = candle ? `${candle.date}${candle.time ? ` ${candle.time.slice(0, 5)}` : " 일봉"}` : "가격선";
    // 분봉 앵커는 UN 고정(서버 규칙), KRX 바가 없는 일봉도 UN 으로 되돌린다 — 없는 시장을 지목할 수는 없다.
    const eff: AnchorMarket = candle?.time || !bars?.krx ? "un" : market;
    const bar = bars?.[eff] ?? null;
    const canToggle = !candle?.time && bars?.krx != null && bars?.un != null;
    const other: AnchorMarket = eff === "un" ? "krx" : "un";
    // 분봉 골격 노출 규칙 — **타점 시각 이후 봉은 항목 자체를 숨긴다**(서버도 400 으로 막지만, 눌러보고
    // 알게 하지 않는다). 저장 타점이 없으면 숨기지 않고 **비활성**으로 남긴다 — 왜 못 찍는지를 알려야 한다.
    const minuteSkelVisible = candle?.time != null && (activeTime === null || candle.time <= activeTime);
    const minuteSkelEnabled = minuteSkelVisible && activeTime !== null && !!bar;

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={210} padding={0} placement="beside" offset={6}>
            {/* 제목 줄 — 시장 토글이 우측 빈자리를 쓴다(아래 선·골격 두 줄이 이 시장을 따른다).
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
                <MenuItem onClick={() => { onRemoveLine(nearLine.id); onClose(); }} style={{ color: "var(--rise)" }}>
                    이 선 삭제{nearLine.label ? ` (${nearLine.label})` : ""}
                </MenuItem>
            )}

            {candle && (
                <>
                    <div style={{ borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 2, padding: "6px 8px 4px" }}>
                        <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>선</span>
                        {FIELD_LABELS.map(({ field, label }) => (
                            <button key={field}
                                disabled={!bar}
                                onClick={() => { onAddLine(field, eff); onClose(); }}
                                title={bar ? `${eff.toUpperCase()} ${label} ${fmt(bar[field])} 에 선 긋기` : "값 없음"}
                                style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: "1px solid var(--border-default)", borderRadius: 4, background: "transparent", color: bar ? "var(--text-primary)" : "var(--text-tertiary)", cursor: bar ? "pointer" : "default", fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                                <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                                <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{bar ? fmt(bar[field]) : "—"}</span>
                            </button>
                        ))}
                    </div>
                    {lineIdAtCandle && (
                        <MenuItem onClick={() => { onRemoveLine(lineIdAtCandle); onClose(); }} style={{ color: "var(--rise)" }}>
                            이 봉의 선 삭제
                        </MenuItem>
                    )}

                    {minuteSkelVisible && (
                        <>
                            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                <MenuLabel>
                                    {anchorParamByKey.get(SKELETON_MINUTE_PARAM)?.name ?? "분봉 골격"}
                                    {activeTime ? ` → 타점 ${activeTime.slice(0, 5)}` : " — 저장 타점 아님(스페이스바)"}
                                </MenuLabel>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 8px 4px" }}>
                                <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: minuteSkelEnabled ? SKELETON : "var(--text-tertiary)" }}>골격</span>
                                {FIELD_LABELS.map(({ field, label }) => {
                                    const on = minuteSkeletonAtCandle.includes(field);
                                    return (
                                        <button key={field}
                                            disabled={!minuteSkelEnabled}
                                            onClick={() => { onToggleMinuteSkeletonPivot(field); onClose(); }}
                                            title={activeTime === null ? "이 시각은 저장 타점이 아닙니다 — 스페이스바로 타점을 저장한 뒤에" : on ? `${label} 점 해제` : bar ? `UN ${label} ${fmt(bar[field])} 를 골격 점으로` : "값 없음"}
                                            style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: `1px solid ${on ? SKELETON : "var(--border-default)"}`, borderRadius: 4, background: on ? `${SKELETON}22` : "transparent", color: on ? SKELETON : minuteSkelEnabled ? "var(--text-primary)" : "var(--text-tertiary)", cursor: minuteSkelEnabled ? "pointer" : "default", opacity: minuteSkelEnabled ? 1 : 0.5, fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                                            <span style={{ color: on ? SKELETON : "var(--text-tertiary)" }}>{label}</span>
                                            <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{bar ? fmt(bar[field]) : "—"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!candle.time && (
                        <>
                            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                <MenuLabel>{anchorParamByKey.get(SKELETON_PARAM)?.name ?? "골격"} 점 — 찍은 값이 순서를 정한다(시→고→종)</MenuLabel>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 8px 4px" }}>
                                <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: SKELETON }}>골격</span>
                                {FIELD_LABELS.map(({ field, label }) => {
                                    const saved = skeletonAtCandle.find((p) => p.field === field);
                                    // 저장된 시장이 지금 보는 시장과 다를 수 있다 — 그럴 땐 저장된 쪽을 적는다(사람이 지목한 그것).
                                    const badge = saved && saved.market !== eff ? saved.market.toUpperCase() : null;
                                    return (
                                        <button key={field}
                                            disabled={!bar}
                                            onClick={() => { onToggleSkeletonPivot(field, eff); onClose(); }}
                                            title={saved ? `${label} 점 해제 (저장: ${saved.market.toUpperCase()})` : bar ? `${eff.toUpperCase()} ${label} ${fmt(bar[field])} 를 골격 점으로` : "값 없음"}
                                            style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: `1px solid ${saved ? SKELETON : "var(--border-default)"}`, borderRadius: 4, background: saved ? `${SKELETON}22` : "transparent", color: saved ? SKELETON : bar ? "var(--text-primary)" : "var(--text-tertiary)", cursor: bar ? "pointer" : "default", fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                                            <span style={{ color: saved ? SKELETON : "var(--text-tertiary)" }}>{label}</span>
                                            <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{badge ?? (bar ? fmt(bar[field]) : "—")}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                <MenuLabel>{anchorParamByKey.get(IGNORE_CANDLE_PARAM)?.name ?? "무시 캔들"} — 이 차트의 과거 스캔에서 제외</MenuLabel>
                                <MenuItem onClick={() => { onToggleIgnore(); onClose(); }} style={ignoredAtCandle ? { color: "var(--text-tertiary)" } : undefined}>
                                    {ignoredAtCandle ? "이 캔들 해제" : "이 캔들 지정"}
                                </MenuItem>
                            </div>
                        </>
                    )}
                </>
            )}
        </AnchoredPopover>
    );
}
