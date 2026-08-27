// 테마 강도 하위 조건 3종의 **공용 편집 줄** — 테마 순위 패널(탐색값)과 집합 편성 보드(동결 술어의
// 임계값)가 같은 레이블·툴팁·입력 규칙을 쓴다. 두 화면이 각자 그리면 조건 어휘가 갈린다.
// controlled: value 는 부모 소유, onChange 는 patch — 패널은 스토어 setter 를, 보드는 술어 updater 를 꽂는다.
import type { CSSProperties } from "react";
import { Checkbox, NumberField } from "../ui/controls.js";
import type { ThemeStrengthParams } from "../lib/themeStrength.js";

export function ThemeStrengthFields({ value, onChange }: {
    value: ThemeStrengthParams;
    onChange: (patch: Partial<ThemeStrengthParams>) => void;
}): JSX.Element {
    // 숫자는 **blur/Enter 에 한 번** 커밋한다 — 보드에서 이 커밋이 곧 전 유니버스 재정산이라, 키 입력마다
    // 올리면 "그리는 동안 로컬·손 뗄 때 커밋"이라는 보드 손잡이 규약(레일·컷선)과 어긋난다.
    // 타이핑 중 버퍼는 NumberField 가 든다(onChange 미전달 = 로컬 버퍼만 움직인다).
    const commit = (key: "countMin" | "baseRankMax" | "zoneRankMax") =>
        (e: React.FocusEvent<HTMLInputElement>): void => {
            const n = Math.floor(Number(e.currentTarget.value));
            if (Number.isFinite(n) && n >= 1 && n !== value[key]) onChange({ [key]: n });
        };
    const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter") e.currentTarget.blur();
    };
    return (
        <>
            <label style={cond} title="존 내 테마 종목 수 ≥ x (자신 포함)">
                <Checkbox checked={value.countOn} onChange={(e) => onChange({ countOn: e.target.checked })} />
                동료 ≥ <NumberField min={1} value={value.countMin} onBlur={commit("countMin")} onKeyDown={enterBlurs} style={numBox} />
            </label>
            <label style={cond} title="테마 내 기본 순위 ≤ r (존 무관, 전 멤버 중)">
                <Checkbox checked={value.baseRankOn} onChange={(e) => onChange({ baseRankOn: e.target.checked })} />
                기본순위 ≤ <NumberField min={1} value={value.baseRankMax} onBlur={commit("baseRankMax")} onKeyDown={enterBlurs} style={numBox} />
            </label>
            <label style={cond} title="테마 내 존 순위 ≤ r (존에 든 멤버 중 — 자신이 존 밖이면 불만족)">
                <Checkbox checked={value.zoneRankOn} onChange={(e) => onChange({ zoneRankOn: e.target.checked })} />
                존순위 ≤ <NumberField min={1} value={value.zoneRankMax} onBlur={commit("zoneRankMax")} onKeyDown={enterBlurs} style={numBox} />
            </label>
        </>
    );
}

const cond: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
const numBox: CSSProperties = { width: 44, fontSize: 11, padding: "1px 4px" }; // radius 는 inputBase 것 — 옆 칸과 갈리면 눈에 띈다
