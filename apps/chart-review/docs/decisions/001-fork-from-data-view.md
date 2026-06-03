# ADR-001: 차트 코어를 data-view에서 fork (그리고 data-view 제거)

## 상태

Accepted — SPEC-phase1/2 시점. data-view 앱은 이후(2026-06) 완전 제거됨.

---

## 맥락

매매 복기 도구(chart-review)를 새로 만들 때, 차트 렌더링 React 코드(일봉/분봉/오버레이, 크로스헤어 툴팁 등)가 이미 `apps/data-view`에 앱-로컬로 존재했다. 이걸 어떻게 재사용할지 결정해야 했다.

- data-view의 차트 코드는 공유 패키지가 아니라 그 앱 안에 묶여 있었다.
- data-view는 "더 키우지 않고 동결"하기로 한 상태였다(필터/정렬/수동입력은 시트가 더 잘함).
- chart-review는 복기에 특화된 다른 UX(타점 입력, 작업셋 순회, 단축키 중심)가 필요했다.

---

## 검토한 대안

**A. 공유 패키지로 추출 후 양쪽이 의존**
- 기각: data-view가 동결되므로 "공유 진화"의 명분이 없다. 추출 비용만 들고 두 앱이 한 코드에 묶여 변경이 서로를 침범한다.

**B. data-view에 복기 라우트만 추가**
- 기각: 동결 원칙 위반. 서로 다른 UX 요구가 한 앱에서 충돌한다.

**C. fork(복사 후 가지치기) — 채택**
- data-view → chart-review로 차트 코어를 같은 상대 경로로 복사하고, 복기에 불필요한 부분을 쳐낸다.

---

## 결정

차트 React 코어를 `apps/chart-review/src/components/chart/*`로 **fork**했다. 전역 DB 풀 변수명 등 충돌 가능 지점만 분리(`__chartReviewDbPool`)하고 나머지는 독립 진화시킨다.

---

## 결과

**장점**
- 두 앱이 서로의 변경에 영향받지 않는다. 복기 전용 인터랙션을 자유롭게 추가할 수 있었다.

**단점 / 후속**
- 코드 중복(차트 코어가 두 곳에). 단, data-view가 동결 대상이라 실질 유지보수 부담은 낮았다.
- 이후 data-view는 역할이 끝나 **완전히 제거**되었다(앱·문서 삭제, README/.env 정리). chart-review의 fork 코어는 이제 독립적으로 유지된다.
- 코드 주석·일부 문서에 "data-view에서 이식" 류의 출처 표기가 남아 있을 수 있다(역사적 참고).

---

## 관련

- 차트 코어 위치: `src/components/chart/`
- 초기 fork 매니페스트: [`spec/SPEC-phase2.md`](../spec/SPEC-phase2.md)
