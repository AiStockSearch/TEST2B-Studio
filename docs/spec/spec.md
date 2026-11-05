# Spec: мини-CRM «Объекты и задачи»
Роли: постановщик (manager), исполнитель (worker). Профиль роли хранится в public.profiles (id = auth.users.id, role, full_name).
Сущности: objects(name, address), tasks(title, description, object_id, assignee_id, status, author_id, created_at), task_status_history(task_id, from_status, to_status, changed_by, comment, changed_at).
Статусы: new → in_progress → review → accepted | rework(комментарий обязателен) → in_progress.
Безопасность: RLS на всех таблицах; переходы проверяет БД (триггер BEFORE UPDATE на tasks); история пишется только триггером (SECURITY DEFINER), у клиентских ролей нет INSERT/UPDATE/DELETE на history; signup выключен; в клиенте только anon key.
Экраны: вход; список объектов; карточка объекта; карточка задачи (действия по роли/статусу + история); «Мои задачи».
