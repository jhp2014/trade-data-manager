import { bigint } from "drizzle-orm/pg-core";
import { themes } from "@trade-data-manager/market-data";
import type { ThemeFeatureCalculator, ColumnOptions, ThemeFeatureContext } from "../../types";
import { tsKey, dbKey } from "../../helpers";

export class ThemeIdCalculator implements ThemeFeatureCalculator {
    columns(opts: ColumnOptions = {}) {
        const { prefix } = opts;
        return {
            [tsKey("themeId", prefix)]: bigint(dbKey("theme_id", prefix), { mode: "bigint" })
                .notNull()
                .references(() => themes.themeId),
        };
    }

    calculate(ctx: ThemeFeatureContext) {
        return { themeId: ctx.themeId };
    }
}
