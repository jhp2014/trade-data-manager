---
name: deploy-live
description: apps/live를 iwinv VPS(라이브 서버)에 배포한다. 배포 전 갭 체크, 배포 실행, 배포 후 검증까지 안내. "라이브 배포해줘", "서버에 반영해줘", "live VPS 업데이트" 같은 요청에 사용.
---

# 라이브 배포 절차

서버는 `apps/live`가 바뀔 때만 배포하므로, 다른 패키지(workbench·api) 커밋이 쌓이는 동안 서버는 조용히 뒤처진다. **서버가 origin/main 최신이라고 가정하지 말 것** — 매번 1번부터 확인한다.

## 1. 갭 체크 (필수, 배포 전에 항상)

서버의 현재 브랜치/커밋 확인:

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "cd /root/trade-data-manager && git branch --show-current && git rev-parse --short HEAD"
```

로컬에서, 서버 HEAD와 origin/main 사이에 민감 경로가 바뀌었는지 확인 (`<서버HEAD>`는 위에서 얻은 값):

```bash
git log --oneline <서버HEAD>..origin/main -- apps/live contracts/wire core/market infra/kiwoom infra/kis infra/broker
```

- **갭이 작으면**(대개 `apps/live`만) → 2번으로 바로 진행.
- **갭이 크고 급한 버그 수정이면** → 서버 커밋 위에 `apps/live` 변경만 얹은 핫픽스 브랜치를 만드는 게 안전하다. 그 구간이 `apps/live` 무변경이었다면 깨끗이 적용된다(과거 실측 사례 있음). 사용자에게 갭 크기와 방식을 먼저 보고하고 진행 여부를 확인한다.

## 2. 배포 실행

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "cd /root/trade-data-manager && git pull && pnpm install && systemctl restart tdm-live"
```

프로덕션 서비스 재시작이므로, 실행 전 사용자에게 배포 대상(커밋 범위)을 확인받는다.

**주의**:
- `apps/live/.env`는 로컬↔서버 내용이 다르다 — **통째로 scp 금지**. 값 하나만 바꿀 땐 서버 파일을 직접 `sed`로 수정.
- `.env`에 값이 명시돼 있으면(예: `LIVE_POLL_MS`) 코드 기본값을 덮는다 — 서버 설정이 우선이라는 것 기억.

## 3. 배포 후 검증

**서버에서 `tsc` 절대 돌리지 말 것** — RAM 961MB라 V8 힙 초과로 OOM(`exit 134`). 코드 문제로 오독하기 쉽다. 검증은 런타임으로:

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "journalctl -u tdm-live -n 100"
```

로그에서 확인할 것: 정상 기동 메시지, `tick hot=NN`(폴링 주기), 키움 3키 로그인 성공, WS 연결 여부.

헬스 엔드포인트(포트 3002, 서버 로컬):

```bash
ssh -i ~/.ssh/tdm-live root@100.74.165.85 "curl -s localhost:3002/health"
```

`healthy:true` 확인.

## 참고

상세 절차·장애 대응은 `apps/live/RUNBOOK.md`(운영), 최초 세팅은 `apps/live/DEPLOY.md`.
