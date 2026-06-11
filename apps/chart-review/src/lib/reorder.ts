/**
 * 배열에서 index 항목을 dir(-1 위 / +1 아래) 방향 이웃과 맞바꾼 새 배열을 반환한다.
 * index 가 범위를 벗어나거나 이동 대상이 경계 밖이면 원본을 그대로(같은 참조) 반환한다.
 */
export function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (index < 0 || index >= arr.length || target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
