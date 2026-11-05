# Мини-CRM «Объекты и задачи»

Тестовое задание 2B Studio. Постановщик ставит задачи по объектам (стройкам), исполнители берут их в работу и отдают на проверку. Каждая смена статуса записывается в историю.

## Стек
- **Next.js 15** (App Router, Server Actions) + **TypeScript**
- **Supabase**: Postgres, Auth (email + пароль), RLS
- **Prisma 7** (`@prisma/adapter-pg`): серверный доступ к БД, каждый запрос идёт от имени пользователя (см. «Безопасность»)
- **shadcn/ui** + Tailwind CSS 4, **Zustand** (только UI-состояние: фильтры, поиск)
- Тесты: Vitest (таблица переходов), Playwright (e2e по ролям), SQL-тесты политик, скрипт проверок «в обход UI»

## Структура
```
supabase/migrations/   схема, RLS, триггеры переходов и истории, RPC change_task_status (источник правды)
supabase/tests/        SQL-тесты RLS и переходов (40 проверок, в транзакции с rollback)
supabase/seed.sql      демо-данные: 3 объекта, 8 задач в разных статусах
prisma/schema.prisma   модели под существующую схему (prisma db pull), migrate не используется
src/lib/workflow.ts    таблица переходов (зеркало public.task_transition_actor) → кнопки в UI
src/lib/data/          слой данных: prisma-repo (основной) и supabase-repo (PostgREST), общий интерфейс Repo
src/lib/session.ts     пользователь через supabase.auth.getUser() на сервере, роль из profiles
src/middleware.ts      защита маршрутов и обновление сессии
src/app/               экраны: /login, /objects, /objects/[id], /tasks/[id], /my-tasks
scripts/security-check.ts  прямые запросы к Supabase от имени исполнителя: всё запрещённое должно отклоняться
tests/, e2e/           unit и e2e
docs/ASSUMPTIONS.md    решения и допущения
```

## Запуск локально
Нужен Node.js 22+.
```bash
npm install            # postinstall запускает prisma generate
cp .env.example .env.local   # заполнить значения
npm run dev            # http://localhost:3000
```
База: создайте проект Supabase, примените `supabase/migrations/*` по порядку (SQL Editor или `supabase db push`), создайте пользователей `manager@`, `worker1@`, `worker2@demo.local` в Authentication → Users, затем выполните `supabase/seed.sql`. В Authentication → Sign In / Providers выключите «Allow new users to sign up».

### Переменные окружения
| Переменная | Где | Назначение |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | браузер + сервер | URL проекта |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | браузер + сервер | publishable (anon) ключ, публичный по своей природе |
| `DATABASE_URL` | только сервер | Session pooler `postgresql://postgres.<ref>:<пароль>@aws-…pooler.supabase.com:5432/postgres`. Спецсимволы пароля URL-кодировать |
| `DATA_DRIVER` | только сервер | `prisma` (по умолчанию при заданном `DATABASE_URL`) или `supabase` |
| `CHECK_*` | локально | логины тестовых пользователей для `test:security` и e2e |

`service_role` нигде не используется и не нужен.

## Тесты
```bash
npm test                 # unit: таблица переходов совпадает с БД, доступные действия по ролям
npm run test:security    # REST от имени исполнителя: чужое не читается и не меняется, запрещённые переходы отклоняются
npx playwright install chromium && npm run build && npm start &
E2E_BASE_URL=http://localhost:3000 npx playwright test   # e2e: роли, чужая задача, полный цикл статусов (за собой убирает)
supabase/tests/run-local.sh   # SQL-тесты политик на локальном Postgres; облачный вариант: rls_and_workflow.cloud.test.sql
npm run lint && npm run typecheck
```

## Безопасность
- **RLS** включён (и `FORCE`) на всех таблицах. Исполнитель видит только задачи, где он исполнитель, и объекты, где у него есть задачи. `anon` не имеет прав.
- **Переходы статусов** проверяет BEFORE-триггер `tasks_guard` по таблице `task_transition_actor`: кто может, из какого статуса в какой, комментарий для «На доработке». Колонка `status` не выдана клиентам в `GRANT UPDATE`, менять статус можно только через `change_task_status()`.
- **История** пишется AFTER-триггером. У клиентов есть только `SELECT`, поэтому подделать, изменить или удалить её через API нельзя.
- **Prisma не обходит RLS**: соединение идёт под `postgres`, но каждый запрос выполняется в транзакции с `SET LOCAL ROLE authenticated` и `set_config('request.jwt.claims', {sub, role}, true)`, где `sub` берётся из проверенного `auth.getUser()`. Вызовов Prisma вне этой обёртки (`withRls`) в коде нет.
- Серверные проверки роли в Server Actions дублируют БД для понятных сообщений, но решает БД. Ошибки триггеров переводятся на русский (`src/lib/errors.ts`).
- Регистрации в UI нет, в Supabase signup выключен. `service_role` в коде и репозитории отсутствует.

## Деплой (Vercel)
**Прод: https://test2b-crm.vercel.app** (драйвер Prisma, Session pooler). Тестовые учётки передаются отдельно.

Импортировать репозиторий как Next.js-проект (корень репозитория), Node 22+. Задать env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` (Session pooler, только Production/Preview, не публичная). `npm run build` сам выполняет `prisma generate`. В Supabase → Authentication → URL Configuration добавить домен Vercel в Site URL.
