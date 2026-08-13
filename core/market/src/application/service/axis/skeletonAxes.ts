// 계산 축 — **골격 파생 축 묶음**(실험). 손으로 찍은 피벗 골격에서 형태 측정값을 뽑아 축으로 낸다.
//
// ⚠ **"축 하나 = 파일 하나" 원칙에서 의도적으로 벗어난 곳이다.** 이유는 이 축들이 확정된 축이 아니라
// **아직 실험 중**이고(무엇을 재야 하는지가 사용하면서 바뀐다), 그래서 같이 움직이기 때문이다. 흩어놓으면
// 측정 하나를 고칠 때 변경이 N개 파일로 번진다. 축이 확정되고 각자 재료가 달라지기 시작하면 그때 쪼갠다.
//
// ## 3층 분리 — 변경이 어디서 멈추는가
//   앵커 행 → resolve{Daily,Minute}Skeletons(해소) → skeletonShape(형태, 순수) → **여기(축)** → 값 하나
// 저장 모델이 바뀌면 해소층만, 새 측정이 필요하면 형태층만, 새 축은 아래 목록에 한 줄만 는다.
// 축이 각자 재료를 모으지 않는 건 축끼리 재료 비공유 원칙의 예외처럼 보이지만, 여기선 **재료가 아니라
// 파생 결과를 공유**하는 것이라 결이 다르다(같은 골격에서 다른 숫자를 고를 뿐).
//
// ## 캐시 무효화 — SKELETON_SHAPE_VERSION
// 형태층(skeletonShape)의 계산을 고치면 **파생 축이 전부** 스테일이 된다. 축마다 version 을 손으로 올리면
// 잦은 실험 중에 반드시 하나를 빠뜨리고, 그 축만 옛 식의 값을 계속 보여준다(가장 찾기 어려운 종류의 오류).
// 그래서 축 version 을 `SHAPE_VERSION * 100 + 자기 version` 으로 만든다 — 형태층을 고치면 상수 하나로 전부
// 무효화되고, 특정 축의 고르는 방식만 바뀌면 그 축의 자기 version 만 올린다.
import { chartKeyOf, pointKeyOf, SKELETON_MINUTE_PARAM, SKELETON_PARAM, skeletonShape, type ReviewPointKey, type SkeletonShape } from "#domain";
import { resolveDailySkeletons, resolveMinuteSkeletons } from "../shared/skeletonResolver.js";
import { dropSameDayAnchors, type AxisDeps, type ComputedAxisDef, type ComputedAxisValue } from "./axis.js";

/**
 * 형태층 계산 버전. **skeletonShape 의 식을 고치면 여기를 올린다** — 파생 축이 다 같이 무효화된다.
 * v1: 최초(본상승 P1→P2, 되돌림 = P2 이후 최저까지, 2점 = 0 단언).
 */
export const SKELETON_SHAPE_VERSION = 1;

/** 축 version = 형태층 × 100 + 자기 버전. 형태층이 바뀌면 전부, 고르는 방식만 바뀌면 그 축만 무효화. */
const versionOf = (own: number): number => SKELETON_SHAPE_VERSION * 100 + own;

/**
 * 골격 축 팩토리 — 새 축 = 아래 목록에 한 줄. `pick` 이 형태에서 숫자 하나를 고르고, null 이면 그 타점은 결손.
 * 재료 읽기·해소·형태 계산은 전부 공유하므로 축이 늘어도 새로 짤 코드가 없다.
 *
 * `mode` 가 해상도를 고른다 — **여기서 갈리는 건 해소 함수와 그룹 키뿐**이고, 형태 계산과 값 고르기는 공용이다
 * (그래서 분봉 골격을 얹는 데 형태층이 한 줄도 안 바뀌었다). 단위 표기는 각 축의 display 가 붙인다.
 */
function skeletonAxis(spec: {
    key: string;
    name: string;
    /** 해상도 — daily=차트 소유 일봉 골격 / minute=타점 소유 분봉 골격. */
    mode: "daily" | "minute";
    /** 이 축의 자기 버전 — 고르는 방식이 바뀔 때만 올린다(형태층 변경은 SKELETON_SHAPE_VERSION). */
    own: number;
    strongerWhen: "higher" | "lower";
    display?: ComputedAxisDef["display"];
    pick: (shape: SkeletonShape) => number | null;
}): ComputedAxisDef {
    const isMinute = spec.mode === "minute";
    return {
        key: spec.key,
        name: spec.name,
        version: versionOf(spec.own),
        strongerWhen: spec.strongerWhen,
        // 일봉 골격 = 차트 소유 + 재료가 전일까지의 피벗뿐(아래 당일 가드) → 그날 전 타점이 같은 값 = day.
        // 분봉 골격 = 타점 종가 합성이 시각마다 다르다 → point(기본값이지만 대비를 위해 명시).
        grain: isMinute ? "point" : "day",
        display: spec.display,
        inputs: isMinute ? ["minute"] : ["adjDaily", "minute"],
        params: [isMinute ? SKELETON_MINUTE_PARAM : SKELETON_PARAM],
        // 분봉 골격은 타점 종가 합성으로 형제 타점 집합에 의존한다 — 지문 결합(axis.ts pointCoupled 주석).
        ...(isMinute ? { pointCoupled: true } : {}),
        async compute(points: readonly ReviewPointKey[], deps: AxisDeps): Promise<ComputedAxisValue[]> {
            const anchors = await deps.chartAnchor.listAll();
            // day 알갱이 가드(dropSameDayAnchors 주석 참조) — 골격은 당일 캔들에도 피벗을 찍을 수 있는데,
            // 하루에 값 하나를 주는 이상 당일 정보는 그날의 이른 타점에 반드시 미래다. 거른 뒤 피벗이
            // 모자라면 형태가 안 나와 결손(미배치 칸). 분봉 골격은 가드 없음 — 피벗이 본디 당일 장중 경로다.
            const usable = isMinute ? anchors : dropSameDayAnchors(anchors, SKELETON_PARAM);
            const resolved = isMinute ? await resolveMinuteSkeletons(points, usable, deps) : await resolveDailySkeletons(points, usable, deps);
            const keyOf = isMinute ? pointKeyOf : chartKeyOf;
            const shapeCache = new Map<string, SkeletonShape | null>();
            const out: ComputedAxisValue[] = [];
            for (const p of points) {
                const key = keyOf(p);
                if (!resolved.has(key)) continue; // 골격 미입력 — 결손이 아니라 "입력 전"
                let shape = shapeCache.get(key);
                if (shape === undefined) {
                    const pivots = resolved.get(key);
                    shape = pivots ? skeletonShape(pivots) : null;
                    shapeCache.set(key, shape);
                }
                if (!shape) continue; // 재료 부족(창 밖·미수집·당일 피벗을 거른 뒤 모자람) — 결손
                const value = spec.pick(shape);
                if (value === null || !Number.isFinite(value)) continue; // 그 축에서만의 결손(기울기 span 0 등)
                out.push({ stockCode: p.stockCode, date: p.date, time: p.time, value });
            }
            return out;
        },
    };
}

