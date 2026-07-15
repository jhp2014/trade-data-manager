# apps/live 운영 런북 (서버 상황별 대처)

집 PC(로컬)에서 iwinv 상주 서버(`apps/live`)를 다루는 **실전 명령 모음**.
처음 배포하는 사람 기준 — "이럴 땐 뭘 치면 되나"를 상황별로 정리했다.
설치·최초 세팅 절차는 [`DEPLOY.md`](./DEPLOY.md), 설계 배경은 메모리 `realtime-monitor-trader-design` / `live-vps-ops`.

> **주의:** DEPLOY.md 본문 예시는 `User=ubuntu` / `/home/ubuntu`로 쓰여 있지만,
> **실제 서버는 `root` 계정에 리포가 `/root/trade-data-manager`** 다. 아래 명령은 전부 실환경 기준.

---

## 0. 서버 좌표 (한눈에)

| 항목 | 값 |
|---|---|
| 접속 | `ssh -i ~/.ssh/tdm-live root@100.74.165.85` |
| Tailscale IP | `100.74.165.85` (로컬↔서버는 이걸로만 통신) |
| 공인 IP | `49.247.136.123` (kiwoom/kis 포털 IP 등록용. 접속엔 안 씀) |
| 리포 경로 | `/root/trade-data-manager` |
| systemd 서비스 | `tdm-live` (상시 상주, 크래시·재부팅 자동복구) |
| 포트 | `3002` (Tailscale 인터페이스에만 바인딩 — 공인망 노출 안 됨) |
| node / pnpm | v22 / pnpm 10 (corepack) |
| 로컬 SSH 키 | `~/.ssh/tdm-live` (PowerShell도 같은 경로) |

**로컬 워크벤치가 서버를 바라보는 설정:** `apps/workbench/.env.local` 의
`LIVE_PROXY_TARGET=http://100.74.165.85:3002` (이미 설정됨). 이 값으로 vite `/live` 프록시가 서버로 간다.

---

## 1. 접속

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85
```

한 줄 원격 실행(접속 안 하고 명령만 던지기):

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl status tdm-live --no-pager"
```

> 처음 접속 시 "Host key verification failed" 가 나면 신뢰 등록:
> `ssh -i ~/.ssh/tdm-live -o StrictHostKeyChecking=accept-new root@100.74.165.85 "echo ok"`

---

## 2. 살아있나 확인 (헬스체크)

가장 빠른 3종. 로컬에서 바로 실행 가능(Tailscale 켜져 있어야 함).

```bash
# (a) HTTP 헬스 — {"ok":true,"service":"live"} 나오면 프로세스 정상
curl -s http://100.74.165.85:3002/health

# (b) 실시간 뉴스 — 200 + JSON 배열이면 KIS까지 정상
curl -s -o /dev/null -w "%{http_code}\n" http://100.74.165.85:3002/news

# (c) 서비스 상태 + 최근 로그
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl status tdm-live --no-pager -n 5"
```

`active (running)` + tick 로그가 돌면 정상. `failed`/`inactive`면 → **§6 장애 대응**.

주요 엔드포인트(전부 `http://100.74.165.85:3002` 기준, 워크벤치는 `/live` 프록시로 접근):

| 경로 | 용도 |
|---|---|
| `GET /health` | 부팅 확인 |
| `GET /stream` (SSE) | 실시간 보드 스트림 |
| `GET /snapshot` | 폴백 스냅샷 |
| `GET /news` | 실시간 뉴스(KIS) |
| `GET /chart` | 실시간 차트 |
| `GET /conditions`·`POST /condition` | 조건검색 목록/선택 |
| `GET/POST /watchlist`·`POST /alerts` | 알람 타겟/설정 |

---

## 3. 로그 보기

```bash
# 실시간 팔로우 (Ctrl+C 로 빠져나옴) — tick·🔔 발화가 흐르는지
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live -f"

# 최근 200줄
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live -n 200 --no-pager"

# 에러만 골라보기
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live -n 500 --no-pager | grep -iA10 error | tail -80"

# 특정 시간대 (예: 오늘 10시대)
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live --since '10:00' --until '11:00' --no-pager"
```

읽는 법:
- `[LiveEngine] tick hot=NN polled=NN` — 엔진 정상 심박(수 초마다). 이게 멈추면 엔진이 죽은 것.
- `[kiwoom] 키움 요청 성공 [ka100xx]` — 시세/차트 폴링 정상.
- `ERROR [ExceptionsHandler] KIS 자격증명이 없습니다` — `infra/kis/.env` 누락 → **§5 env 전송**.
- `키움 인증 거부` / `EGW00xxx` — 토큰·IP 등록 문제 → **§7**.

---

