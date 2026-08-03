// 봉 우클릭 메뉴 — "이 캔들로 무엇을 할까"가 한자리에 모인다(복기 차트 전용, 실시간은 기존 토글 유지).
//  · 가격선: 옛 우클릭 토글은 field="high" 고정이었다 — 저가·종가 선을 메뉴로 연다. 값을 숫자로 보여주는 게 핵심:
//    라벨("고가")만으론 NXT 오염 캔들(장시작 무거래 체결 튐)을 못 알아본다. 나란히 보이면 이상한 값이 바로 티가 난다.
//  · 파라미터 앵커: 활성 타점에 이름 붙은 캔들 좌표(계산 축 입력)를 매단다. needsPrice 파라미터는 시장×값
//    목록이 펼쳐지고(사람이 시장·값까지 지목), 시각 파라미터는 클릭 한 번. 레지스트리(ANCHOR_PARAMS)가 결정.
//  · 선 근처 우클릭이면 그 선 삭제만 — 즉시 삭제 대신 메뉴를 거쳐 오발을 막는다.
import { ANCHOR_PARAMS, type AnchorMarket, type PointAnchor, type PriceLineField } from "@trade-data-manager/market/domain";
import { AnchoredPopover, MenuItem, MenuLabel } from "../ui/Dialog.js";
import type { RenderLine } from "../api/priceLines.js";

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
    /** 이 캔들 앵커에 이미 그어진 가격선 id — 있으면 "이 선 삭제"가 함께 뜬다(토글 감각 보존). */
    lineIdAtCandle?: string;
    /**
     * **저장 타점**의 시각(포커스 시각이 아니다). 앵커는 타점 소유라 저장 타점에만 붙는다 —
     * 포커스 시각으로 가드하면 아무 봉에서나 버튼이 활성으로 보이고, 눌러도 서버가 FK 로 거부해
     * 조용히 실패한다(성공한 것처럼 보이는 게 최악). 저장 타점이 아니면 null 을 넘겨 비활성.
     */
    activeTime: string | null;
    /** 활성 타점의 앵커들 — 이미 지정된 파라미터는 해제 항목이 뜬다. */
    activeAnchors: readonly PointAnchor[];
    onAddLine: (field: PriceLineField) => void;
    onRemoveLine: (id: string) => void;
    onSetAnchor: (param: string, price: { field: PriceLineField; market: AnchorMarket } | null) => void;
    onClearAnchor: (param: string) => void;
    onClose: () => void;
}

const FIELD_LABELS: { field: PriceLineField; label: string }[] = [
    { field: "high", label: "고" },
    { field: "low", label: "저" },
    { field: "open", label: "시" },
    { field: "close", label: "종" },
];

const fmt = (v: number): string => v.toLocaleString();

export function CandleMenu({ anchor, candle, bars, nearLine, lineIdAtCandle, activeTime, activeAnchors, onAddLine, onRemoveLine, onSetAnchor, onClearAnchor, onClose }: CandleMenuProps): JSX.Element {
    const title = candle ? `${candle.date}${candle.time ? ` ${candle.time.slice(0, 5)}` : " 일봉"}` : "가격선";
    // 분봉 M 선은 렌더가 항상 고가를 읽는다(resolveAnchorLines) — 분봉 캔들엔 고가 항목만.
    const lineFields = candle?.time ? FIELD_LABELS.slice(0, 1) : FIELD_LABELS;
    // 가격선 표시값은 UN(항상 존재) — 가격선 자체는 market 을 저장하지 않아(렌더가 차트 모드를 따름) 안내용 숫자다.
    const lineBar = bars?.un ?? bars?.krx ?? null;

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
                    {lineFields.map(({ field, label }) => (
                        <MenuItem key={field} onClick={() => { onAddLine(field); onClose(); }}>
                            <span style={{ color: "var(--text-tertiary)" }}>선 긋기</span> {label}{" "}
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{lineBar ? fmt(lineBar[field]) : "—"}</span>
                        </MenuItem>
                    ))}
                    {lineIdAtCandle && (
                        <MenuItem onClick={() => { onRemoveLine(lineIdAtCandle); onClose(); }} style={{ color: "var(--rise)" }}>
                            이 봉의 선 삭제
                        </MenuItem>
                    )}

                    {ANCHOR_PARAMS.map((p) => {
                        const existing = activeAnchors.find((a) => a.param === p.key);
                        const disabled = activeTime === null;
                        return (
                            <div key={p.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                <MenuLabel>
                                    {p.name} 지정{activeTime ? ` → 타점 ${activeTime.slice(0, 5)}` : " — 저장 타점 아님(스페이스바)"}
                                </MenuLabel>
                                {p.needsPrice ? (
                                    (["un", "krx"] as const).map((market) => {
                                        const bar = bars?.[market];
                                        if (!bar) return null; // KRX 세션 부재(NXT 단독 시간대) — 그 시장 행 생략
                                        return (
                                            <div key={market} style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px 4px" }}>
                                                <span style={{ width: 30, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>{market.toUpperCase()}</span>
                                                {FIELD_LABELS.map(({ field, label }) => (
                                                    <button key={field} disabled={disabled}
                                                        onClick={() => { onSetAnchor(p.key, { field, market }); onClose(); }}
                                                        title={disabled ? "이 시각은 저장 타점이 아닙니다 — 스페이스바로 타점을 저장한 뒤에" : `${market.toUpperCase()} ${label} ${fmt(bar[field])} 를 ${p.name}으로`}
                                                        style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, border: "1px solid var(--border-default)", borderRadius: 4, background: "transparent", color: disabled ? "var(--text-tertiary)" : "var(--text-primary)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, fontSize: 10.5, padding: "3px 3px", lineHeight: 1.4, whiteSpace: "nowrap" }}>
                                                        <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                                                        <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(bar[field])}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <MenuItem disabled={disabled} onClick={() => { onSetAnchor(p.key, null); onClose(); }}>
                                        이 캔들로 지정
                                    </MenuItem>
                                )}
                                {existing && (
                                    <MenuItem onClick={() => { onClearAnchor(p.key); onClose(); }} style={{ color: "var(--text-tertiary)" }}>
                                        {p.name} 해제 (현재 {existing.anchorDate.slice(5)}{existing.anchorTime ? ` ${existing.anchorTime.slice(0, 5)}` : ""}
                                        {existing.market ? ` ${existing.market.toUpperCase()}·${existing.field}` : ""})
                                    </MenuItem>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </AnchoredPopover>
    );
}
