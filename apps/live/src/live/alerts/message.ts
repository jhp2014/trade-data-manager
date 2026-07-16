// 알림 메시지 — 전송로 중립 구조체. "무엇을 말할지"는 여기(포맷), "어떻게 쓸지"는 각 노티파이어(렌더).
// 설계: [[alert-conditions-dnf-redesign]] 후속 — 텔레그램 HTML·ntfy 평문이 같은 메시지를 각자 렌더한다.
//  · **이스케이프는 렌더 시점**(전송로 관심사) — 블록은 raw 텍스트를 담는다. 뉴스 제목의 `<`, `&` 가
//    HTML 파싱 에러(400)로 알람 한 건을 통째로 죽이지 않게, escape 는 텔레그램 어댑터가 소유.
//  · replyTo = 앞선 메시지에 답장으로 묶기(텔레그램 message_id). 컨텍스트 후속(테마·뉴스)이 쓴다
//    — 발화 본문을 붙잡지 않고 먼저 보낸 뒤, 느린 컨텍스트를 그 아래 답장으로 배달하기 위함.
//  · 전송로에 서식/답장이 없으면(ntfy·MTProto) 평문 폴백 + replyTo 무시.

/** 메시지 우선순위 — ntfy 값 그대로(다른 전송로는 무시). 발화=high / 헬스🚨=urgent(무음 뚫기) / 하트비트·요약=min(무음). */
export type NotifyPriority = "min" | "low" | "default" | "high" | "urgent";

/** 메시지 갈래 — 배달 정책(쿨다운 게이트는 firing 만)과 로그 분류에 쓰인다. */
export type NotifyKind = "firing" | "health" | "context";

/** 서식 조각 — 전송로가 자기 문법으로 렌더. text 는 raw(이스케이프 전). */
export type MessageBlock =
    | { kind: "text"; text: string; bold?: boolean }
    | { kind: "pre"; text: string } // 고정폭 — 테마 탑5 같은 표
    | { kind: "link"; text: string; url: string };

export interface NotifyMessage {
    kind: NotifyKind;
    priority: NotifyPriority;
    blocks: MessageBlock[];
    /** 이 message id 에 답장으로 붙인다(지원 전송로만). */
    replyTo?: number;
}

/** 단순 문구 1건 → 메시지(헬스·하트비트·장마감 요약). */
export function textMessage(text: string, priority: NotifyPriority, kind: NotifyKind = "health"): NotifyMessage {
    return { kind, priority, blocks: [{ kind: "text", text }] };
}

/** 평문 렌더 — 서식 없는 전송로(ntfy·MTProto)와 서버 로그 공용 폴백. */
export function plainText(msg: NotifyMessage): string {
    return msg.blocks
        .map((b) => (b.kind === "link" ? `${b.text} ${b.url}` : b.text))
        .join("\n");
}