## 4. 코드 업데이트 (git push → 서버 반영)

**흐름:** 로컬에서 커밋·푸시 → 서버에서 pull → 의존성 반영 → 재시작.
`apps/live`는 빌드 없이 `tsx`로 소스를 직접 돌리므로 **빌드 단계 없음**.

```bash
# 1) 로컬 (이 리포에서)
git push origin main

# 2) 서버 반영 (로컬에서 원격 한 방)
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "cd /root/trade-data-manager && git pull && pnpm install && systemctl restart tdm-live && echo '--- 재시작됨 ---' && sleep 4 && systemctl is-active tdm-live"
```

`pnpm install`은 의존성이 바뀌었을 때만 실제로 뭔가 한다(안 바뀌면 수 초, 무해). 확신 없으면 그냥 항상 넣어도 된다.

> **와이어 계약이 바뀐 배포(예: 이중-시장 base_pric 변경)는 서버(`apps/live`)와 로컬 워크벤치를
> 반드시 동시에 올려야** 한다 — 한쪽만 갱신하면 타입 계약이 어긋난다. (메모리 `dual-market-board-design` 참고.)

재시작만 필요할 때(코드 변경 없이):

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl restart tdm-live"
```

---

## 5. env(자격증명) 전송

서버는 각 인프라 패키지 폴더의 `.env`를 자급 로드한다. **로컬에서 고친 .env를 서버로 복사 → 권한 → 재시작.**

> **반드시 리포 루트에서 실행**하거나 절대경로를 써라. 상대경로 `infra/kis/.env`는
> 셸이 다른 폴더에 있으면 "No such file or directory" 가 난다(이번에 겪은 함정).

> ⚠️ **`apps/live/.env`는 로컬↔서버가 다른 파일이다 — 통째로 scp 금지**(2026-07-15 실사고).
> 서버 전용 키가 로컬본에 없어서 덮어쓰면 소실된다:
> - `LIVE_HOST=100.74.165.85` — 없으면 **0.0.0.0 바인딩 = 공인망 노출**(ufw 없음!)
> - `LIVE_TELEGRAM_TRANSPORT=bot` — 로컬은 `user`(KT망 Bot API 차단). 서버가 user 로 바뀌면 폰 푸시 죽음.
> 값 하나만 바꿀 땐 서버에서 직접 편집하거나 `ssh ... "sed -i ..."`. append 시엔 원본 끝 개행 유무 확인
> (개행 없으면 이전 줄에 붙어 **두 키가 같이 오염**된다 — `echo >>` 전에 `tail -c1` 확인).

```bash
# 예: KIS 자격증명 (실시간 뉴스). 리포 루트에서:
scp -i ~/.ssh/tdm-live infra/kis/.env root@100.74.165.85:/root/trade-data-manager/infra/kis/.env

# 절대경로 버전 (어느 폴더에서 쳐도 안전)
scp -i ~/.ssh/tdm-live ~/Dev/trade-data-manager/infra/kis/.env root@100.74.165.85:/root/trade-data-manager/infra/kis/.env

# 권한 조이고 재시작
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "chmod 600 /root/trade-data-manager/infra/kis/.env && systemctl restart tdm-live"
```

서버에 필요한 .env 집합(자세히는 DEPLOY.md §3):

| 파일 | 필요성 |
|---|---|
| `infra/kiwoom/.env` | **필수** (엔진 — 없으면 안 뜸) |
| `apps/live/.env` | **필수** (LIVE_* + 텔레그램 봇 토큰) |
| `infra/kis/.env` | 실시간 뉴스 쓰면 필요 (없으면 `/news`만 500) |
| `infra/google/.env` | 테마 멤버십 (없으면 빈 테마로 degrade) |

전송 후 확인: `ssh ... "ls -la /root/trade-data-manager/infra/kis/.env"` 로 존재·권한(`-rw-------`) 확인.

---

## 6. 장애 대응 (안 뜰 때 순서대로)

**증상: 워크벤치 실시간 패널이 비거나 에러.** 아래를 위에서부터.

```bash
# 1) 로컬 Tailscale 켜져 있나 (서버가 100.x 로 보이나)
ping -n 2 100.74.165.85      # PowerShell/CMD.  Bash면 ping -c 2

# 2) 서버 프로세스 살아있나
curl -s http://100.74.165.85:3002/health         # {"ok":true...} 안 나오면 3)

# 3) 서비스 상태·로그
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl status tdm-live --no-pager -n 20"

