// 봉 우클릭 메뉴 — "이 캔들로 무엇을 할까"가 한자리에 모인다(복기 차트 전용, 실시간은 기존 토글 유지).
//  · 선 긋기 = 기준선 후보 추가(선=앵커 통합): 시장(UN/KRX)×값(시고저종)을 지목한다. 값을 숫자로 보여주는 게
//    핵심 — 라벨("고가")만으론 NXT 오염 캔들(장시작 무거래 체결 튐)을 못 알아본다. 나란히 보이면 바로 티가 난다.
//    분봉 캔들은 UN 만(분봉 KRX 는 세션 부재가 있어 앵커 불가 — 서버 규칙과 동일 기준).
//    어느 선이 계산 축의 기준선이 되는지는 리졸버(가격 최저)가 정한다 — 차트의 하늘색 선이 그것.
//  · 무시 캔들 = 차트 소유 토글(일봉만). 타점 선택이 필요 없다 — 앵커가 차트(종목,날짜) 소유가 됐기 때문.
//  · 선 근처 우클릭이면 그 선 삭제만 — 즉시 삭제 대신 메뉴를 거쳐 오발을 막는다.
import { anchorParamByKey, IGNORE_CANDLE_PARAM, type AnchorField, type AnchorMarket } from "@trade-data-manager/market/domain";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import type { RenderLine } from "../api/chartAnchors.js";

/** 캔들 한 시장의 OHLC(원). 로드된 번들 raw 에서 뽑는다 — KRX 는 세션 부재(NXT 단독 시간대)면 null. */
export interface MenuBar {
    open: number;
    high: number;
    low: number;
    close: number;
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
    onAddLine: (field: AnchorField, market: AnchorMarket) => void;
    onRemoveLine: (id: string) => void;
    onToggleIgnore: () => void;
    onClose: () => void;
}

const FIELD_LABELS: { field: AnchorField; label: string }[] = [
    { field: "high", label: "고" },
    { field: "low", label: "저" },
    { field: "open", label: "시" },
    { field: "close", label: "종" },
];

const fmt = (v: number): string => v.toLocaleString();

export function CandleMenu({ anchor, candle, bars, nearLine, lineIdAtCandle, ignoredAtCandle, onAddLine, onRemoveLine, onToggleIgnore, onClose }: CandleMenuProps): JSX.Element {
    const title = candle ? `${candle.date}${candle.time ? ` ${candle.time.slice(0, 5)}` : " 일봉"}` : "가격선";
    // 분봉 앵커는 UN 고정(서버 규칙) — KRX 행을 아예 안 그린다. 일봉은 두 시장 다.
    const markets: readonly AnchorMarket[] = candle?.time ? ["un"] : ["un", "krx"];

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={210} padding={0} placement="beside" offset={6}>
            <MenuLabel>{title}</MenuLabel>

            {nearLine && (
                <MenuItem onClick={() => { onRemoveLine(nearLine.id); onClose(); }} style={{ color: "var(--rise)" }}>
                    이 선 삭제{nearLine.label ? ` (${nearLine.label})` : ""}
                </MenuItem>
            )}

            {candle && (
                <>
                    <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <MenuLabel>선 긋기 — 시장·값 지목</MenuLabel>
                    </div>
                    {markets.map((market) => {
                        const bar = bars?.[market];
                        if (!bar) return null; // KRX 세션 부재(NXT 단독 시간대) — 그 시장 행 생략
                        return (
                            <div key={market} style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px 4px" }}>
                                <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>{market.toUpperCase()}</span>
                                {FIELD_LABELS.map(({ field, label }) => (
                                    <button key={field}
                                        onClick={() => { onAddLine(field, market); onClose(); }}
                                        title={`${market.toUpperCase()} ${label} ${fmt(bar[field])} 에 선 긋기`}
                                        style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: "1px solid var(--border-default)", borderRadius: 4, background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                                        <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(bar[field])}</span>
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                    {lineIdAtCandle && (
                        <MenuItem onClick={() => { onRemoveLine(lineIdAtCandle); onClose(); }} style={{ color: "var(--rise)" }}>
                            이 봉의 선 삭제
                        </MenuItem>
                    )}

                    {!candle.time && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                            <MenuLabel>{anchorParamByKey.get(IGNORE_CANDLE_PARAM)?.name ?? "무시 캔들"} — 이 차트의 과거 스캔에서 제외</MenuLabel>
                            <MenuItem onClick={() => { onToggleIgnore(); onClose(); }} style={ignoredAtCandle ? { color: "var(--text-tertiary)" } : undefined}>
                                {ignoredAtCandle ? "이 캔들 해제" : "이 캔들 지정"}
                            </MenuItem>
                        </div>
                    )}
                </>
            )}
        </AnchoredPopover>
    );
}
