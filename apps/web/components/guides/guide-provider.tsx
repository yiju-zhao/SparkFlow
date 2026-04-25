"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GuideState } from "@/content/guides/types";
import { GUIDE_STATE_STORAGE_KEY } from "@/content/guides/types";

type GuideActionHandler = () => void | Promise<void>;

interface GuideContextValue extends GuideState {
  isAuthenticated: boolean;
  loading: boolean;
  drawerOpen: boolean;
  activeGuideId: string | null;
  setDrawerOpen: (open: boolean) => void;
  openGuide: (id: string) => void;
  closeGuide: () => void;
  dismissGuide: (id: string) => Promise<void>;
  undismissGuide: (id: string) => Promise<void>;
  markTourCompleted: () => Promise<void>;
  resetTour: () => Promise<void>;
  registerGuideAction: (name: string, handler: GuideActionHandler) => () => void;
  runGuideAction: (name: string, options?: { timeoutMs?: number }) => Promise<boolean>;
}

const EMPTY_STATE: GuideState = { tourCompletedAt: null, dismissedGuides: [] };

const GuideContext = createContext<GuideContextValue | null>(null);

function readLocalState(): GuideState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(GUIDE_STATE_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<GuideState>;
    return {
      tourCompletedAt: parsed.tourCompletedAt ?? null,
      dismissedGuides: Array.isArray(parsed.dismissedGuides) ? parsed.dismissedGuides : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeLocalState(state: GuideState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function GuideProvider({
  children,
  isAuthenticated,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
}) {
  const [state, setState] = useState<GuideState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  // Action registry: components register handlers; the player calls them by name.
  // A ref keeps registration changes from causing re-renders; the registrar
  // returns an unregister function for cleanup.
  const actionsRef = useRef<Map<string, GuideActionHandler>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!cancelled) setLoading(true);
      if (!isAuthenticated) {
        if (!cancelled) {
          setState(readLocalState());
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch("/api/guides/state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as GuideState;
        if (!cancelled) setState(body);
      } catch {
        if (!cancelled) setState(EMPTY_STATE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!isAuthenticated) {
        setState((prev) => {
          const next: GuideState = { ...prev };
          if (body.markTourCompleted) next.tourCompletedAt = new Date().toISOString();
          if (body.resetTour) next.tourCompletedAt = null;
          if (typeof body.dismissGuideId === "string") {
            next.dismissedGuides = Array.from(new Set([...prev.dismissedGuides, body.dismissGuideId]));
          }
          if (typeof body.undismissGuideId === "string") {
            next.dismissedGuides = prev.dismissedGuides.filter((id) => id !== body.undismissGuideId);
          }
          writeLocalState(next);
          return next;
        });
        return;
      }
      try {
        const res = await fetch("/api/guides/state", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const next = (await res.json()) as GuideState;
        setState(next);
      } catch {
        /* swallow — UI stays responsive */
      }
    },
    [isAuthenticated],
  );

  const registerGuideAction = useCallback((name: string, handler: GuideActionHandler) => {
    actionsRef.current.set(name, handler);
    return () => {
      // Only remove if this exact handler is still registered — a later
      // registerGuideAction(name, otherHandler) should win and not be clobbered
      // by this cleanup.
      if (actionsRef.current.get(name) === handler) {
        actionsRef.current.delete(name);
      }
    };
  }, []);

  const runGuideAction = useCallback(
    async (name: string, options?: { timeoutMs?: number }): Promise<boolean> => {
      const timeoutMs = options?.timeoutMs ?? 1000;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const handler = actionsRef.current.get(name);
        if (handler) {
          try {
            await handler();
            return true;
          } catch (err) {
            console.warn(`[guides] action "${name}" threw:`, err);
            return false;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      console.warn(`[guides] action "${name}" was not registered within ${timeoutMs}ms`);
      return false;
    },
    [],
  );

  const value = useMemo<GuideContextValue>(
    () => ({
      ...state,
      isAuthenticated,
      loading,
      drawerOpen,
      activeGuideId,
      setDrawerOpen,
      openGuide: (id) => {
        setActiveGuideId(id);
      },
      closeGuide: () => setActiveGuideId(null),
      dismissGuide: (id) => patch({ dismissGuideId: id }),
      undismissGuide: (id) => patch({ undismissGuideId: id }),
      markTourCompleted: () => patch({ markTourCompleted: true }),
      resetTour: () => patch({ resetTour: true }),
      registerGuideAction,
      runGuideAction,
    }),
    [state, isAuthenticated, loading, drawerOpen, activeGuideId, patch, registerGuideAction, runGuideAction],
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuides(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuides must be used inside <GuideProvider>");
  return ctx;
}
