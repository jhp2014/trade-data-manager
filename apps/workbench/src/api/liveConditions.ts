// 조건검색식 조회·선택 — apps/live(/live 프록시 → :3002). 설정 모달(조건검색 화면)이 소비.
import type { LiveConditionsView } from "@trade-data-manager/wire";
import { ApiError, liveGet, livePost } from "./http.js";

/**
 * 조건식 목록. 503 = 엔진 미연결(장외·서버 다운)이라 서버 원문 대신 사용자 문구로 바꾼다 —
 * transport 는 상태코드만 싣고, "그 코드가 이 화면에서 무슨 뜻인지"는 이 모듈이 안다.
 */
export async function fetchLiveConditions(signal?: AbortSignal): Promise<LiveConditionsView> {
    try {
        return await liveGet<LiveConditionsView>("conditions", undefined, signal);
    } catch (e) {
        if (e instanceof ApiError && e.status === 503) throw new Error("엔진 미연결(장외·서버 확인)");
        throw e;
    }
}

/** 조건 교체(빈 문자열=해제). 성공 시 서버가 영속 — 재기동에도 유지. */
export const selectLiveCondition = (name: string): Promise<void> => livePost<void>("condition", { name });
