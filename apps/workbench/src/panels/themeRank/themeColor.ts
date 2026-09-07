// 시선 종목의 테마 → 색(순수). 산점의 점 색과 칩 줄의 스와치가 **같은 이 함수**를 본다.
//
// 왜 이름 해시인가(순번이 아니라): 순번으로 주면 시선을 옮길 때마다 같은 테마가 다른 색이 된다
// ("2차전지"가 어제는 청록, 오늘은 갈색). 이름에서 결정론적으로 뽑으면 그 테마는 언제나 그 색이라
// 눈이 학습한다 — 태그 그룹 색(palette.groupColor)이 같은 이유로 같은 방식을 쓴다.
//
// 다만 해시는 충돌한다. 세상 전체의 테마를 10색에 넣으니 당연하고, 그건 문제도 아니다 — 문제는
// **한 시선 안에서** 두 테마가 같은 색일 때다(그 화면에서 구분이 안 된다). 그래서 충돌만 그 자리에서
// 다음 빈 색으로 민다: 다른 시선의 배정은 건드리지 않으므로 "이 테마 = 이 색"의 안정성은 대부분 산다.
import { SERIES_COLOR_COUNT, seriesColor } from "../../styles/palette.js";

const hashOf = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
};

/**
 * 테마 목록 → 테마별 색. 목록이 팔레트보다 길면(테마 11개 이상) 남는 것들은 돌려쓴다 —
 * 그 지경이면 색으로 가르는 것 자체가 이미 안 되는 자리라 렌즈가 답이다.
 */
export function themeColorMap(themes: readonly string[]): Map<string, string> {
    const used = new Set<number>();
    const out = new Map<string, string>();
    for (const theme of themes) {
        if (out.has(theme)) continue; // 같은 이름이 두 번 오면 첫 배정을 지킨다
        let i = hashOf(theme) % SERIES_COLOR_COUNT;
        for (let step = 0; step < SERIES_COLOR_COUNT && used.has(i); step++) i = (i + 1) % SERIES_COLOR_COUNT;
        used.add(i);
        out.set(theme, seriesColor(i));
    }
    return out;
}
