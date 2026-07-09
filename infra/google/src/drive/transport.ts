import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { Readable } from "node:stream";
import type { DriveFile, UploadResult } from "./types.js";
import { DriveError } from "./errors.js";

/** 업로드/갱신에 실을 미디어(콘텐츠 스트림 + MIME). body 는 1회 소비 스트림. */
export interface DriveMedia {
    mimeType: string;
    body: Readable;
}

/**
 * Drive 저수준 연산 추상화. 기본은 googleapis 구현이지만 주입형이라
 * - 테스트에서 fake 로 교체(네트워크 없이 upsert/dedup 로직 검증)
 * - 미래에 다른 전송으로 교체
 * 가 가능하다. **googleapis 를 import 하는 곳은 이 파일뿐** — client 로직은 비의존.
 */
export interface DriveTransport {
    /** 폴더에 새 파일 생성. id/md5/size 반환. */
    createFile(folderId: string, name: string, media: DriveMedia): Promise<UploadResult>;
    /** 기존 파일의 내용 갱신(메타 불변). */
    updateFile(fileId: string, media: DriveMedia): Promise<void>;
    /** 폴더 내 (앱이 만든) 파일 목록. 페이지네이션은 여기서 흡수. */
    listFilesInFolder(folderId: string): Promise<DriveFile[]>;
    deleteFile(fileId: string): Promise<void>;
}

/** googleapis 에러를 DriveError(meta.status 포함)로 정규화. */
function wrap(err: unknown, op: string, meta: Record<string, unknown> = {}): DriveError {
    const status =
        (err as { code?: number; status?: number })?.code ??
        (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : String(err);
    return new DriveError(`[drive] ${op} 실패: ${message}`, { op, status, ...meta });
}

/**
 * OAuth2 클라이언트로 인증된 googleapis Drive 전송 구현.
 * drive.file 스코프: 앱이 만든 파일만 접근 → 목록/삭제가 우리 파일에만 작용해 안전.
 * 공유 드라이브도 지원(supportsAllDrives).
 */
export function createGoogleapisTransport(auth: OAuth2Client): DriveTransport {
    const drive: drive_v3.Drive = google.drive({ version: "v3", auth });
    return {
        async createFile(folderId, name, media) {
            try {
                const res = await drive.files.create({
                    requestBody: { name, parents: [folderId] },
                    media: { mimeType: media.mimeType, body: media.body },
                    fields: "id, md5Checksum, size",
                    supportsAllDrives: true,
                });
                return {
                    id: res.data.id!,
                    md5Checksum: res.data.md5Checksum ?? "",
                    size: res.data.size ?? "",
                };
            } catch (err) {
                throw wrap(err, "createFile", { name });
            }
        },
        async updateFile(fileId, media) {
            try {
                await drive.files.update({
                    fileId,
                    media: { mimeType: media.mimeType, body: media.body },
                    supportsAllDrives: true,
                });
            } catch (err) {
                throw wrap(err, "updateFile", { fileId });
            }
        },
        async listFilesInFolder(folderId) {
            try {
                const out: DriveFile[] = [];
                let pageToken: string | undefined;
                do {
                    const res = await drive.files.list({
                        q: `'${folderId}' in parents and trashed = false`,
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
            } catch (err) {
                throw wrap(err, "listFilesInFolder", { folderId });
            }
        },
        async deleteFile(fileId) {
            try {
                await drive.files.delete({ fileId, supportsAllDrives: true });
            } catch (err) {
                throw wrap(err, "deleteFile", { fileId });
            }
        },
    };
}
