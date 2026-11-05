import type { Role, TaskStatus } from "@/lib/workflow";

export interface Profile { id: string; role: Role; full_name: string }
export interface ObjectRow { id: string; name: string; address: string; created_at: string; task_count: number; open_count: number }
export interface TaskRow {
  id: string; title: string; description: string; status: TaskStatus; created_at: string; updated_at: string;
  object_id: string; object_name: string; assignee_id: string; assignee_name: string; author_id: string; author_name: string;
}
export interface HistoryRow {
  id: string; from_status: TaskStatus | null; to_status: TaskStatus; comment: string | null; changed_at: string; actor_name: string;
}
export interface TaskInput { title: string; description: string; object_id: string; assignee_id: string }
export interface ObjectInput { name: string; address: string }
export interface TaskFilter { objectId?: string; assigneeId?: string; status?: TaskStatus }

/** Все операции выполняются ОТ ИМЕНИ пользователя: RLS и триггеры БД работают всегда. */
export interface Repo {
  getProfile(id: string): Promise<Profile | null>;
  listWorkers(): Promise<Profile[]>;
  listObjects(): Promise<ObjectRow[]>;
  getObject(id: string): Promise<ObjectRow | null>;
  createObject(input: ObjectInput): Promise<string>;
  updateObject(id: string, input: ObjectInput): Promise<void>;
  deleteObject(id: string): Promise<void>;
  listTasks(filter: TaskFilter): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | null>;
  getHistory(taskId: string): Promise<HistoryRow[]>;
  createTask(input: TaskInput): Promise<string>;
  updateTask(id: string, input: TaskInput): Promise<void>;
  deleteTask(id: string): Promise<void>;
  changeStatus(id: string, to: TaskStatus, comment: string | null): Promise<void>;
}

export class NotFoundOrForbidden extends Error {
  constructor() { super("task not found"); }
}
