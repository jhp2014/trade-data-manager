// 그 자리 확인 줄 — 되돌릴 수 없는 손짓(삭제·덮어쓰기·되돌리기)을 그 줄 자리에서 한 번 더 묻는다.
// 브라우저 confirm 대신(실측 브라우저가 confirm 을 막고, 앱 안에서 그려야 테마·글꼴이 맞는다).
import { useRef, useState, type ReactNode } from "react";
import { usePopoverLayer } from "./popover/stack.js";
import { smallButton as smallBtn } from "./chrome.js";

/**
 * 확인을 기다리는 손짓 하나. ask(at, …) 로 묻고, bar(at) 이 그 자리(at)에 확인 줄을 낸다(묻는 중이 아니면 null —
 * 호출부는 `bar(at) ?? 원래 내용` 으로 쓴다). 다른 자리에서 다시 물으면 앞의 질문은 접힌다.
 */
export function useConfirm(): { ask: (at: string, text: string, yes: string, run: () => void) => void; bar: (at: string) => ReactNode } {
    const [pending, setPending] = useState<{ at: string; text: string; yes: string; run: () => void } | null>(null);
    return {
        ask: (at, text, yes, run) => setPending({ at, text, yes, run }),
        bar: (at) =>
            pending?.at === at ? (
                <ConfirmBar
                    text={pending.text}
                    yes={pending.yes}
                    onYes={() => {
                        setPending(null);
                        pending.run();
                    }}
                    onNo={() => setPending(null)}
                />
            ) : null,
    };
}

/**
 * 질문 · [하기] · [취소]. 하기 버튼에 포커스(Enter = 하기).
 * 판 스택에 오른다(창의 자식): 포커스가 어디 있든 Esc 는 맨 위인 이 줄만 접고, 줄 밖을 누르면 취소된다.
 */
function ConfirmBar({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    usePopoverLayer({ surfaceRef: ref, onClose: onNo });
    return (
        <div
            ref={ref}
            role="alertdialog"
            aria-label={text}
            style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "2px 4px", borderRadius: 4, background: "var(--warning-soft)" }}
        >
            <span style={{ flex: 1, fontSize: 12 }}>{text}</span>
            <button autoFocus onClick={onYes} style={{ ...smallBtn, fontWeight: 700, color: "var(--rise)", borderColor: "var(--rise)" }}>
                {yes}
            </button>
            <button onClick={onNo} style={smallBtn}>
                취소
            </button>
        </div>
    );
}
