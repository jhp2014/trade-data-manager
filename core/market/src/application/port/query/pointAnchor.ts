import type { AnchorCoord, PointAnchor, ReviewPointKey } from "#domain";

// 타점 파라미터 앵커 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 자연키 (타점, param, 좌표) — param 에 따라 앵커가 여럿. 자세한 설계는 domain/review/pointAnchor.ts.

/** 앵커 조회(읽기). 차트 표시(그 차트 타점들의 앵커) + 계산 축(전 타점 배치 조회)이 의존. */
export interface PointAnchorReader {
    /** 이 차트(종목,날짜) 모든 타점의 앵커들. */
    listByChart(stockCode: string, date: string): Promise<PointAnchor[]>;
    /** 전 앵커 — 계산 축 굽기(전 타점 대상)용. 타점 수 규모라 페이징 불필요. */
    listAll(): Promise<PointAnchor[]>;
}

/** 앵커 편집(쓰기). 차트 우클릭 메뉴가 의존. */
export interface PointAnchorStore {
    /**
     * 앵커 지정. 같은 좌표 재지정은 언제나 멱등(no-op).
     *  · replace=true  — 그 (타점,param) 의 기존 앵커를 지우고 이것만 남긴다(단일 param: 기준선 등).
     *  · replace=false — 좌표마다 쌓는다(다중 param: 무시 캔들 등).
     * 다중성은 param 정의(AnchorParamDef.multiple)가 결정하지만 **포트는 레지스트리를 모른다** — 호출자(컨트롤러)가
     * 정의를 읽어 이 플래그로 번역한다. 저장소가 레지스트리를 알면 curation 쓰기가 도메인 정책에 결합된다.
     */
    put(anchor: PointAnchor, opts: { replace: boolean }): Promise<void>;
    /** 앵커 해제. coord 를 주면 그 캔들 하나만, 생략하면 그 param 전부. 없는 앵커는 조용한 no-op. */
    remove(point: ReviewPointKey, param: string, coord?: AnchorCoord): Promise<void>;
}
