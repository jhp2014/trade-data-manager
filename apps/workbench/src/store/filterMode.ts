// 작업면의 **모드**(종단/하루)가 사는 영속 키 — 슬라이스 **둘**이 부팅 때 읽어야 해서 잎 모듈이다.
//
// ⚠ 왜 여기 따로 있나: `filterFunnelSlice` 가 이미 `savedSetsSlice` 를 **값으로** import 하므로
// (`persistSavedSets`·`refUniverse`) 역방향 import 는 순환이다. 그런데 자리(`editSeat`)를 모드별로
// 나눈 뒤로는 `savedSetsSlice` 도 **부팅 시점에** 모드를 알아야 한다(그때는 스토어가 아직 없어
// `s.filterMode` 를 못 읽는다). 둘 다 이 잎 하나를 import 하면 방향이 안 생긴다.
//
// 런타임에 "지금 모드"가 필요한 자리는 이걸 안 쓴다 — `set((s) => …)` 안에서 `s.filterMode` 를
// 읽는다(그게 진실이고, 저장소는 부팅 복원용일 뿐이다).
import { loadJson, saveJson } from "./persist.js";
import type { Universe } from "../panels/filter/universe.js";

/**
 * **영속**이다. 세션으로 두면 새로고침마다 종단으로 떨어져 하루 작업 국면이 매번 끊긴다.
 * 2026-09-19 가 기각한 것은 "우주를 **집합의** 저장 필드로 되돌리기"(`wb.filterUniverse`·
 * `setFilterUniverse`·`⧉ 복제`)이고, 이건 화면 상태의 영속이라 다른 물건이다.
 */
const FILTER_MODE_KEY = "wb.filterMode.v1";

const parse = (o: unknown): Universe | null => (o === "daily" || o === "longitudinal" ? o : null);

export const loadFilterMode = (): Universe => loadJson(FILTER_MODE_KEY, parse) ?? "longitudinal";

export const saveFilterMode = (u: Universe): Universe => { saveJson(FILTER_MODE_KEY, u); return u; };
