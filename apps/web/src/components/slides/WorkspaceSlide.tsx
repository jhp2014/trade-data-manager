'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import styles from './WorkspaceSlide.module.css';
import StockChartList from './workspace/StockChartList'; // 이름 변경 반영

// 상단 영역 (나중에 구현할 임시 컴포넌트)
const TopInsightBar = () => (
    <div style={{ height: '100%', background: 'var(--bg-panel)', padding: '1.2rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-muted)' }}>Theme Summary Overlay</h3>
    </div>
);

export default function WorkspaceSlide() {
    return (
        <div className={styles.container}>
            <PanelGroup direction="vertical" id="workspace-panel-group">

                {/* 상단 패널: 요약 정보 및 오버레이 차트 */}
                <Panel defaultSize={20} minSize={10} maxSize={50} collapsible={true}>
                    <TopInsightBar />
                </Panel>

                {/* 조절 바 */}
                <PanelResizeHandle className={styles.resizeHandle}>
                    <div className={styles.handleLine} />
                </PanelResizeHandle>

                {/* 하단 패널: 실제 종목별 세로 차트 리스트 */}
                <Panel defaultSize={80} minSize={30}>
                    <div className={styles.scrollableArea}>
                        <StockChartList />
                    </div>
                </Panel>

            </PanelGroup>
        </div>
    );
}