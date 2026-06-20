"use server";

import { getDb } from "@/db/client";
import { DbHypothesisRepository } from "@/repositories/DbHypothesisRepository";

function repo() {
    return new DbHypothesisRepository(getDb());
}

export async function updateHypothesisAction(input: {
    id: string;
    text?: string;
    status?: string;
}): Promise<void> {
    await repo().updateHypothesis(input);
}

export async function deleteHypothesisAction(id: string): Promise<void> {
    await repo().deleteHypothesis(id);
}

export async function addTagAction(input: { hypothesisId: string; tagName: string }): Promise<void> {
    await repo().addTag(input);
}

export async function removeTagAction(input: { hypothesisId: string; tagId: string }): Promise<void> {
    await repo().removeTag(input);
}

export async function upsertRelationAction(input: {
    fromHypothesisId: string;
    toHypothesisId: string;
    relationType: string;
    note?: string | null;
}): Promise<void> {
    await repo().upsertRelation(input);
}

export async function removeRelationAction(input: {
    fromHypothesisId: string;
    toHypothesisId: string;
    relationType: string;
}): Promise<void> {
    await repo().removeRelation(input);
}

export async function deleteRelationsByTypeAction(relationType: string): Promise<void> {
    await repo().deleteRelationsByType(relationType);
}
