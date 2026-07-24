// 순위 분석 용어 도움말 — 분석·결과 패널이 공유. 헤더의 "?" 버튼 → 용어 정리 팝오버.
//  · 예전엔 히트맵·산점·결과 헤더에 긴 설명 문구를 상시 노출했는데, 여기 한곳으로 모아 화면을 비웠다.
//  · dockview 패널의 transform 때문에 fixed 가 갇히므로 body 로 portal(RankPanel 팝오버와 동일 이유).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

const TERMS: { term: string; desc: string }[] = [
    { term: "N / coverage", desc: "N = 밴드 교집합에 걸린 상황 수. coverage = 활성 축 전부에 배치된 모수(N/모수). 표본이 작으면 분포는 노이즈일 수 있음." },
    { term: "MFE", desc: "최대상승 — 진입가 대비 관측 구간 내 최고 도달 %." },
    { term: "MAE 전", desc: "고점 전 최저 — 최대상승 지점 이전의 최저 %(진입 손절이 견뎌야 하는 낙폭)." },
    { term: "MAE 후", desc: "고점 후 최저 — 최대상승 지점 이후의 최저 %(트레일링에서 반납하는 낙폭)." },
    { term: "밀도 히트맵", desc: "가로 = 진입 대비 경과분, 세로 = 진입가 대비 %. 진할수록 그 시각·가격대를 지난 상황이 많음. 진입 전(음수 t)은 맥락용. 휠/드래그 = 줌·팬·교차선." },
    { term: "horizon / 버킷", desc: "horizon = 진입 후 관측 구간(분). 히트맵 세로선 드래그로도 조정. 버킷 = 히트맵 칸 폭(분, 1/5/10)." },
    { term: "목표 / 손절", desc: "히트맵 가로 기준선(축 여백 라벨을 끌어 조정). 첫 터치 시뮬의 익절/손절 기준선." },
    { term: "보라선 · 실% 기준(UN/KRX)", desc: "보라선 = 선택 종목(좌측축 = 실%). 실% 기준 = 전일종가 분모 시장(UN/KRX). 구름(진입가 기준)엔 영향 없음." },
];

export function RankHelpButton(): JSX.Element {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const toggle = (): void => {
        const el = btnRef.current;
        if (el) { const r = el.getBoundingClientRect(); setPos({ left: r.left, top: r.bottom + 6 }); }
        setOpen((v) => !v);
    };
    return (
        <>
            <button ref={btnRef} onClick={toggle} title="용어 도움말" aria-label="용어 도움말"
                style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border-default)", background: open ? "var(--accent-soft)" : "transparent", color: open ? "var(--accent-primary)" : "var(--text-tertiary)", cursor: "pointer", fontSize: 10.5, fontWeight: 700, lineHeight: 1, padding: 0, flexShrink: 0 }}>?</button>
            {open && createPortal(
                <>
                    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
                    <div style={{ position: "fixed", left: Math.max(8, Math.min(pos.left, window.innerWidth - 348)), top: pos.top, zIndex: 71, width: 340, maxHeight: "70vh", overflowY: "auto", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 9, boxShadow: "0 10px 30px rgba(0,0,0,0.24)", padding: "6px 0" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", padding: "4px 12px 6px", letterSpacing: "0.04em" }}>용어 정리</div>
                        {TERMS.map((t) => (
                            <div key={t.term} style={{ padding: "5px 12px", borderTop: "1px solid var(--border-subtle)" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{t.term}</div>
                                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 1 }}>{t.desc}</div>
                            </div>
                        ))}
                    </div>
                </>,
                document.body,
            )}
        </>
    );
}
