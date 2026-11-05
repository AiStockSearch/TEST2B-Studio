"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Только клиентское состояние интерфейса. Фильтры — в URL, права — в БД.
interface UiState {
  objectsLayout: "grid" | "list";
  setObjectsLayout: (l: UiState["objectsLayout"]) => void;
}

export const useUi = create<UiState>()(
  persist((set) => ({ objectsLayout: "grid", setObjectsLayout: (objectsLayout) => set({ objectsLayout }) }), { name: "crm-ui" }),
);
