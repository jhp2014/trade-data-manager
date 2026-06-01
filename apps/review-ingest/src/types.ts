import type { ReviewPointSeed, ReviewTargetSeed } from "@trade-data-manager/data-core";

export type { ReviewPointSeed, ReviewTargetSeed };

export type ParsedMainPoint = {
  target: ReviewTargetSeed;
  point: ReviewPointSeed;
};

export type ParsedMainCsv = {
  targets: ReviewTargetSeed[];
  points: ParsedMainPoint[];
};
