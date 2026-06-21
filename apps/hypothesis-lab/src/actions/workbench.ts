"use server";

import { getDb } from "@/db/client";
import { DbHypothesisRepository } from "@/repositories/DbHypothesisRepository";
import { DbReviewCaseSource } from "@/repositories/DbReviewCaseSource";
import {
    createWorkingSetSource,
    type WorkingSetMode,
} from "@/repositories/workingSetSources";
import { readSheetTabs, readSheetValues } from "@/lib/sheet";
import { classifySheetError, type SheetErrorInfo } from "@/lib/sheetError";
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

/** sheet 모드에서 실제로 읽으려는 탭(모드 지정 > env 기본). 에러 안내 메시지용. */
function effectiveSheetTab(mode: WorkingSetMode): string {
    const fromMode = mode.kind === "sheet" ? mode.tab : undefined;
    return fromMode ?? (process.env.GOOGLE_SHEETS_TAB?.trim() || "review");
}

/** 워킹셋 로드 결과. sheet 읽기 실패 시 cases 는 비고 sheetError 로 사유를 알린다. */
export type WorkingSetResult = { cases: WorkingSetCase[]; sheetError?: SheetErrorInfo };

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

/**
 * 모드별 워킹셋(후보 caseId + review 값 + 스냅샷 링크상태).
 * sheet 모드에서 탭을 못 읽으면(throw) 에러를 삼켜 sheetError 로 반환 — 클라가
 * 안내와 함께 기간 모드로 전환한다. sheet 외 모드의 throw 는 그대로 표면화한다.
 */
export async function loadWorkingSetAction(mode: WorkingSetMode): Promise<WorkingSetResult> {
    const r = repo();
    const rs = reviewSource();
    const source = createWorkingSetSource(mode, {
        reviewCaseSource: rs,
        repo: r,
        sheet: sheetDep(),
    });
    let caseIds: string[];
    try {
        caseIds = await source.listCaseIds();
    } catch (err) {
        if (mode.kind !== "sheet") throw err;
        return { cases: [], sheetError: classifySheetError(err, effectiveSheetTab(mode)) };
    }
    const [reviewCases, snapshot] = await Promise.all([rs.enrich(caseIds), r.loadSnapshot()]);
    return { cases: buildWorkingSet({ caseIds, reviewCases, snapshot }) };
}

/**
 * 임의 caseId 목록을 워킹셋 행으로 enrich(History 레일·붙여넣기용).
 * 입력 순서를 보존하며 review/스냅샷에 없는 caseId 도 caseId 파싱으로 카드화한다.
 */
export async function loadCasesAction(caseIds: string[]): Promise<WorkingSetCase[]> {
    if (caseIds.length === 0) return [];
    const r = repo();
    const rs = reviewSource();
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

/**
 * 케이스 레벨 outcome(트레이드 결과) 설정. null=해제.
 * 가설에 한 번도 연결되지 않아 cases 행이 없는 케이스도 먼저 insert(ensureCase)해
 * UPDATE 가 0건이 되지 않게 한다.
 */
export async function setCaseOutcomeAction(input: {
    case: CaseSnapshotInput;
    outcome: string | null;
}): Promise<void> {
    const r = repo();
    await r.ensureCase(input.case);
    await r.setCaseOutcome({ caseId: input.case.caseId, outcome: input.outcome });
}

/** 케이스 자유 메모 설정. null=제거. cases 행이 없으면 먼저 insert. */
export async function setCaseNoteAction(input: {
    case: CaseSnapshotInput;
    note: string | null;
}): Promise<void> {
    const r = repo();
    await r.ensureCase(input.case);
    await r.setCaseNote({ caseId: input.case.caseId, note: input.note });
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
