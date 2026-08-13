// 늘 최신 값을 가리키는 ref — **한 번만 붙는 리스너**가 매 렌더 바뀌는 값을 읽어야 할 때.
//
// lightweight-charts 는 명령형이라 구독을 마운트에 한 번 걸고 만다(`useEffect(..., [])`). 그 안의
// 클로저는 첫 렌더의 props 를 영원히 붙잡으므로, 콜백이나 기준가처럼 매 렌더 바뀌는 것을 그대로 쓰면
// 조용히 낡은 값으로 동작한다. 그렇다고 의존성에 넣으면 구독을 매번 떼고 다시 다는데, 그건 차트
// 상태(줌·선택)를 흔든다. ref 를 거치는 게 그래서 정석이다.
//
// 이걸 파일로 뽑은 이유는 **같은 문제를 두 파일이 다르게 풀고 있었기** 때문이다:
// 일봉은 args 통째로 ref 하나, 분봉은 콜백마다 ref 를 따로 두고 useEffect 로 여섯 줄을 동기했다.
// 값이 하나 늘 때마다 분봉 쪽은 세 군데(선언·동기·사용)를 고쳐야 했고, 실제로 그게 새기 좋은 자리다.
import { useRef, type MutableRefObject } from "react";

/**
 * 렌더 중에 갱신한다(effect 가 아니라) — effect 로 미루면 **같은 커밋 안에서** 리스너가 먼저 불릴 때
 * 한 박자 낡은 값을 읽는다. 렌더 중 ref 쓰기는 이 용도(외부 시스템에 넘길 최신값 보관)에서는 안전하다:
 * 렌더 결과에 안 쓰이므로 동시성 모드의 중단·재시도가 화면을 어긋나게 만들지 않는다.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}
