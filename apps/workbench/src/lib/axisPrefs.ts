// 축 순서 pref 의 공용 셈 — 레일 패널(`panels/filter/axisOrder`)과 시트(`useRankAxes.reorder`)가 함께 쓴다.
// panels 안에 두면 lib(시트 축 훅)가 panels 를 물게 되므로 여기(lib)가 집이다(useThemeStrengthStats 와 같은 이유).

/**
 * 화면 목록으로 새로 쓴 순서(`next`)에 **잠깐 숨은** 축의 자리를 되살린다 — 순서 덮어쓰기(레일 `moveAxis`·시트
 * `reorder`)는 화면 목록으로 통째 새로 쓰므로, 지금 안 보이는 축(렌즈로 빠진 고점·다리 축, 격자 로딩 전의 격자 축)은
 * pref 에서 사라지고 다시 나타날 때 맨 뒤로 밀린다. 숨은 보호 축은 옛 pref 에서 **바로 앞에 있던(next 에 살아 있는)
 * 축의 뒤**에 다시 끼운다(앞이 없으면 맨 앞). 화면에 보이는 축들의 상대 순서는 `next` 그대로다(끼우는 건 안 보이는
 * 것뿐 — 그래서 dropEdge 표시선과 어긋나지 않는다). 보호 목록 밖의 죽은 축은 여전히 청소된다.
 */
export function retainHidden(next: readonly string[], prevPref: readonly string[], protectedKeys: ReadonlySet<string>): string[] {
    const out = [...next];
    const live = new Set(next);
    for (let i = 0; i < prevPref.length; i++) {
        const k = prevPref[i]!;
        if (live.has(k) || !protectedKeys.has(k)) continue;
        let at = 0;
        for (let j = i - 1; j >= 0; j--) {
            const idx = out.indexOf(prevPref[j]!);
            if (idx >= 0) {
                at = idx + 1;
                break;
            }
        }
        out.splice(at, 0, k);
        live.add(k);
    }
    return out;
}
