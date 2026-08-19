import { livePost } from "./http.js";

// 실시간 백엔드(apps/live) 명령 어댑터. SSE 스냅샷 구독은 lib/LiveSnapshotContext(연결 한 벌)로 갔다.

// 실시간 백엔드(apps/live) 테마 멤버십 즉시 재로드 — 배정(apps/api)·시트 직접편집 후 실시간 보드에 반영.
// 보드는 SSE 라 reload 후 다음 틱에 자동 갱신(react-query invalidate 불필요). apps/live 미기동이면 throw → 호출부 best-effort.
export const refreshLiveThemes = (): Promise<void> => livePost<void>("theme/refresh");
