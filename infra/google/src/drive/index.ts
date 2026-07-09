// @trade-data-manager/google — drive 서브패스(Layer 1: transport/IO).
// 본인 Google 계정 OAuth 로 Drive 파일을 만들고/올리고/지운다(drive.file 스코프).
// 패키지는 도메인을 모른다: 대상 폴더(folderId)·로컬 파일경로는 소비자가 인자로 넘긴다.

import type { OAuth2Client } from "google-auth-library";
import { createOAuthClient } from "../auth/index.js";
import { createGoogleapisTransport, type DriveTransport } from "./transport.js";
import { makeDriveClient, type DriveClient } from "./client.js";

export interface CreateDriveClientOptions {
    /** 인증 클라이언트. 생략 시 @trade-data-manager/google/auth 의 createOAuthClient() 자급. */
    auth?: OAuth2Client;
    /** 전송 구현 주입(테스트/대체). 생략 시 googleapis 구현. auth 보다 우선. */
    transport?: DriveTransport;
}

/**
 * Drive 클라이언트 생성.
 * - transport 주면 그대로(테스트 fake 등), 아니면 auth(없으면 자급)로 googleapis 전송 구성.
 * 소비자는 보통 인자 없이 `createDriveClient()` 만 부르면 된다.
 */
export function createDriveClient(opts: CreateDriveClientOptions = {}): DriveClient {
    const transport = opts.transport ?? createGoogleapisTransport(opts.auth ?? createOAuthClient());
    return makeDriveClient(transport);
}

export { makeDriveClient } from "./client.js";
export type { DriveClient, UploadFileInput, UploadOrUpdateInput } from "./client.js";
export type { DriveFile, UploadResult } from "./types.js";
export { DriveError } from "./errors.js";
export { createGoogleapisTransport } from "./transport.js";
export type { DriveTransport, DriveMedia } from "./transport.js";
