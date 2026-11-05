import { describe, expect, it } from "vitest";
import { availableTransitions, checkTransition, STATUSES, TRANSITIONS, type TaskStatus } from "@/lib/workflow";
import { humanizeDbError } from "@/lib/errors";

const manager = { id: "m", role: "manager" as const };
const w1 = { id: "w1", role: "worker" as const };
const w2 = { id: "w2", role: "worker" as const };
const task = (status: TaskStatus) => ({ status, assignee_id: "w1" });

// Зеркало public.task_transition_actor() из миграции 0003
const DB_TABLE: Record<string, "assignee" | "manager"> = {
  "new>in_progress": "assignee", "in_progress>review": "assignee",
  "review>accepted": "manager", "review>rework": "manager", "rework>in_progress": "assignee",
};

describe("таблица переходов", () => {
  it("совпадает с таблицей в БД и запрещает все остальные пары", () => {
    for (const from of STATUSES) for (const to of STATUSES) {
      const t = TRANSITIONS.find((x) => x.from === from && x.to === to);
      expect(t?.actor, `${from}>${to}`).toBe(DB_TABLE[`${from}>${to}`]);
    }
  });
  it("комментарий обязателен только для rework", () => {
    expect(TRANSITIONS.filter((t) => t.commentRequired).map((t) => t.to)).toEqual(["rework"]);
  });
});

describe("доступные действия", () => {
  const to = (v: typeof manager | typeof w1, s: TaskStatus) => availableTransitions(v, task(s)).map((t) => t.to);
  it("исполнитель своей задачи", () => {
    expect(to(w1, "new")).toEqual(["in_progress"]);
    expect(to(w1, "in_progress")).toEqual(["review"]);
    expect(to(w1, "review")).toEqual([]);
    expect(to(w1, "rework")).toEqual(["in_progress"]);
    expect(to(w1, "accepted")).toEqual([]);
  });
  it("чужой исполнитель ничего не может", () => {
    for (const s of STATUSES) expect(to(w2, s)).toEqual([]);
  });
  it("постановщик только принимает или возвращает", () => {
    expect(to(manager, "review")).toEqual(["accepted", "rework"]);
    for (const s of ["new", "in_progress", "rework", "accepted"] as TaskStatus[]) expect(to(manager, s)).toEqual([]);
  });
});

describe("серверная предпроверка", () => {
  it("rework без комментария отклоняется", () => {
    expect(checkTransition(manager, task("review"), "rework", "  ")).toMatch(/комментарий/);
    expect(checkTransition(manager, task("review"), "rework", "Переделать")).toBeNull();
  });
  it("запрещённые переходы", () => {
    expect(checkTransition(w1, task("new"), "accepted", null)).toMatch(/запрещён/);
    expect(checkTransition(w1, task("review"), "accepted", null)).toMatch(/недоступно/);
    expect(checkTransition(w2, task("new"), "in_progress", null)).toMatch(/недоступно/);
  });
});

describe("ошибки БД по-человечески", () => {
  it("переводит сообщения триггеров", () => {
    expect(humanizeDbError(new Error("comment is required for rework"))).toMatch(/комментарий/);
    expect(humanizeDbError({ message: "transition new -> accepted is not allowed" })).toMatch(/запрещён/);
    expect(humanizeDbError(new Error("new row violates row-level security policy"))).toMatch(/прав/);
  });
});
