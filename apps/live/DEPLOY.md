# apps/live 호스팅 (iwinv / OCI 등 상시 리눅스 박스)

실시간 모니터+알람 데몬(`apps/live`)을 24시간 상주 서버에 올리는 절차.
설계·배경은 메모리 `realtime-monitor-trader-design` / `two-plane-focus-data-routing`.

## 무엇이 어디서 도는가

- **서버(iwinv)**: `apps/live` 하나만. 엔진(조건검색 WS + ka10095 폴링) + 알람 평가 + 텔레그램 전송.
  **DB 없음** — 알람 설정은 JSON 파일 하나(`apps/live/data/live-alerts.json`).
- **로컬(집 PC)**: `apps/api`(DB)·`workbench`·nightly 수집 그대로. 워크벤치가 **Tailscale**로 서버 `apps/live`에 붙어 설정/모니터.
- **엔진은 하나뿐** — kiwoom app key가 IP 바인딩이라, 서버 IP로 등록하면 로컬에선 어차피 인증이 안 된다(단일 엔진이 자연 강제됨).

## 사전 준비 (당신 몫)

1. iwinv 인스턴스: **Ubuntu 24.04**, 1vCPU/1GB(공유형)면 충분.
2. **고정 공인 IP** 확인 — 이 IP를 kiwoom/kis 포털에 등록한다(아래 5단계). stop/start 해도 안 바뀌는지 확인.
3. GitHub 접근 — 저장소가 private면 서버에 **deploy key(읽기 전용 SSH 키)** 등록.

---

## 1. OS 준비 (swap · node · pnpm)

SSH 접속 후:

```bash
# --- swap 2GB (1GB 램에서 pnpm install OOM 방지 + 여유 버퍼) ---
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # 재부팅 후에도 유지

# --- node 22 (nodesource) ---
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# --- pnpm (corepack, package.json 의 pinned 버전 사용) ---
sudo corepack enable
node -v   # v22.x 확인
```

## 2. 저장소 클론

```bash
cd ~
# private 저장소면 deploy key(SSH) 등록 후 git@ URL, 아니면 https:
git clone https://github.com/jhp2014/trade-data-manager.git
cd trade-data-manager
pnpm install     # 워크스페이스 전체(빌드 불필요 — tsx 소스 소비). swap 덕에 1GB에서도 완주
```

## 3. 자격증명 .env 배치

각 인프라 패키지는 자기 폴더의 `.env`를 자급 로드한다. **서버에 필요한 최소 집합:**

| 파일 | 필요성 | 용도 |
|---|---|---|
| `infra/kiwoom/.env` | **필수** | 엔진(WS·시세·차트). 없으면 안 뜸 |
| `infra/google/.env` | 권장 | 테마 멤버십(순위 알람·테마 칩). 없으면 빈 테마로 degrade |
| `apps/live/.env` | **필수** | LIVE_* 설정 + 텔레그램 봇 토큰 |
| `infra/kis/.env` | 선택 | 실시간 뉴스(`/live/news`). 안 쓰면 생략 |
| `infra/telegram/.env` | 선택 | `LIVE_TELEGRAM_TRANSPORT=user`일 때만. 서버는 `bot` 쓰므로 보통 불필요 |

로컬에서 `scp`로 올리거나(`scp infra/kiwoom/.env user@서버:~/trade-data-manager/infra/kiwoom/.env`),
서버에서 `.env.example`을 복사해 직접 채운다. **권한은 `chmod 600`.**

`apps/live/.env` 핵심(자세한 건 `.env.example`):
```bash
LIVE_CONDITION_NAME=<영웅문 서버저장 조건식명>
LIVE_HOST=<Tailscale IP, 5단계에서>       # 공인 IP에 포트 안 열기
LIVE_TELEGRAM_TRANSPORT=bot
LIVE_TELEGRAM_BOT_TOKEN=<봇 토큰>
LIVE_TELEGRAM_CHAT_ID=<-100… 채널 id>
```

