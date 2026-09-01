import type { Group, GroupItemRef, GroupMembership } from "#domain";

// 그룹 큐레이션 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 사전과 멤버십이 한 슬라이스인 이유: 둘은 늘 같이 읽힌다(팔레트 = 사전 + 빈도, 맵 = 사전 + 겹침).
// 설계는 domain/review/group.ts.

/** 그룹 조회. */
export interface GroupReader {
    /** 그룹 전체(이름 오름차순 — 팔레트 순서를 서버가 고정해 화면마다 안 흔들리게). 좌표·부모·맵 포함. */
    listGroups(): Promise<Group[]>;
    /**
     * 전 항목의 멤버십을 한 번에(그룹이 하나라도 붙은 항목만 항목을 가짐).
     * 소비자(차트·시트·정규화)가 모두 전체를 보므로 왕복 1회·캐시 1개면 화면 간 어긋날 여지가 없다(rank 의 listAllLines 와 같은 판단).
     */
    listAllMemberships(): Promise<GroupMembership[]>;
}

/**
 * 그룹 편집. **지목은 언제나 이름으로** — 이름이 전역 유일이라 온전한 키다.
 * surrogate id 는 저장소 안에 남지만(rename 이 FK 를 타지 않게) 계약을 건너지 않는다:
 * 로컬 미러와 Supabase 가 각자 id 를 발급하고 미러 전체교체 때 로컬 id 가 통째로 갈리므로,
 * id 를 계약에 두면 동기화를 건넌 참조가 조용히 다른 행을 가리킨다.
 */
export interface GroupStore {
    /** 생성 → 저장본 반환. 같은 이름이면 **그 그룹을 반환**(멱등 — 중복 생성 사고 방지). */
    createGroup(name: string): Promise<Group>;
    /** 이름 변경(멤버십은 안에서 id 참조라 무관). 없는 이름은 조용한 no-op. */
    renameGroup(name: string, newName: string): Promise<void>;
    /** 삭제 — 멤버십도 FK cascade 로 함께. 자식 그룹은 부모만 풀린다(SET NULL). 되돌릴 수 없다. */
    removeGroup(name: string): Promise<void>;

    /** 항목(차트)을 그룹에 넣는다(멱등). */
    attach(groupName: string, item: GroupItemRef): Promise<void>;
    /** 뺀다. 안 들어 있으면 조용한 no-op. */
    detach(groupName: string, item: GroupItemRef): Promise<void>;

    /** 그룹 안 그룹. null = 최상위로. 순환이 아닌지 여기서 막는다(DB 로는 못 막는 제약). */
    setParent(name: string, parentName: string | null): Promise<void>;
}
