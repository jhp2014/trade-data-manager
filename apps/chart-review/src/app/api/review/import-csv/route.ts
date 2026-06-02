import { NextResponse } from "next/server";
import { mkdir, readFile, readdir, rename, stat } from "fs/promises";
import { basename, join } from "path";
import { upsertReviewTargets } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { getCaptureDir } from "@/lib/captureDir";
import { parseCaptureCsv } from "@/lib/captureCsv";

export const dynamic = "force-dynamic";

const CAPTURE_RE = /^Capture-.*\.csv$/i;

async function listCaptureFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && CAPTURE_RE.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * GET /api/review/import-csv
 * 현재 CSV 디렉터리 경로/존재 여부/대기 중인 Capture 파일 수를 반환한다.
 */
export async function GET() {
  const { dir, source } = getCaptureDir();
  const exists = await dirExists(dir);
  let pending = 0;
  let pendingFiles: string[] = [];
  if (exists) {
    try {
      const files = await listCaptureFiles(dir);
      pending = files.length;
      pendingFiles = files.map((f) => basename(f)).slice(0, 20);
    } catch {
      /* 무시 */
    }
  }
  return NextResponse.json({ dir, source, exists, pending, pendingFiles });
}

/**
 * POST /api/review/import-csv
 * CSV 디렉터리의 Capture-*.csv 를 읽어 review_target 으로 upsert(중복 시 덮어쓰기)하고
 * 각 파일을 processed/ 로 이동한다. 라인값을 다시 수정하려면 processed 에서 빼면 재처리된다.
 */
export async function POST() {
  const { dir } = getCaptureDir();

  if (!(await dirExists(dir))) {
    return NextResponse.json(
      { error: `CSV 디렉터리를 찾을 수 없습니다: ${dir}` },
      { status: 400 },
    );
  }

  let files: string[];
  try {
    files = await listCaptureFiles(dir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (files.length === 0) {
    return NextResponse.json({
      ok: true,
      dir,
      totalFiles: 0,
      totalTargets: 0,
      processed: [],
      errors: [],
    });
  }

  const db = getDb();
  const processedDir = join(dir, "processed");
  await mkdir(processedDir, { recursive: true });

  const processed: { name: string; targets: number }[] = [];
  const errors: { name: string; error: string }[] = [];
  let totalTargets = 0;

  for (const file of files) {
    const name = basename(file);
    try {
      const content = await readFile(file, "utf8");
      const rows = parseCaptureCsv(content, name);
      await upsertReviewTargets(db, rows);
      await rename(file, join(processedDir, name));
      processed.push({ name, targets: rows.length });
      totalTargets += rows.length;
    } catch (err) {
      errors.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    dir,
    totalFiles: processed.length,
    totalTargets,
    processed,
    errors,
  });
}
