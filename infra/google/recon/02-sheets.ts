/**
 * sheets 스모크 체크(읽기 전용). googleapis 전송이 실제 시트와 통신하는지 확인한다.
 * 실행: pnpm --filter @trade-data-manager/google recon:sheets
 * 사전조건: 루트 .env 의 GOOGLE_SHEETS_ID(어느 시트 = 소비자 설정), 통합 스코프 토큰(login).
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { packageRoot } from "../src/paths.js";
import { createSheetsClient } from "../src/sheets/index.js";

// recon 편의: "어느 시트를 읽을지"는 소비자 설정이라 루트 .env 에서 가져온다(패키지 자급 대상 아님).
loadDotenv({ path: resolve(packageRoot, "../../.env") });

async function main(): Promise<void> {
    const id = process.env.GOOGLE_SHEETS_ID?.trim();
    if (!id) throw new Error("GOOGLE_SHEETS_ID 가 필요합니다(루트 .env).");

    const sheets = createSheetsClient();

    const tabs = await sheets.listTabs(id);
    console.log(`✅ listTabs OK — ${tabs.length}개: ${tabs.join(", ")}`);

    const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || tabs[0];
    if (!tab) throw new Error("읽을 탭이 없습니다.");

    const matrix = await sheets.readMatrix(id, tab);
    console.log(`✅ readMatrix('${tab}') OK — ${matrix.length}행 x ${matrix[0]?.length ?? 0}열`);
    console.log(`   헤더: ${(matrix[0] ?? []).slice(0, 8).join(" | ")}`);
}

main().catch((err) => {
    console.error("❌ sheets 스모크 실패:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
