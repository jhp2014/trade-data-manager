# @trade-data-manager/lab

데이트레이딩 타점을 사람이 판단(비교·근거)으로 가르치고, AI 가 그 판단을 규칙으로 배워
"이런 상황에서는 이런 대응이 이런 확률"을 데이터로 찾아가는 실험실.

- 독립 저장소 `jhp2014/trade-lab` 에서 2026-10-16 `apps/lab` 으로 편입(squash import). 그 전 이력은 원 저장소의 `moved-to-tdm` 태그까지.
- 시장 데이터는 tdm api(읽기 전용 GET)에서 `/api/*` 프록시로 가져온다.
- 사람의 라벨·문서·판단은 별도 저장소 `trade-judgment`(로컬) 파일에 둔다 — 임시 판단 서버(`/judgment/*`)가 읽는다.
- 설계 문서: [DESIGN.md](./DESIGN.md)
