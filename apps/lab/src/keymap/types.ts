// 단축키 = 커맨드 레지스트리 패턴(VSCode식). 키 문자열과 동작을 분리해 한곳에서 관리한다. workbench keymap 에서 옮겼다.
//  - 커맨드가 유일한 소스: 도움말(설정 창)·디스패처가 모두 이 목록에서 파생 → 문구가 안 낡음.
//  - 커맨드는 전부 전역이다(패널별 덧씌우기는 없다).
export interface Command {
    id: string; // 안정 식별자, 예: "app.settings"
    title: string; // 도움말에 보이는 이름
    category: string; // 도움말 그룹 키, 예: "일반" · "차트"
    keys: string; // 코드 문자열(예: "ctrl+,", "?", "shift+d"). registry 에서 정규화됨.
    /** 키를 누르고 있을 때 반복 발동 — 기본은 한 번만(줌 토글·화면 부르기가 초당 수십 번 돌지 않게). */
    repeat?: boolean;
    /** 설정 창이 열려 있어도 발동 — 기본은 쉰다(창 뒤 화면의 시각·줌·배치가 몰래 바뀌지 않게). */
    inDialog?: boolean;
    run: (e: KeyboardEvent) => void;
}
