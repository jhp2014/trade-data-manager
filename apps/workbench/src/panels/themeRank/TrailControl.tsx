// 꼬리 오프셋 편집 손 — 푸터의 팝오버(Popover 는 위로 열린다 — 이 트리거가 패널 바닥에 있어 맞는 방향).
// 값은 settingsSlice.themeTrailOffsets(영속) 하나 — 날짜·종목과 무관한 보기 취향이라 패널 로컬이 아니다.
// 상한·정돈(정수·중복·정렬)은 슬라이스의 normalizeTrailOffsets 가 진다 — 여기는 손짓만.
import { useState, type CSSProperties } from "react";
import { Popover } from "../../components/Popover.js";
import { useWorkbench } from "../../store/workbench.js";

const TRAIL_CAP = 5; // 슬라이스와 같은 값 — 여기선 "＋ 가 왜 안 먹나"를 미리 말하는 용도

export function TrailControl(): JSX.Element {
    const offsets = useWorkbench((s) => s.themeTrailOffsets);
    const setOffsets = useWorkbench((s) => s.setThemeTrailOffsets);
    const [draft, setDraft] = useState("");
    const full = offsets.length >= TRAIL_CAP;
    // Enter 는 draft 상태가 아니라 **이벤트 대상의 실제 값**으로 커밋한다 — 프로그램적 값 주입(테스트
    // 도구 등)이 onChange 를 우회해 draft 가 비어 있어도 손에 보이는 값이 들어가게.
    const add = (raw: string): void => {
        const v = Number(raw);
        if (!Number.isInteger(v) || v < 1 || full) return;
        setOffsets([...offsets, v]);
        setDraft("");
    };
    return (
        <Popover trigger={(open, toggle) => (
            <button onClick={toggle}
                title="꼬리 — 지금 분에서 뒤로 이 오프셋(분) 지점들을 이어 그린다. 비우면 꼬리 꺼짐"
                style={{
                    ...chip,
                    ...(offsets.length > 0 ? { color: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : {}),
                    ...(open ? { background: "var(--bg-tertiary)" } : {}),
                }}>
                {offsets.length > 0 ? `꼬리 −${offsets.join("·−")}` : "꼬리 —"}
            </button>
        )}>
            {() => (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    {offsets.map((o) => (
                        <button key={o} onClick={() => setOffsets(offsets.filter((x) => x !== o))}
                            title="이 오프셋 빼기" style={chip}>
                            −{o}′ ✕
                        </button>
                    ))}
                    {offsets.length === 0 && <span style={{ color: "var(--text-tertiary)" }}>오프셋 없음 — 꼬리 꺼짐</span>}
                    <input value={draft} inputMode="numeric" placeholder="분"
                        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => { if (e.key === "Enter") add(e.currentTarget.value); }}
                        disabled={full}
                        title={full ? `최대 ${TRAIL_CAP}개 — 흐림 계단이 더 많으면 안 읽힌다` : "분 단위 오프셋 — Enter 또는 ＋로 추가"}
                        style={input} />
                    <button onClick={() => add(draft)} disabled={full} title={full ? `최대 ${TRAIL_CAP}개` : "추가"} style={chip}>＋</button>
                </div>
            )}
        </Popover>
    );
}

const chip: CSSProperties = {
    fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)",
    borderRadius: 8, padding: "1px 7px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
};
const input: CSSProperties = {
    width: 40, fontSize: 11, padding: "1px 5px", border: "1px solid var(--border-default)", borderRadius: 6,
    background: "var(--bg-primary)", color: "var(--text-primary)",
};