# 4) 죽었으면 재시작 + 부팅 로그 관찰
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl restart tdm-live && journalctl -u tdm-live -n 40 --no-pager"
```

로그에서 원인별 분기:
- `KIS 자격증명이 없습니다` → §5 로 `infra/kis/.env` 전송.
- `키움 자격증명이 없습니다` / 부팅 실패 → `infra/kiwoom/.env` 전송(필수).
- `키움 인증 거부` / `EGW`·IP 관련 → §7 (IP 등록).
- tick 로그는 도는데 특정 패널만 빔 → 그 엔드포인트만 curl 로 찍어보고(§2) 해당 소스 .env 점검.
- 로그가 아예 안 늘어남 / `Restart`가 반복 → 크래시 루프. `journalctl -n 100` 로 스택트레이스 확인.

> systemd가 `Restart=always`라 크래시·재부팅은 자동 복구된다. 알람 설정(watchlist JSON)도
> 디스크에 남아 재기동 시 복원되므로, 대개 **재시작 한 방**이면 끝난다.

---

## 7. IP 등록 / 토큰 관련

- **kiwoom·kis 포털의 앱키 허용 IP**에는 서버 **공인 IP `49.247.136.123`** 를 등록한다(Tailscale 100.x 아님).
  `키움 인증 거부`·`EGW`류가 뜨면 이 IP 등록이 빠졌거나 IP가 바뀐 것부터 의심.
- **토큰 캐시 위치**: `infra/<broker>/.cache/<broker>-tokens/<키해시>.json`. 24h 유효, 자동 갱신.
- 토큰이 꼬였다고 의심되면(드묾) 캐시를 지우고 재시작하면 다음 요청에서 새로 발급:
  ```bash
  ssh -i ~/.ssh/tdm-live root@100.74.165.85 "rm -f /root/trade-data-manager/infra/kis/.cache/kis-tokens/*.json && systemctl restart tdm-live"
  ```
- **로컬·서버가 같은 앱키를 공유해도 안전**: 두 증권사 모두 유효기간 내 재발급 시 같은 토큰을 돌려준다
  (KIS 실측 확정, 키움 정황상 유력). 서로의 토큰을 무효화하지 않는다. 자세히는 메모리 `live-vps-ops`.
  ⚠️ 단 키움은 **아직 정황**이다 — 2026-07-15 밤 캐시 토큰이 `expires_dt` 상 유효한데도 키움이 거부한
  사례가 있다(아래). 왜 그 키만 옛 토큰에 머물렀는지는 **규명 안 됨** — 이 줄을 근거로 단정하지 말 것.
- **`LOGIN 실패 (805004) Token이 유효하지 않습니다`** (2026-07-15 실측): WS 는 `primaryToken`=credentials[0]
  한 키만 쓰는데(REST 는 풀 로테이션) 그 키의 캐시 토큰이 만료 전인데도 키움이 거부 → 캐시는
  `expires_dt` 만 보므로 서버측 무효를 모른다. **이제 자가치유된다**(main `1662353`: `autoRetryFirstConnect`
  재시도가 `forceTokenRefresh` 를 격발 → 강제 재발급). 위 캐시 삭제는 **폴백**으로 강등 — 그래도 안 풀리면 쓸 것.
  키움 캐시 경로는 `infra/kiwoom/.cache/kiwoom-tokens/*.json`(위 예시는 kis).

---

## 8. 알람 테스트 / 설정 위치

```bash
# 가짜 발화 1건 → 텔레그램 채널 도착 확인 (end-to-end)
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "cd /root/trade-data-manager && pnpm --filter @trade-data-manager/live exec tsx scripts/test-alert.ts"

# 봇 토큰이 서버망에서 뚫리나
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "curl -s https://api.telegram.org/bot<봇토큰>/getMe"
```

- **알람 설정 파일**: `apps/live/data/live-alerts.json` (백업 대상). 워크벤치 타겟 패널 편집 = 이 파일에 기록.
- **조건검색 프레임 디버깅**: `apps/live/.env` 에 `LIVE_WS_FRAME_LOG=logs/ws-frames.jsonl` 추가.

---

## 자주 쓰는 원라이너 (복붙용)

```bash
# 헬스
curl -s http://100.74.165.85:3002/health

# 로그 팔로우
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live -f"

# 코드 업데이트 풀세트
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "cd /root/trade-data-manager && git pull && pnpm install && systemctl restart tdm-live && sleep 4 && systemctl is-active tdm-live"

# 재시작만
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "systemctl restart tdm-live"

# env 올리고 재시작 (KIS 예시, 리포 루트에서)
scp -i ~/.ssh/tdm-live infra/kis/.env root@100.74.165.85:/root/trade-data-manager/infra/kis/.env && ssh -i ~/.ssh/tdm-live root@100.74.165.85 "chmod 600 /root/trade-data-manager/infra/kis/.env && systemctl restart tdm-live"
```
