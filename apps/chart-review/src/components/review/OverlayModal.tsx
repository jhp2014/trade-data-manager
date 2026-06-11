"use client";

import { type ReactNode } from "react";
import styles from "./FieldChecklistModal.module.css";
import { useModalDismiss } from "@/hooks/useModalDismiss";

type OverlayModalProps = {
  title: ReactNode;
  /** 0 보다 크면 제목 옆에 개수 배지를 표시. */
  badge?: number;
  /** modal 본문 아래에 붙는 영역(예: "전체 해제" 버튼). */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 설정 모달 위에 겹쳐 뜨는 오버레이 모달의 공통 셸.
 * overlay > modal > header(제목+배지+✕) 구조와 ESC(캡처 단계)·바깥 클릭 닫기를 캡슐화한다.
 * 본문(검색/리스트/그룹 등)은 children 으로, 하단 액션은 footer 로 받는다.
 */
export function OverlayModal({ title, badge, footer, onClose, children }: OverlayModalProps) {
  // 캡처 단계 ESC: 상위 설정 모달보다 먼저 닫는다.
  const { overlayRef, onOverlayClick } = useModalDismiss(onClose, {
    capture: true,
    stopPropagation: true,
  });

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={onOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            {title}
            {badge != null && badge > 0 && <span className={styles.badge}>{badge}</span>}
          </span>
          <button type="button" className={styles.close} onClick={onClose}>✕</button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}
