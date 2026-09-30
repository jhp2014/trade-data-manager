// 피드백 칩 — 단축키 호출의 "바뀌었다" 한마디. 그 패널 **본문 위 오버레이**(우상단)로 잠깐 섰다
// 사라진다. 어느 패널이 단축키를 받았는지가 칩의 위치로 저절로 보인다. 라인에 안 서는 이유:
// 일시적인 말이 라인을 생멸시키면 본문 높이가 출렁인다(일시 알림 = 오버레이 규약과 한 몸).
import { create } from "zustand";

export const NOTICE_MS = 1800;

interface Notice {
    text: string;
    /** 같은 문구 연타도 새 알림으로 갈리게(칩 타이머 리셋의 키). */
    seq: number;
}

interface HeaderNoticeStore {
    byPanel: Record<string, Notice>;
    flash: (panelId: string, text: string) => void;
    /** 칩 컴포넌트가 타이머 만료에 부른다 — seq 가 다르면(그새 새 알림) 지우지 않는다. */
    expire: (panelId: string, seq: number) => void;
}

export const useHeaderNotice = create<HeaderNoticeStore>((set) => ({
    byPanel: {},
    flash: (panelId, text) =>
        set((s) => ({ byPanel: { ...s.byPanel, [panelId]: { text, seq: (s.byPanel[panelId]?.seq ?? 0) + 1 } } })),
    expire: (panelId, seq) =>
        set((s) => {
            if (s.byPanel[panelId]?.seq !== seq) return s;
            const next = { ...s.byPanel };
            delete next[panelId];
            return { byPanel: next };
        }),
}));
