// live HTTP 경계의 종목코드 계약 — KRX 숫자고갈 영숫자 코드("0120G0")가 통과해야 한다.
//
// 이 테스트가 있는 이유: 네 컨트롤러가 각자 `/^\d{6}$/` 를 복붙해 갖고 있었고, 그래서 영숫자
// 종목을 짚으면 뉴스·테마 궤적·모니터링·백필이 한꺼번에 400 으로 죽었다(테마 궤적은 그 400 을
// "시트 미배정"으로 표시해 원인까지 감췄다). 판정은 core 불변식(isCanonicalStockCode) 하나뿐이라는
// 것을 경계에서 못 박는다 — 새 정규식이 다시 기어들어오면 여기서 걸린다.
//
// Nest 하네스 없이 컨트롤러를 직접 세운다(협력자는 최소 스텁). 보는 건 코드 가드 하나뿐이라
// 그 이상은 필요 없다.
import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ThemeController } from "../theme.controller.js";
import { NewsController } from "../news/news.controller.js";
import { TapeController } from "../tape/tape.controller.js";
import { AlertsController } from "../alerts/alerts.controller.js";
import type { LiveEngine } from "../engine/engine.js";
import type { LiveNewsService } from "../news/liveNews.js";
import type { LiveTape } from "../tape/tape.js";
import type { AlertConfigStore } from "../alerts/configStore.js";
import type { AlertsRuntime } from "../alerts/alertsRuntime.js";

const ALNUM = "0120G0"; // 실존 — 5번째 자리 알파벳(숫자고갈 발행분)
const PLAIN = "005930";

const engineStub = { themesOf: (): string[] => ["바이오"] } as unknown as LiveEngine;
const newsStub = { fetchBefore: async () => [] } as unknown as LiveNewsService;
const tapeStub = { requestBackfill: (): void => {} } as unknown as LiveTape;
const configStub = { addWatch: (): boolean => true } as unknown as AlertConfigStore;
const alertsStub = {} as unknown as AlertsRuntime;

describe("live 경계 — 종목코드 가드", () => {
    it("GET /theme/of — 영숫자 코드를 받는다", () => {
        expect(new ThemeController(engineStub).of(ALNUM)).toEqual({ themes: ["바이오"] });
        expect(new ThemeController(engineStub).of(PLAIN)).toEqual({ themes: ["바이오"] });
    });

    it("GET /news — 영숫자 코드를 받는다(code 는 선택이라 생략도 통과)", async () => {
        const c = new NewsController(newsStub);
        await expect(c.list(ALNUM)).resolves.toEqual([]);
        await expect(c.list(undefined)).resolves.toEqual([]);
    });

    it("POST /tape/backfill — 영숫자 코드를 받는다", () => {
        expect(new TapeController(tapeStub, engineStub).backfill({ code: ALNUM })).toEqual({ ok: true });
    });

    it("POST /watchlist — 영숫자 코드를 받는다", () => {
        expect(new AlertsController(configStub, alertsStub).addWatch({ code: ALNUM })).toEqual({ added: true });
    });

    // 넓힌 게 아니라 **옮긴** 것 — 비표준 표현(A접두·_접미·앞0 생략·소문자)은 여전히 400.
    // 정규화는 ingestion 경계(broker 시트 어댑터)의 몫이고 HTTP 경계는 조용히 보정하지 않는다.
    it.each(["A005930", "005930_AL", "5930", "0120g0", "", "007"])("비표준 표현 %o 는 여전히 거부", (bad) => {
        expect(() => new ThemeController(engineStub).of(bad)).toThrow(BadRequestException);
        expect(() => new TapeController(tapeStub, engineStub).backfill({ code: bad })).toThrow(BadRequestException);
        expect(() => new AlertsController(configStub, alertsStub).addWatch({ code: bad })).toThrow(BadRequestException);
    });
});
