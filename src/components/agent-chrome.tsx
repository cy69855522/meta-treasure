"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type AgentChromeContextValue = {
  /** True while Steward page or Project Agent overlay is the active chat UI. */
  agentSessionActive: boolean;
  setAgentSessionActive: (active: boolean) => void;
  /** Agent title/header strip; default hidden on mobile. */
  headerVisible: boolean;
  toggleHeader: () => void;
  setHeaderVisible: (visible: boolean) => void;
};

const AgentChromeContext = createContext<AgentChromeContextValue | null>(null);

export function AgentChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [agentSessionActive, setAgentSessionActive] = useState(false);
  // Default hidden — mobile gains chat space; desktop CSS still shows the header.
  const [headerVisible, setHeaderVisible] = useState(false);
  const toggleHeader = useCallback(() => {
    setHeaderVisible((v) => !v);
  }, []);

  const value = useMemo(
    () => ({
      agentSessionActive,
      setAgentSessionActive,
      headerVisible,
      toggleHeader,
      setHeaderVisible,
    }),
    [agentSessionActive, headerVisible, toggleHeader],
  );

  return (
    <AgentChromeContext.Provider value={value}>
      {children}
    </AgentChromeContext.Provider>
  );
}

export function useAgentChrome() {
  const ctx = useContext(AgentChromeContext);
  if (!ctx) {
    throw new Error("useAgentChrome must be used within AgentChromeProvider");
  }
  return ctx;
}
