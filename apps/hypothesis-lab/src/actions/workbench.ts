"use server";

import { getDb } from "@/db/client";
import { DbHypothesisRepository } from "@/repositories/DbHypothesisRepository";
import { DbReviewCaseSource } from "@/repositories/DbReviewCaseSource";
import {
    createWorkingSetSource,
    type WorkingSetMode,
} from "@/repositories/workingSetSources";
import { readSheetTabs, readSheetValues } from "@/lib/sheet";
import { buildWorkingSet, type WorkingSetCase } from "@/services/workingSet";
import type { HypothesisSnapshot } from "@/domain/types";

function repo() {
    return new DbHypothesisRepository(getDb());
}
function reviewSource() {
    return new DbReviewCaseSource(getDb());
}
function sheetDep() {
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim();
    if (!spreadsheetId) return null;
    const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || "review";
    return { config: { spreadsheetId, tab }, read: readSheetValues };
}

/** 가설/태그/관계/링크 + 경고 전체 스냅샷. */
export async function loadSnapshotAction(): Promise<HypothesisSnapshot> {
    return repo().loadSnapshot();
}

/**
 * 연결된 시트(env GOOGLE_SHEETS_ID)의 탭 title 목록.
 * 시트 ID·자격증명이 없거나 조회 실패면 빈 배열(설정 모달에서 "탭 없음" 표시).
 */
export async function listSheetTabsAction(): Promise<string[]> {
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim();
    if (!spreadsheetId) return [];
    try {
        return await readSheetTabs(spreadsheetId);
    } catch {
        return [];
    }
}

/** 모드별 워킹셋(후보 caseId + review 값 + 스냅샷 링크상태). */
export async function loadWorkingSetAction(mode: WorkingSetMode): Promise<WorkingSetCase[]> {
    const r = repo();
    const rs = reviewSource();
    const source = createWorkingSetSource(mode, {
        reviewCaseSource: rs,
        repo: r,
        sheet: sheetDep(),
    });
    const caseIds = await source.listCaseIds();
    const [reviewCases, snapshot] = await Promise.all([rs.enrich(caseIds), r.loadSnapshot()]);
    return buildWorkingSet({ caseIds, reviewCases, snapshot });
}

export type CaseSnapshotInput = {
    caseId: string;
    stockCode: string;
    stockName: string | null;
    tradeDate: string;
    tradeTime: string | null;
};

/** 가설에 case 연결(연결 시 case snapshot 도 insert-if-absent). */
export async function linkCaseAction(input: {
    hypothesisId: string;
    case: CaseSnapshotInput;
}): Promise<void> {
    const r = repo();
    await r.ensureCase(input.case);
    await r.upsertCaseLink({ hypothesisId: input.hypothesisId, caseId: input.case.caseId });
}

/** 가설-case 연결 해제. */
export async function unlinkCaseAction(input: {
    hypothesisId: string;
    caseId: string;
}): Promise<void> {
    await repo().removeCaseLink(input);
}

/** 새 가설 생성. case 가 주어지면 곧바로 연결까지. */
export async function createHypothesisAction(input: {
    text: string;
    case?: CaseSnapshotInput;
}): Promise<{ id: string; code: string }> {
    const r = repo();
    const created = await r.createHypothesis({ text: input.text });
    if (input.case) {
        await r.ensureCase(input.case);
        await r.upsertCaseLink({ hypothesisId: created.id, caseId: input.case.caseId });
    }
    return created;
}
