import type { Group, GroupAttachment, ChartGroupAttachment, ChartRef, ReviewPointKey } from "#domain";

// 타점 그룹 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 사전(groups)과 부착(review_point_tags)이 한 슬라이스인 이유: 둘은 늘 같이 읽힌다(팔레트 = 사전 + 빈도).
// 자세한 설계는 domain/review/group.ts.

/** 그룹 조회(읽기). 사전 + 전 타점 부착 피드. */
export interface GroupReader {
    /** 그룹 사전 전체(이름 오름차순 — 팔레트 순서를 서버가 고정해 클라마다 흔들리지 않게). */
    listGroups(): Promise<Group[]>;
    /**
     * 전 타점의 부착을 한 번에(그룹이 하나라도 붙은 타점만 항목을 가짐 — 없으면 클라가 빈 배열로 취급).
     * 타점 단건 조회를 두지 않는 이유는 rank 의 listAllLines 와 같다: 소비자(차트·시트·배치·필터)가
     * 모두 전체를 보므로, 왕복 1회·캐시 1개로 두면 패널 간 그룹이 어긋날 여지가 없다.
     */
    listAllAttachments(): Promise<GroupAttachment[]>;
    /** 전 차트의 소유 부착 — 타점 부착과 같은 이유로 전체 한 번(빈 차트는 항목 없음). */
    listAllChartAttachments(): Promise<ChartGroupAttachment[]>;
}

/** 그룹 편집(쓰기). 사전 CRUD + 부착/해제. */
export interface GroupStore {
    /** 그룹 생성 → DB 가 부여한 id 를 채워 반환. 같은 이름이 이미 있으면 **그 그룹를 반환**(멱등 — 중복 생성 사고 방지). */
    createGroup(name: string): Promise<Group>;
    /** 그룹 이름 변경(부착은 id 참조라 무관). 없는 id 는 조용한 no-op. */
    renameGroup(id: string, name: string): Promise<void>;
    /** 그룹 삭제 — 부착도 FK cascade 로 함께 제거(되돌릴 수 없음: 호출부가 사용 건수를 확인시킬 것). */
    removeGroup(id: string): Promise<void>;
    /** 타점에 그룹 부착(멱등 — 이미 붙어 있으면 no-op). 없는 타점/그룹면 FK 위반으로 거부. */
    attach(groupId: string, point: ReviewPointKey): Promise<void>;
    /** 부착 해제. 안 붙어 있으면 조용한 no-op. */
    detach(groupId: string, point: ReviewPointKey): Promise<void>;
    /** 차트에 그룹 부착(멱등). 타점 부착과 달리 대상 FK 가 없다 — 차트는 행이 아니고 타점보다 오래 산다(chart_anchors 선례). */
    attachToChart(groupId: string, chart: ChartRef): Promise<void>;
    /** 차트 부착 해제. 안 붙어 있으면 조용한 no-op. */
    detachFromChart(groupId: string, chart: ChartRef): Promise<void>;
}
