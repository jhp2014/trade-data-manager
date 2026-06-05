/**
 * 이벤트 타깃이 "사용자가 텍스트를 입력 중인 요소"인지 판정한다.
 * 전역 키보드/클립보드 핸들러에서 input/textarea/select/contentEditable 에
 * 포커스가 있을 때 단축키를 가로채지 않도록 가드로 쓴다(여러 곳의 중복 제거).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}
