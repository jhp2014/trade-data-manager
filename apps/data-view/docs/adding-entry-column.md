# EntryRow 컬럼 추가·변경 가이드

## 수정해야 하는 파일

| 파일 | 할 일 |
|------|-------|
| `src/components/list/columns/definitions.tsx` | `COLUMNS` 배열에서 컬럼 추가·삭제·순서 변경 |

헤더 라벨, 셀 렌더, 너비, 정렬 기준이 모두 이 파일 한 곳에서 관리됩니다.  
`gridTemplate` 과 `EntryListHeader` 는 `COLUMNS` 배열을 자동으로 소비하므로 별도 수정이 필요 없습니다.

## 추가해야 하는 파일

셀 렌더링 로직이 복잡하면 `src/components/list/columns/renderers.tsx` 에 컴포넌트를 추가할 수 있습니다. 단순한 경우 `definitions.tsx` 의 `cell` 인라인에 작성해도 됩니다.

## 단계별 절차

### 1. ColumnDef 작성

`src/components/list/columns/definitions.tsx` 의 `COLUMNS` 배열에 항목을 추가합니다.

```ts
{
    id: "prevCloseChange",              // 고유 식별자
    header: "전일비",                    // 헤더 라벨
    description: "전일 종가 대비 등락률",  // (선택) 툴팁/문서용
    width: "100px",                      // 고정 너비 또는 "1fr"
    align: "right",                      // "left" | "right" | "center"
    accessor: (m) => m.closeRate,        // 정렬·접근용 원시값
    cell: (m) => <MetricChangeRate value={m.closeRate} />,  // 렌더
    sort: {
        key: "prevCloseChange",
        compare: (a, b) => (a.closeRate ?? -Infinity) - (b.closeRate ?? -Infinity),
    },
    visibility: { default: true, togglable: false },
},
```

### 2. 컬럼 순서 변경

배열 내 객체의 순서가 곧 화면 좌→우 순서입니다. 항목을 잘라내어 원하는 위치에 붙여넣습니다.

### 3. 컬럼 삭제

배열에서 해당 객체를 제거합니다. `grid-template-columns` 는 자동으로 재계산됩니다.

## 너비·정렬 규칙

- **고정 컬럼**: 숫자 지표처럼 내용 길이가 예측 가능하면 `"100px"` 같은 고정값을 씁니다.
- **가변 컬럼**: 종목명·테마명처럼 길이가 달라지는 컬럼은 `"1fr"` 을 써서 남는 공간을 흡수하도록 합니다.
- `width` 값들이 `grid-template-columns` 로 그대로 조합되므로, 합계가 컨테이너 너비를 크게 초과하지 않도록 합니다.

## 검증 방법

1. `pnpm dev` 로 서버를 시작합니다.
2. `/filtered` 에서 덱을 로드하고 헤더에 새 컬럼 라벨이 표시되는지 확인합니다.
3. 각 EntryRow 에 새 컬럼 데이터가 올바르게 렌더링되는지 확인합니다.
4. 정렬 기준을 정의했다면 정렬 UI에 항목이 추가되는지 확인합니다.
5. QHD(2560×1440) 와 FHD(1920×1080) 에서 레이아웃이 깨지지 않는지 확인합니다.

## 흔한 실수

- `accessor` 와 `cell` 이 서로 다른 필드를 참조하면 정렬 결과가 화면과 일치하지 않습니다.
- `width: "1fr"` 컬럼이 여러 개면 공간을 균등 분할합니다. 의도한 경우가 아니라면 한 개만 `fr` 로 지정하세요.
- `id` 값이 중복되면 React key 경고가 발생하고 정렬 기준이 혼동될 수 있습니다.
