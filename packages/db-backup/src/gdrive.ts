import fs from "node:fs";
import path from "node:path";
import { google, type drive_v3 } from "googleapis";
import { createOAuthClient } from "@trade-data-manager/google/auth";
import { config } from "./config";

/**
 * drive.file 스코프: 앱(이 백업 도구)이 만든 파일만 접근.
 * → 목록/삭제가 우리 백업 + manifest 에만 작용하므로 안전하다.
 * 인증은 @trade-data-manager/google/auth 로 위임(본인 계정 OAuth, drive·sheets 공용 토큰).
 */
let client: drive_v3.Drive | null = null;

function getDrive(): drive_v3.Drive {
    if (client) return client;
    client = google.drive({ version: "v3", auth: createOAuthClient() });
    return client;
}

export interface DriveFile {
    id: string;
    name: string;
}

/** 업로드 파일의 md5/size (무결성 검증용). */
export interface UploadResult {
    id: string;
    md5Checksum: string;
    size: string;
}

/** 백업 폴더에 새 파일 업로드. 파일 소유자는 인증한 사용자(15GB 사용). */
export async function uploadFile(
    localPath: string,
    mimeType = "application/octet-stream",
): Promise<UploadResult> {
    const res = await getDrive().files.create({
        requestBody: { name: path.basename(localPath), parents: [config.gdrive.folderId] },
        media: { mimeType, body: fs.createReadStream(localPath) },
        fields: "id, md5Checksum, size",
        supportsAllDrives: true,
    });
    return {
        id: res.data.id!,
        md5Checksum: res.data.md5Checksum ?? "",
        size: res.data.size ?? "",
    };
}

/** 폴더 내 (앱이 만든) 파일 목록. */
export async function listFiles(): Promise<DriveFile[]> {
    const drive = getDrive();
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
        const res = await drive.files.list({
            q: `'${config.gdrive.folderId}' in parents and trashed = false`,
            fields: "nextPageToken, files(id, name)",
            pageSize: 1000,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        for (const f of res.data.files ?? []) {
            if (f.id && f.name) out.push({ id: f.id, name: f.name });
        }
        pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
}

export async function deleteFile(id: string): Promise<void> {
    await getDrive().files.delete({ fileId: id, supportsAllDrives: true });
}

/** 같은 이름 파일이 있으면 내용 갱신, 없으면 생성 (manifest 용). 중복은 정리. */
export async function uploadOrUpdate(localPath: string, mimeType = "application/json"): Promise<void> {
    const drive = getDrive();
    const name = path.basename(localPath);
    const existing = (await listFiles()).filter((f) => f.name === name);
    if (existing.length > 0) {
        await drive.files.update({
            fileId: existing[0].id,
            media: { mimeType, body: fs.createReadStream(localPath) },
            supportsAllDrives: true,
        });
        for (const dup of existing.slice(1)) await deleteFile(dup.id);
    } else {
        await drive.files.create({
            requestBody: { name, parents: [config.gdrive.folderId] },
            media: { mimeType, body: fs.createReadStream(localPath) },
            fields: "id",
            supportsAllDrives: true,
        });
    }
}
