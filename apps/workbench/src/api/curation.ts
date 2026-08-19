// 로컬 미러 동기화 클라이언트 — 읽기 소스를 최신화한다.
//
// 쓰기는 즉시 원격으로 가지만(dual write) 읽기는 **명시적으로 당길 때만** 새로워진다. 비대칭이 의도다:
// 내 작업이 유실될 여지는 없어야 하지만, 상대 작업이 작업 중에 불쑥 끼어들면 작업면이 흔들린다
// (골격을 겹쳐 놓고 비교하는 중에 목록이 바뀌는 식). 언제 받아들일지는 사람이 정한다.
import type { CurationSyncState, CurationSyncStatus } from "@trade-data-manager/wire";
import { apiGet, apiPost } from "./http.js";

export type { CurationSyncState, CurationSyncStatus } from "@trade-data-manager/wire";

export const fetchMirrorStatus = (signal?: AbortSignal): Promise<CurationSyncState> =>
    apiGet<CurationSyncState>("curation/sync", undefined, signal);

export const runMirrorSync = (): Promise<CurationSyncStatus> => apiPost<CurationSyncStatus>("curation/sync", {});
