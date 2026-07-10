import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createDriveClient } from "@trade-data-manager/google/drive";
import { config } from "./config";

/**
 * db-backup 의 Drive 도메인 글루.
 * 제네릭 Drive IO(생성/목록/삭제/upsert)는 @trade-data-manager/google/drive 에 있고
 * (패키지는 폴더·파일경로를 모른다), 여기서 백업 도구 고유의 것만 바인딩한다:
 *  - 대상 폴더 = config.gdrive.folderId
 *  - 로컬 파일 → 스트림(fs.createReadStream) + 이름(path.basename)
 * 인증은 createDriveClient 가 @trade-data-manager/google/auth 로 자급한다.
 */
const drive = createDriveClient();
const folderId = config.gdrive.folderId;

export type { DriveFile, UploadResult } from "@trade-data-manager/google/drive";

/** 백업 폴더에 새 파일 업로드. 파일 소유자는 인증한 사용자(15GB 사용). */
export function uploadFile(localPath: string, mimeType = "application/octet-stream") {
    return drive.uploadFile({
        folderId,
        name: path.basename(localPath),
        body: fs.createReadStream(localPath),
        mimeType,
    });
}

/** 폴더 내 (앱이 만든) 파일 목록. */
export function listFiles() {
    return drive.listFiles(folderId);
}

export function deleteFile(id: string) {
    return drive.deleteFile(id);
}

/** 같은 이름 파일이 있으면 내용 갱신, 없으면 생성 (manifest 용). 중복은 정리. */
export function uploadOrUpdate(localPath: string, mimeType = "application/json") {
    return drive.uploadOrUpdate({
        folderId,
        name: path.basename(localPath),
        body: fs.createReadStream(localPath),
        mimeType,
    });
}

/** Drive 파일(fileId)을 로컬 경로로 내려받는다(스트림 → 파일). restore --from-drive 용. */
export async function downloadTo(fileId: string, localPath: string): Promise<void> {
    const stream = await drive.downloadFile(fileId);
    await pipeline(stream, fs.createWriteStream(localPath));
}
