import { resolve } from "path";

/**
 * Capture(타겟) CSV 디렉터리 경로.
 * - CHART_REVIEW_TARGET_DIR 환경변수 우선.
 * - 미설정 시 레포 기준 기본 경로(../../trade-csv/chart-review-target).
 */
export function getCaptureDir(): { dir: string; source: "env" | "default" } {
  const env = process.env.CHART_REVIEW_TARGET_DIR?.trim();
  if (env) return { dir: resolve(env), source: "env" };
  return {
    dir: resolve(process.cwd(), "../../trade-csv/chart-review-target"),
    source: "default",
  };
}
