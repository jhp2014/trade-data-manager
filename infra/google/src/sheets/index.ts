// @trade-data-manager/google — sheets 서브패스(Layer 1: transport/IO).
// 순수 매트릭스 헬퍼(Layer 2)는 별도 진입점 "@trade-data-manager/google/sheets/matrix" — googleapis 안 끌어옴.

import type { OAuth2Client } from "google-auth-library";
import { createOAuthClient } from "../auth/index.js";
import { createGoogleapisTransport, type SheetsTransport } from "./transport.js";
import { makeSheetsClient, type SheetsClient } from "./client.js";

export interface CreateSheetsClientOptions {
    /** 인증 클라이언트. 생략 시 @trade-data-manager/google/auth 의 createOAuthClient() 자급. */
    auth?: OAuth2Client;
    /** 전송 구현 주입(테스트/대체). 생략 시 googleapis 구현. auth 보다 우선. */
    transport?: SheetsTransport;
}

/**
 * 시트 클라이언트 생성.
 * - transport 주면 그대로(테스트 mock 등), 아니면 auth(없으면 자급)로 googleapis 전송 구성.
 * 소비자는 보통 인자 없이 `createSheetsClient()` 만 부르면 된다.
 */
export function createSheetsClient(opts: CreateSheetsClientOptions = {}): SheetsClient {
    const transport = opts.transport ?? createGoogleapisTransport(opts.auth ?? createOAuthClient());
    return makeSheetsClient(transport);
}

export { makeSheetsClient } from "./client.js";
export type {
    SheetsClient,
    ReadMatrixOptions,
    OverwriteTabInput,
    AppendRowsInput,
} from "./client.js";
export type { ValueInputOption, ValueRenderOption } from "./types.js";
export { SheetsError, isMissingTabError } from "./errors.js";
export { createGoogleapisTransport } from "./transport.js";
export type { SheetsTransport } from "./transport.js";
