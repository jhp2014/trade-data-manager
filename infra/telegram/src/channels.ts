// 검색 대상 뉴스 방 레지스트리 — peer(Telegram 고유 식별)와 표시명.
// peer 는 recon(getDialogs)로 실측·검증한 값. 공개방은 @username, 비공개방(@없음)은 id 문자열.
// 방 추가/제거는 여기만 고치면 된다(레지스트리 = Telegram 관심사라 SDK 패키지가 소유).

export interface TelegramChannel {
    /** @username(공개) 또는 채널 id 문자열(비공개). searchChannel 의 peer 인자. */
    peer: string;
    /** 결과 표시용 방 이름. */
    label: string;
}

/** 사용자가 구독 중인 종목/공시 뉴스 방(검증 완료, 2026-06-30). */
export const NEWS_CHANNELS: readonly TelegramChannel[] = [
    { peer: "-1001208429502", label: "주식 급등일보" }, // @없음 → id
    { peer: "@realtime_stock_news", label: "실시간 주식 뉴스" },
    { peer: "@moneythemestock", label: "머니서퍼" },
    { peer: "@morefaternews", label: "HTS보다 빠른 뉴스채널" },
    { peer: "@characteristicstock", label: "특징주 레이더" },
    { peer: "@YeouidoStory2", label: "여의도스토리 Ver2.0" },
    { peer: "@awake_schedule", label: "AWAKE 마켓 브리핑" },
    { peer: "@darthacking", label: "AWAKE 실시간 주식 공시" },
    { peer: "@maindisclosurenews", label: "주요공시 알리미" },
];
