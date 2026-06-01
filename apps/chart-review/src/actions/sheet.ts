"use server";

import { config } from "dotenv";
import { resolve } from "path";
import { google } from "googleapis";
import { parseSheetValues } from "@/lib/parseSheet";
import type { SheetPointRow } from "@/types/review";

const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

config({ path: resolve(process.cwd(), "../../.env") });

export async function fetchSheetRowsAction(): Promise<SheetPointRow[]> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_ID");
  const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || "review";
  const auth = createSheetsAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetName(tab)}!A:ZZZ`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return parseSheetValues((res.data.values ?? []) as string[][]);
}

function createSheetsAuth() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: [SHEETS_READONLY_SCOPE],
    });
  }

  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [SHEETS_READONLY_SCOPE],
  });
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`[sheet] ${key} is required to read Google Sheets`);
  }
  return value;
}

function quoteSheetName(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}
