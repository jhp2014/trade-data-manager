import { resolve } from "path";

export function defaultCaptureDir() {
  return process.env.CHART_REVIEW_TARGET_DIR
    ? resolve(process.env.CHART_REVIEW_TARGET_DIR)
    : resolve(process.cwd(), "../../trade-csv/chart-review-target");
}

export function defaultMainDir() {
  return process.env.REVIEW_MAIN_DIR
    ? resolve(process.env.REVIEW_MAIN_DIR)
    : resolve(process.cwd(), "../../trade-csv/review-target/main");
}