## 4. Tailscale (로컬 ↔ 서버 사설 연결)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up          # 뜨는 링크로 로그인(로컬과 같은 계정)
tailscale ip -4            # 100.x.x.x — 이 값을 apps/live/.env 의 LIVE_HOST 에 넣는다
```

로컬 PC에도 Tailscale 앱 설치 → **같은 계정** 로그인. 그러면 서버가 `100.x.x.x`로 보인다.

## 5. kiwoom/kis 포털에 서버 공인 IP 등록

- kiwoom(및 실시간 뉴스 쓰면 kis) 개발자 포털에서 **app key의 허용 IP**를 서버 **공인 IP**(Tailscale 100.x 아님!)로 등록/추가.
- **먼저 확인**: 키당 IP를 여러 개 등록할 수 있으면 → 기존 키에 서버 IP만 추가(2번째 키 불필요).
  안 되면 → 서버 전용 **2번째 app key** 발급(집 IP의 기존 키는 nightly 수집용으로 유지).

## 6. 방화벽 (공개 노출 금지)

`LIVE_HOST`를 Tailscale IP로 바인딩하면 공인 IP엔 애초에 포트가 안 열리지만, 이중 방어로 ufw:

```bash
sudo ufw allow 22/tcp            # SSH (가능하면 이것도 Tailscale로만 좁히면 더 안전)
sudo ufw --force enable
# 3002 는 열지 않는다 — Tailscale(tailscale0)로만 접근
```

## 7. 스모크 테스트 (systemd 등록 전 손으로 확인)

```bash
cd ~/trade-data-manager

# (a) Bot API 서버에서 뚫리나 — {"ok":true...} 나오면 성공
curl -s "https://api.telegram.org/bot<봇토큰>/getMe"

# (b) kiwoom 토큰이 서버 IP로 발급되나 (IP 등록 검증)
pnpm --filter @trade-data-manager/kiwoom exec tsx recon/01-token.ts

# (c) 알람 전송 end-to-end (가짜 발화 1건 → 채널 도착 확인)
pnpm --filter @trade-data-manager/live exec tsx scripts/test-alert.ts

# (d) 데몬 수동 기동 — 로그에 'live listening on http://100.x…:3002' + 5초마다 tick
pnpm --filter @trade-data-manager/live start
```

(a)가 실패하면 이 서버망도 Bot API 차단 → `LIVE_TELEGRAM_TRANSPORT=user`(+`infra/telegram/.env`)로 폴백하거나 ntfy 검토.

## 8. systemd 상주 등록

`/etc/systemd/system/tdm-live.service` (User·경로·pnpm 절대경로는 환경에 맞게):

```ini
[Unit]
Description=tdm live monitor (realtime + alerts)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/trade-data-manager
# which pnpm 로 확인한 절대경로로. corepack 이면 보통 /usr/bin/pnpm
ExecStart=/usr/bin/pnpm --filter @trade-data-manager/live start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tdm-live
journalctl -u tdm-live -f      # 로그 팔로우 (tick·🔔 발화 확인)
```

`Restart=always` + `enable`로 크래시·재부팅 자동 복구. 알람 설정(watchlist JSON)은 디스크에 남아 재기동 시 재구축된다.

## 9. 로컬 워크벤치를 서버로 연결

로컬 `apps/workbench/.env.local`:
```bash
LIVE_PROXY_TARGET=http://100.x.x.x:3002     # 서버 Tailscale IP
```
vite 재시작하면 실시간 플레인(보드·차트·뉴스·타겟 패널)이 서버에서 당겨온다. `apps/api`는 로컬 그대로.

---

## 운영 메모

- **업데이트**: `cd ~/trade-data-manager && git pull && pnpm install && sudo systemctl restart tdm-live`
- **알람 설정 위치**: `apps/live/data/live-alerts.json` (백업 대상). 워크벤치 타겟 패널에서 편집 = 이 파일에 기록.
- **로그**: `journalctl -u tdm-live -f` / 최근: `journalctl -u tdm-live -n 200`
- **조건검색 프레임 디버깅**: `apps/live/.env`에 `LIVE_WS_FRAME_LOG=logs/ws-frames.jsonl`
- **엔진은 한 곳만**: 서버가 도는 동안 로컬에서 `apps/live`를 또 띄우지 말 것(IP 바인딩상 어차피 인증 실패).
