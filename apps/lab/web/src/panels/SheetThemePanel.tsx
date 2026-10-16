// 시트 테마 패널 — 그날 시계열에 실려 온 구글 시트 소속 그대로(지금 소속 — 날짜와 무관, 안 넣은 종목은 미분류).
// 이력 소속의 「테마」(ThemePanel)로 옮겨 가는 동안 비교용으로 둔다 — 시트를 걷을 때 이 파일과 카탈로그 한 줄만 지운다.
import { ThemeBoardPanel } from "./themeBoard/ThemeBoardPanel.js";

export function SheetThemePanel({ panelId }: { panelId: string }): JSX.Element {
    return <ThemeBoardPanel panelId={panelId} />;
}
