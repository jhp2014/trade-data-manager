// 정찰 4: SheetThemeMembershipAdapter 실측 — 실제 '종목분류' 시트를 OAuth(@tdm/google)로 읽어 파싱 검증.
//   ① 로드 성공·멤버 수·테마 종수 ② toCanonical 결과가 전부 6자리인가(비표준 코드 잡기) ③ 테마 분포·샘플.
// 사용: pnpm --filter @trade-data-manager/broker recon:theme
//       (OAuth 토큰 필요 — 없으면 @tdm/google `pnpm --filter @trade-data-manager/google login` 먼저)
import fs from "node:fs";
import path from "node:path";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { SheetThemeMembershipAdapter } from "../src/theme/sheetThemeMembershipAdapter.js";
import { DEFAULT_THEME_SHEET } from "../src/theme/sheetConfig.js";

async function main() {
    const client = createSheetsClient();
    const adapter = new SheetThemeMembershipAdapter(client, DEFAULT_THEME_SHEET);
    console.log(`시트=${DEFAULT_THEME_SHEET.spreadsheetId} 탭=${DEFAULT_THEME_SHEET.tab}`);

    const members = await adapter.load();
    // 정상 = 6자리 영숫자 대문자. KRX 가 숫자고갈로 5번째 자리에 알파벳 든 코드(예 0007C0)도 발행하므로
    // \d{6} 가 아니라 [0-9A-Z]{6} 가 canonical 성공 기준(이게 아니면 toCanonical 실패 = 진짜 이상).
    const badCodes = members.filter((m) => !/^[0-9A-Z]{6}$/.test(m.code));
    const themes = new Map<string, number>();
    for (const m of members) themes.set(m.theme, (themes.get(m.theme) ?? 0) + 1);

    console.log(`① 멤버 ${members.length}건 · 테마 ${themes.size}종`);
    console.log(
        `② 비표준 코드(6자리 아님): ${badCodes.length}건` +
            (badCodes.length
                ? ` → ${badCodes.slice(0, 10).map((m) => `${m.code}(${m.theme})`).join(", ")}`
                : " ✅"),
    );
    const top = [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log(`③ 테마 분포(상위 ${top.length}):`);
    for (const [t, n] of top) console.log(`   ${t}: ${n}`);
    console.log(
        `   샘플: ${members.slice(0, 6).map((m) => `${m.theme}/${m.code}${m.name ? `(${m.name})` : ""}`).join("  ")}`,
    );

    const dir = path.resolve(process.cwd(), "logs/raw-samples");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `theme-members-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(
        file,
        JSON.stringify({ config: DEFAULT_THEME_SHEET, count: members.length, members }, null, 2),
        "utf-8",
    );
    console.log(`💾 Saved: ${file}`);
}

main().catch((err) => {
    console.error("\n❌ 정찰 실패");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