/**
 * 골격 파생 축 목록 — **여기 한 줄 = 축 하나**. 지금은 전부 실험 축이고, 사용하면서 늘고 줄 예정.
 *
 * 일봉 네 개가 1턴차 사례들을 실제로 가른다(도메인 테스트로 고정):
 *   · 2연상 후 돌파 vs 잔잔한 지속 상승 — 되돌림은 둘 다 0, **기울기**가 가른다
 *   · 윗꼬리 슈팅 — 본상승이 한 캔들 안이라 **거래일 0**(그 자체가 식별 신호)
 *
 * ⚠ "본상승 후 경과일"은 일부러 안 만들었다 — 기준선 거리(일) 축과 거의 같은 것을 잰다(P2 ≈ 기준선 앵커).
 *   골격이 쌓이면 실제 상관을 재보고 그때 판단한다. 축이 늘면 시트 열이 먼저 무너진다는 레지스트리 경고 준수.
 */
export const SKELETON_AXES: readonly ComputedAxisDef[] = [
    skeletonAxis({
        key: "skeleton-base-rise",
        name: "본상승 크기(%)",
        mode: "daily",
        own: 2, // v2: 당일 피벗 가드(day 알갱이 절단선 — 전일까지)
        strongerWhen: "higher",
        pick: (s) => s.baseRisePct,
    }),
    skeletonAxis({
        key: "skeleton-base-days",
        name: "본상승 기간(일)",
        mode: "daily",
        own: 2, // v2: 당일 피벗 가드(day 알갱이 절단선 — 전일까지)
        strongerWhen: "higher",
        display: { suffix: "일", decimals: 0, signed: false },
        pick: (s) => s.baseRiseSpan,
    }),
    skeletonAxis({
        key: "skeleton-base-slope",
        name: "본상승 기울기(%/일)",
        mode: "daily",
        own: 2, // v2: 당일 피벗 가드(day 알갱이 절단선 — 전일까지)
        strongerWhen: "higher",
        display: { suffix: "%/일", decimals: 1 },
        pick: (s) => s.baseRiseSlope, // 한 캔들 안 상승(거래일 0)이면 결손 — 지어내지 않는다
    }),
    skeletonAxis({
        key: "skeleton-pullback",
        name: "되돌림률(%)",
        mode: "daily",
        own: 2, // v2: 당일 피벗 가드(day 알갱이 절단선 — 전일까지)
        strongerWhen: "higher",
        display: { suffix: "%", decimals: 0, signed: false },
        pick: (s) => s.pullbackRatio, // 2점 골격 = 0(되돌림 없음의 단언), 100 초과 가능
    }),

    // ── 분봉 골격(타점 소유) — **둘로 시작한다.** 무엇을 재야 하는지는 찍어보면서 정하기로 했고,
    //    축이 늘면 시트 열이 먼저 무너지므로 확신 없는 것을 미리 올리지 않는다(팩토리라 추가는 한 줄).
    //    "분봉 본상승 크기(%)"를 뺀 건 일봉만큼 의미 있을지 확신이 없어서 — 필요해지면 그때.
    // own 3: 타점 종가 합성("타점 종가 = 골격의 한 점")으로 경로 자체가 바뀌었다 — 전량 재계산.
    // pointCoupled: 경로가 형제 타점 집합에 의존한다(합성) — 캐시 지문에 타점 시각 목록이 들어간다.
    skeletonAxis({
        key: "skeleton-min-pullback",
        name: "분봉 되돌림률(%)",
        mode: "minute",
        own: 3,
        strongerWhen: "higher",
        display: { suffix: "%", decimals: 0, signed: false },
        pick: (s) => s.pullbackRatio,
    }),
    skeletonAxis({
        key: "skeleton-min-slope",
        name: "분봉 기울기(%/분)",
        mode: "minute",
        own: 3,
        strongerWhen: "higher",
        display: { suffix: "%/분", decimals: 2 },
        pick: (s) => s.baseRiseSlope, // 한 봉 안 상승(span 0)이면 결손
    }),
];
