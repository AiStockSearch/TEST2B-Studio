"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TaskStatus } from "@/lib/workflow";

// Только клиентское состояние интерфейса (фильтры). Права здесь не проверяются.
interface UiState {
  statusFilter: TaskStatus | "all" | "active";
  objectQuery: string;
  setStatusFilter: (s: UiState["statusFilter"]) => void;
  setObjectQuery: (q: string) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      statusFilter: "active",
      objectQuery: "",
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setObjectQuery: (objectQuery) => set({ objectQuery }),
    }),
    { name: "crm-ui", partialize: (s) => ({ statusFilter: s.statusFilter }) },
  ),
);
