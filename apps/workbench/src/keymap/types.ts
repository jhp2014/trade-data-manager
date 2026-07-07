// 단축키 = 커맨드 레지스트리 패턴(VSCode식). 키 문자열과 동작을 분리해 한곳에서 관리한다.
//  - 커맨드가 유일한 소스: 도움말(설정)·디스패처가 모두 이 목록에서 파생 → 문구가 안 낡음.
//  - run 을 생략하면 "문서 전용" 항목(실동작은 패널 훅이 소유, 여기선 도움말에만 노출).
export type Scope = "global" | "chart" | "board";

export interface Command {
    id: string; // 안정 식별자, 예: "app.settings"
    title: string; // 도움말에 보이는 이름
    category: string; // 도움말 그룹 키, 예: "일반" · "차트"
    keys: string; // 코드 문자열(예: "ctrl+,", "?", "space"). registry 에서 정규화됨.
    scope?: Scope; // 미지정 = "global". global 외는 활성 scope 일 때만 발동.
    run?: (e: KeyboardEvent) => void; // 생략 = 문서 전용(디스패치 대상 아님).
}
