// vitest 공용 설정 — jsdom 에 없는 브라우저 API 를 비워 둔다(스크롤은 테스트가 재지 않는다).
Element.prototype.scrollIntoView = function scrollIntoView(): void {};
// ResizeObserver — jsdom 에 없다. 떠 있는 판(ui/popover)이 자리를 재려고 쓴다 — 재는 일은 테스트하지 않으므로 아무것도 안 한다.
window.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};
