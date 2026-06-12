import { useCallback, useState } from "react";

/**
 * ReviewWorkspace 의 모달 open 상태(설정 모달 · 타점 입력 드로어)를 한곳에 모은다.
 * 입력 드로어는 입력 가능 종목일 때만 열린다(canInput).
 */
export function useModals(canInput: boolean) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeInput = useCallback(() => setInputOpen(false), []);
  const openInput = useCallback(() => {
    if (canInput) setInputOpen(true);
  }, [canInput]);

  return { settingsOpen, openSettings, closeSettings, inputOpen, openInput, closeInput };
}
