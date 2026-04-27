'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useTradeStore } from '@/store/useTradeStore';
import styles from './WorkspaceSlide.module.css';

// TODO: 나중에 실제 컴포넌트로 교체할 임시 자리표시자
const TopInsightBar = () => <div style={{ height: '100%', background: 'var(--bg-panel)', padding: '1rem' }}>상단 뷰 (오버레이 차트 + 텍스트)</div>;
const GridSlide = () => <div style={{ height: '100%', padding: '1rem' }}>하단 뷰 (테마 내 종목 분봉 그리드)</div>;
const FocusSlide = () => <div style={{ height: '100%', padding: '1rem' }}>하단 뷰 (일봉 + 분봉 정밀 분석)</div>;

export default function WorkspaceSlide() {
    const selectedStock = useTradeStore((state) => state.selectedStock);

    return (
        <div className={styles.container}>
            {/* PanelGroup: 수직(vertical) 방향으로 패널들을 나눕니다. */}
            <PanelGroup id="workspace-panel-group" direction="vertical">

                {/* 상단 바 (Top Panel) */}
                <Panel
                    defaultSize={30} // 초기 높이는 전체의 30%
                    minSize={10}     // 아무리 줄여도 10% 이하는 안 됨
                    maxSize={50}     // 아무리 늘려도 50% 이상은 안 됨
                    collapsible={true} // 끝까지 밀면 완전히 접을 수 있음
                >
                    <TopInsightBar />
                </Panel>

                {/* 패널 사이의 드래그 손잡이 */}
                <PanelResizeHandle className={styles.resizeHandle}>
                    <div className={styles.handleHint} />
                </PanelResizeHandle>

                {/* 하단 메인 워크스페이스 (Bottom Panel) */}
                <Panel
                    defaultSize={70} // 초기 높이는 전체의 70%
                >
                    {/* 선택된 종목이 없으면 그리드를, 있으면 포커스(일봉/분봉) 화면을 렌더링 */}
                    {selectedStock === null ? <GridSlide /> : <FocusSlide />}
                </Panel>

            </PanelGroup>
        </div>
    );
}