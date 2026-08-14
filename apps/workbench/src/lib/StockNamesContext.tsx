// 종목명 사전 한 벌 — **셸에서 한 번 받아 나눠 준다**(GroupsContext·RankAxesContext 와 같은 이유).
//
// ## 왜 전량인가
// 이름은 "이 코드가 뭐냐"를 묻는 **모든** 화면이 필요로 하는데, 예전엔 화면마다 필요한 코드를 모아
// `/stocks/meta?codes=…` 로 물었다. 모으는 쪽은 자기가 받은 피드밖에 모르니, 정작 **피드에 없는 종목**
// (필터 밖·타점 없는 하루)에서 목록이 비어 이름 대신 코드가 떴다 — 이름이 가장 필요한 순간이 그때인데도.
// 종목 수가 수천이라 전량이 압축 후 수십 KB다. 조율을 계속 잘하는 것보다 조율이 필요 없는 편이 싸다.
//
// ## 피드에 실려 오는 name 은 이제 안 읽는다
// 타점·앵커 차트 피드는 서버가 이름을 붙여 보낸다(MasterCache.attachNames). 그 이름도 **같은 마스터**에서
// 나오므로 이 사전이 그것의 상위집합이다 — 피드만 알고 여기가 모르는 이름은 존재할 수 없다. 그래서
// 폴백을 두지 않는다. 두 출처를 다시 만드는 순간 위의 버그가 그대로 돌아온다.
//
// ⚠ 사전이 오기 전에는 이름 자리에 **코드**가 뜬다(한 박자). 빈칸으로 두지 않는 건 의도다 — 빈칸이면
// 그 행이 무엇인지조차 알 수 없다. 기다림이 신경 쓰이는 화면은 isLoading 으로 갈라 쓴다.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { stockMasterQuery } from "../api/queries.js";

export interface StockNamesView {
    /** 코드 → 이름. 모르면 **코드를 그대로** 돌려준다(위 ⚠). */
    nameOf: (code: string) => string;
    /** 사전이 아직 오는 중인가. */
    isLoading: boolean;
    /** 마스터에 그 코드가 있나 — 이름이 코드로 보이는 게 "미도착"인지 "폐지·미수집"인지 가를 때만. */
    has: (code: string) => boolean;
}

const Ctx = createContext<StockNamesView | null>(null);

export function StockNamesProvider({ children }: { children: ReactNode }): JSX.Element {
    const q = useQuery(stockMasterQuery());

    const v = useMemo<StockNamesView>(() => {
        // 사전은 여기서 **한 벌만** 만든다 — 소비자마다 만들면 수천 항목 Map 이 화면 수만큼 돈다
        // (계산 축 값 맵이 세 벌 돌던 그 사정과 같다).
        const m = new Map<string, string>();
        for (const s of q.data ?? []) if (s.name) m.set(s.stockCode, s.name);
        return {
            nameOf: (code) => m.get(code) ?? code,
            has: (code) => m.has(code),
            isLoading: q.isLoading,
        };
    }, [q.data, q.isLoading]);

    return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** 이름 사전 구독 — 이름이 필요한 곳은 전부 이걸(또는 이걸 감싼 useStockName/useStockNames) 쓴다. */
export function useStockNamesDict(): StockNamesView {
    const v = useContext(Ctx);
    if (!v) throw new Error("StockNamesProvider 밖에서 종목명 조회 — main 배선을 확인하세요");
    return v;
}
