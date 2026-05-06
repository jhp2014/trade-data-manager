import { themes, dailyThemeMappings } from "../schema/market";
import type { Database } from "../db";

/**
 * 테마를 저장하고 ID 를 반환합니다.
 *
 *  ⚠️ onConflictDoNothing + returning 조합은 충돌 시 빈 배열을 반환하므로,
 *      "있으면 그대로 두되 id 는 항상 받아오기" 위해 no-op UPDATE 패턴을 사용합니다.
 *      (PostgreSQL upsert + returning 의 표준 관용구)
 */
export async function saveThemeAndReturnId(
    db: Database,
    themeName: string,
): Promise<bigint> {
    const result = await db
        .insert(themes)
        .values({ themeName })
        .onConflictDoUpdate({
            target: themes.themeName,
            set: { themeName },
        })
        .returning({ id: themes.themeId });

    return result[0].id;
}

/**
 * 일봉-테마 매핑을 저장합니다. 이미 존재하면 무시합니다.
 */
export async function saveThemeMapping(
    db: Database,
    themeId: bigint,
    dailyCandleId: bigint,
): Promise<void> {
    await db
        .insert(dailyThemeMappings)
        .values({ themeId, dailyCandleId })
        .onConflictDoNothing();
}
