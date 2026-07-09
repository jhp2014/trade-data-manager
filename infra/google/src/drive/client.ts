import type { Readable } from "node:stream";
import type { DriveFile, UploadResult } from "./types.js";
import type { DriveTransport } from "./transport.js";

/** mimeType 생략 시 기본. 소비자는 도구 고유 기본(예: json)을 직접 넘길 수 있다. */
const DEFAULT_MIME = "application/octet-stream";

export interface UploadFileInput {
    folderId: string;
    name: string;
    /** 콘텐츠 스트림(1회 소비). 소비자가 로컬 파일 등에서 만든다. */
    body: Readable;
    /** 기본 "application/octet-stream". */
    mimeType?: string;
}

export interface UploadOrUpdateInput {
    folderId: string;
    name: string;
    body: Readable;
    /** 기본 "application/octet-stream". */
    mimeType?: string;
}

export interface DriveClient {
    /** 폴더에 새 파일 업로드. id/md5/size 반환. */
    uploadFile(input: UploadFileInput): Promise<UploadResult>;
    /** 폴더 내 (앱이 만든) 파일 목록. */
    listFiles(folderId: string): Promise<DriveFile[]>;
    deleteFile(fileId: string): Promise<void>;
    /** 같은 이름 파일이 있으면 내용 갱신, 없으면 생성. 중복(동명 2+)은 최신 1개만 남기고 정리. */
    uploadOrUpdate(input: UploadOrUpdateInput): Promise<void>;
}

/**
 * transport 위에 upsert/dedup 조립을 얹은 Drive 클라이언트.
 * googleapis 에 비의존(transport 만 안다) → fake transport 로 단위 테스트 가능.
 * **어느 폴더/어떤 파일경로인지는 모른다**(호출 인자로 받음) — 도메인은 소비자 몫.
 */
export function makeDriveClient(transport: DriveTransport): DriveClient {
    return {
        uploadFile({ folderId, name, body, mimeType = DEFAULT_MIME }) {
            return transport.createFile(folderId, name, { mimeType, body });
        },

        listFiles(folderId) {
            return transport.listFilesInFolder(folderId);
        },

        deleteFile(fileId) {
            return transport.deleteFile(fileId);
        },

        async uploadOrUpdate({ folderId, name, body, mimeType = DEFAULT_MIME }) {
            const existing = (await transport.listFilesInFolder(folderId)).filter((f) => f.name === name);
            if (existing.length > 0) {
                await transport.updateFile(existing[0].id, { mimeType, body });
                // 과거 실행이 남긴 동명 중복 정리(첫 1개만 유지).
                for (const dup of existing.slice(1)) await transport.deleteFile(dup.id);
            } else {
                await transport.createFile(folderId, name, { mimeType, body });
            }
        },
    };
}
