import { readdir } from "fs/promises";
import { join } from "path";

const EXCLUDED_DIRS = new Set(["processed", "failed", ".backup"]);

export async function listCaptureCsvFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^Capture-.*\.csv$/i.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();
}

export async function listMainCsvFiles(dir: string): Promise<string[]> {
  return listMainCsvFilesRecursive(dir);
}

async function listMainCsvFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...await listMainCsvFilesRecursive(path));
      }
      continue;
    }

    if (entry.isFile() && /^main-.*\.csv$/i.test(entry.name)) {
      files.push(path);
    }
  }

  return files.sort();
}
