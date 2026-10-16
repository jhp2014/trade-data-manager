// 사후 정보 판정 — 경로의 (날짜, 시각)에는 몰랐을 항목인가. HTS뉴스·텔레그램이 같은 자를 쓴다.
//
// 분 단위로 잰다: 같은 분이면 "이미 아는 것"이다. 경로 시각 HH:MM 의 테마 단면이 그 분봉(HH:MM:00~59)까지 담고,
// 뉴스 줄을 눌러 그 분으로 옮겼을 때 그 줄 자신이 "나중"이 되면 안 되기 때문이다.
// 날짜를 넘어서도 잰다 — 경로가 7/30 이면 7/31 항목은 전부 나중이다. 경로에 시각이 없으면(장 마감) 가르지 않는다.

/** 항목(날짜 YYYY-MM-DD, 시각 HH:MM[:SS])이 경로(날짜, 시각 HH:MM)보다 나중인가. */
export function isAfterPath(itemDate: string, itemTime: string, pathDate: string, pathTime: string): boolean {
    if (!pathTime || !pathDate) return false;
    return itemDate > pathDate || (itemDate === pathDate && itemTime.slice(0, 5) > pathTime);
}
