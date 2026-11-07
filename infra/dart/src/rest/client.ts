// OpenDART 원시 REST 클라이언트 — 포트를 모른다(도메인 미인지). core 포트 매핑은 infra/broker 가 한다.
// 토큰 발급도 자격증명 풀도 없다: 요청마다 쿼리 crtfc_key 하나가 전부.
// ⚠ 인증키는 get* 안에서만 붙인다. 에러 meta 의 params 는 키를 붙이기 전 값이다.
import { strFromU8, unzipSync } from "fflate";
import { DartError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { DartTuning } from "../config.js";
import type { DartTransport } from "../transport.js";
import { parseCorpCodeXml } from "./corpCodeXml.js";
import type {
    DartArchiveFile,
    DartCompany,
    DartCorpCode,
    DartDisclosureList,
    DartDisclosureQuery,
    DartStatus,
} from "./types.js";

export interface DartRestDeps {
    transport: DartTransport;
    apiKey: string;
    baseUrl: string;
    tuning: DartTuning;
    logger: Logger;
}

const STATUS_OK = "000";
const STATUS_NO_DATA = "013";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** zip 은 "PK" 로 시작한다. DART 는 실패해도 HTTP 200 + XML(`<result>`)을 주므로 이것으로 가른다. */
const isZip = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b;

export class DartRest {
    /** 다음 요청이 나갈 수 있는 가장 이른 시각(ms). 동시 호출이 와도 슬롯을 겹치지 않게 예약제로 준다. */
    private nextSlotAt = 0;

    constructor(private readonly deps: DartRestDeps) {}

    /** [corpCode.xml] 전 법인 고유번호 목록. 이름은 **현재** 값뿐이다(이력 없음). */
    async getCorpCodes(): Promise<DartCorpCode[]> {
        const files = await this.getZip("corpCode.xml", {});
        const xml = files.find((f) => /\.xml$/i.test(f.name));
        if (!xml) {
            throw new DartError("corpCode zip 안에 xml 이 없다", { files: files.map((f) => f.name) });
        }
        return parseCorpCodeXml(strFromU8(xml.bytes));
    }

    /** [company.json] 기업개황. */
    async getCompany(corpCode: string): Promise<DartCompany> {
        return this.getJson<DartCompany>("company.json", { corp_code: corpCode });
    }

    /** [list.json] 공시 검색. 결과 없음(013)은 list = [] 로 돌려준다. */
    async searchDisclosures(q: DartDisclosureQuery): Promise<DartDisclosureList> {
        const params: Record<string, string> = {};
        if (q.corpCode) params.corp_code = q.corpCode;
        if (q.bgnDe) params.bgn_de = q.bgnDe;
        if (q.endDe) params.end_de = q.endDe;
        if (q.lastReprtAt) params.last_reprt_at = q.lastReprtAt;
        if (q.pblntfTy) params.pblntf_ty = q.pblntfTy;
        if (q.pblntfDetailTy) params.pblntf_detail_ty = q.pblntfDetailTy;
        if (q.corpCls) params.corp_cls = q.corpCls;
        if (q.sort) params.sort = q.sort;
        if (q.sortMth) params.sort_mth = q.sortMth;
        if (q.pageNo !== undefined) params.page_no = String(q.pageNo);
        if (q.pageCount !== undefined) params.page_count = String(q.pageCount);
        const res = await this.getJson<DartDisclosureList>("list.json", params, [STATUS_NO_DATA]);
        return res.status === STATUS_NO_DATA ? { ...res, list: [] } : res;
    }

    /** [document.xml] 공시서류 원본 — 접수번호 하나의 zip 을 풀어 파일 목록으로. */
    async getDocumentFiles(rceptNo: string): Promise<DartArchiveFile[]> {
        return this.getZip("document.xml", { rcept_no: rceptNo });
    }

    /** JSON GET — HTTP status + 본문 status 를 함께 판정한다. allow 의 코드는 정상으로 통과. */
    private async getJson<T extends DartStatus>(
        apiId: string,
        params: Record<string, string>,
        allow: string[] = [],
    ): Promise<T> {
        const { transport, apiKey, baseUrl, logger } = this.deps;
        await this.gate();
        const res = await transport.getJson<T>(`${baseUrl}/${apiId}`, { crtfc_key: apiKey, ...params });
        if (res.status !== 200) {
            throw new DartError(`DART 요청 실패 [${apiId}] http=${res.status}`, { apiId, params, http: res.status });
        }
        const status = res.data?.status;
        if (status !== STATUS_OK && !allow.includes(status)) {
            throw new DartError(`DART 오류 [${apiId}] ${status}: ${res.data?.message}`, {
                apiId,
                params,
                status,
                message: res.data?.message,
            });
        }
        logger.debug(`${apiId} ok`, params);
        return res.data;
    }

    /** zip GET — 실패 응답(200 + XML)을 오류 코드로 풀어 던진다. */
    private async getZip(apiId: string, params: Record<string, string>): Promise<DartArchiveFile[]> {
        const { transport, apiKey, baseUrl, logger } = this.deps;
        await this.gate();
        const res = await transport.getBytes(`${baseUrl}/${apiId}`, { crtfc_key: apiKey, ...params });
        if (res.status !== 200) {
            throw new DartError(`DART 요청 실패 [${apiId}] http=${res.status}`, { apiId, params, http: res.status });
        }
        if (!isZip(res.data)) {
            // 서버가 요청을 되비출 경우를 막아, 무엇을 뽑거나 자르기 전에 먼저 키를 가린다.
            const body = strFromU8(res.data).split(apiKey).join("***");
            const status = /<status>\s*([^<]*?)\s*<\/status>/.exec(body)?.[1] ?? null;
            const message = /<message>\s*([^<]*?)\s*<\/message>/.exec(body)?.[1] ?? null;
            // 코드를 못 뽑으면(점검 페이지 등) 본문 앞부분을 남긴다.
            const bodyHead = status === null ? body.slice(0, 200) : undefined;
            throw new DartError(`DART 오류 [${apiId}] ${status}: ${message}`, { apiId, params, status, message, bodyHead });
        }
        let unzipped: Record<string, Uint8Array>;
        try {
            unzipped = unzipSync(res.data);
        } catch (err) {
            throw new DartError(`DART zip 해제 실패 [${apiId}]: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, {
                apiId,
                params,
                size: res.data.length,
            });
        }
        logger.debug(`${apiId} ok`, params);
        return Object.entries(unzipped).map(([name, bytes]) => ({ name, bytes }));
    }

    /** 최소 간격 예약. 지금이 슬롯보다 이르면 그만큼 재운다. */
    private async gate(): Promise<void> {
        const now = Date.now();
        const at = Math.max(now, this.nextSlotAt);
        this.nextSlotAt = at + this.deps.tuning.rateLimitMs;
        if (at > now) await sleep(at - now);
    }
}
