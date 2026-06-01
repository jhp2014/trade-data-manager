import { config } from "dotenv";
import { resolve } from "path";
import { fetchSheetRowsAction } from "@/actions/sheet";
import { mockSheetRows } from "@/mock/sheetRows";
import type { SheetPointRow } from "@/types/review";

config({ path: resolve(process.cwd(), "../../.env") });

export async function loadSheetRows(): Promise<SheetPointRow[]> {
  if (hasSheetsEnv()) {
    console.info("[sheet] loading rows from Google Sheets");
    return fetchSheetRowsAction();
  }

  console.info("[sheet] Google Sheets env is incomplete; using mock rows");
  return mockSheetRows;
}

function hasSheetsEnv() {
  const hasSheet = Boolean(process.env.GOOGLE_SHEETS_ID?.trim());
  const hasKeyFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const hasInlineKey = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
  return hasSheet && (hasKeyFile || hasInlineKey);
}
