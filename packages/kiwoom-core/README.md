# @trade-data-manager/kiwoom-core

두 앱(market-eye, trade-data-manager)이 공유하는 키움증권 API 공통 레이어. 인증/토큰, REST(타입드 TR + 연속조회), WebSocket(실시간/조건검색), 멀티키 로테이션을 한곳에 모은다. **소비자는 호출하고 데이터만 받는다** — rate 페이싱·키 로테이션·429 failover·토큰 재발급·재시도는 내부에서 처리.

## 빠른 사용

```ts
import { createKiwoom } from "@trade-data-manager/kiwoom-core";

const kiwoom = createKiwoom(); // .env 에서 설정 로드, 기본 구현 배선
const daily = await kiwoom.rest.getDailyChartsByCount("005930", "20260515", 600);
```

WebSocket(별도 진입점 — REST 전용 소비자는 `ws` 의존성을 안 끌어옴):

```ts
import { createKiwoomWs } from "@trade-data-manager/kiwoom-core/ws";
const ws = createKiwoomWs(kiwoom);
await ws.connect();
```

## 멀티키 (rate limit 널널하게)

키움 한도는 **TR(api-id)당 초당 5건**. 키를 여러 개 넣으면 라운드로빈으로 분산해 **유효 처리량 = 키 개수 × 5건/초**(TR별)로 늘어난다. 페이지네이션 시퀀스는 한 키에 핀 고정해 `cont-yn`/`next-key` 커서가 안전하다.

`.env` (1~N개, 후방호환):

```
KIWOOM_APP_KEY=...        # 키 #1 (단일키면 이것만)
KIWOOM_SECRET_KEY=...
KIWOOM_APP_KEY_2=...      # 추가 키(선택)
KIWOOM_SECRET_KEY_2=...
KIWOOM_BASE_URL=https://...
KIWOOM_WS_URL=wss://...   # WS 쓸 때만
```

## 검수 (recon)

실제 API 를 때려 원시 응답을 `logs/raw-samples/` 에 적재 → 사람/AI 검수.

```
pnpm --filter @trade-data-manager/kiwoom-core recon:token     # 모든 키 토큰 발급 확인
pnpm --filter @trade-data-manager/kiwoom-core recon:daily 005930 20260515
pnpm --filter @trade-data-manager/kiwoom-core recon:minute 005930 20260515
pnpm --filter @trade-data-manager/kiwoom-core recon:rotation  # 키 로테이션 분포 확인
```

## 테스트

mock transport 로 실제 키움 없이 로테이션/failover/페이지네이션/토큰 로직을 검증.

```
pnpm --filter @trade-data-manager/kiwoom-core test
```

## 구조

- `config` — .env 파싱(멀티키 수집), tuning(rate/cooldown/retry).
- `transport` — HTTP POST 추상화(axios 기본, mock 주입).
- `tokenStore` — 토큰 캐시 추상화(파일 기본, appkey 해시로 키별 분리).
- `credential` / `credentialPool` — 키별 토큰·(키×TR) rate 시계·쿨다운, 라운드로빈+failover.
- `rest/client` — 타입드 TR 메서드 + 연속조회(핀 고정) + 재시도.
- `ws/client` — 단일 상주 WS(백오프 재연결·재로그인·half-open 복구). 풀과 무관, primary 토큰만 사용.

> 정본 merge: REST=trade-data-manager, Token=market-eye(force), WS=market-eye.
> 소비자(batch/market-eye) 이주는 후속 작업.
