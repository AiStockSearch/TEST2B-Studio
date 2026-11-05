import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Креды тестовых пользователей берутся из env (CHECK_*), в репозитории их нет.
const env = (k: string) => process.env[k] ?? "";
const MANAGER = { email: env("CHECK_MANAGER_EMAIL"), password: env("CHECK_MANAGER_PASSWORD") };
const WORKER = { email: env("CHECK_WORKER_EMAIL"), password: env("CHECK_WORKER_PASSWORD") };
const WORKER2 = { email: env("CHECK_WORKER2_EMAIL"), password: env("CHECK_WORKER2_PASSWORD") };

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Пароль").fill(u.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function managerApi() {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  await sb.auth.signInWithPassword(MANAGER);
  return sb;
}

test.afterAll(async () => {
  // уборка: задачи, созданные автотестом (история удаляется каскадом)
  const sb = await managerApi();
  const { data: tasks } = await sb.from("tasks").select("id").like("title", "E2E проверка %");
  const ids = (tasks ?? []).map((t) => t.id);
  if (ids.length) {
    const { data: files } = await sb.from("task_attachments").select("storage_path").in("task_id", ids);
    if (files?.length) await sb.storage.from("task-photos").remove(files.map((f) => f.storage_path));
    await sb.from("tasks").delete().in("id", ids);
  }
});

test("без входа — редирект на /login, регистрации нет", async ({ page }) => {
  await page.goto("/objects");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/регистрац/i)).toHaveCount(0);
});

test("неверный пароль — понятная ошибка", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(WORKER.email);
  await page.getByLabel("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Неверный email или пароль");
});

test("исполнитель видит только своё и не открывает чужую задачу", async ({ page }) => {
  const sb = await managerApi();
  const { data: all } = await sb.from("tasks").select("id,assignee_id,status,profiles!tasks_assignee_id_fkey(id)");
  await login(page, WORKER);
  await expect(page).toHaveURL(/\/my-tasks/);
  await expect(page.getByTestId("user-role")).toHaveText("Исполнитель");
  await page.getByLabel("Статус:").selectOption("all");
  const { data: me } = await createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } })
    .auth.signInWithPassword(WORKER);
  const own = all!.filter((t) => t.assignee_id === me.user!.id);
  const foreign = all!.filter((t) => t.assignee_id !== me.user!.id);
  await expect(page.getByTestId("task-list").locator("li")).toHaveCount(own.length);
  await page.screenshot({ path: "test-results/worker-my-tasks.png", fullPage: true });

  await page.goto(`/tasks/${foreign[0].id}`);
  await expect(page.getByText("Не найдено")).toBeVisible();

  // На задаче «На проверке» у исполнителя нет действий
  const review = own.find((t) => t.status === "review");
  if (review) {
    await page.goto(`/tasks/${review.id}`);
    await expect(page.getByTestId("no-actions")).toBeVisible();
  }
  await page.goto("/objects");
  await expect(page.getByRole("button", { name: "Новый объект" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/worker-objects.png", fullPage: true });
});

test("полный цикл с фото: создать с фото → в работу → на проверку с фото → доработка → принять; worker1 не видит", async ({ browser }) => {
  test.skip(!WORKER2.email, "нужны CHECK_WORKER2_*");
  const m = await (await browser.newContext()).newPage();
  const w = await (await browser.newContext()).newPage();
  const w1 = await (await browser.newContext()).newPage();
  await login(m, MANAGER);
  await expect(m).toHaveURL(/\/objects/);
  await m.getByTestId("object-card").first().click();
  await m.waitForURL(/\/objects\/[0-9a-f-]{36}/);
  await m.getByRole("button", { name: "Новая задача" }).click();
  const title = `E2E проверка ${Date.now()}`;
  const dlg = m.getByRole("dialog");
  await dlg.getByLabel("Название").fill(title);
  await dlg.getByLabel("Описание").fill("Автотест, будет удалена");
  await dlg.getByLabel("Исполнитель").selectOption({ label: "Олег Отделочников" });
  await m.getByTestId("brief-photos").setInputFiles("e2e/fixtures/brief.png");
  await expect(m.getByTestId("brief-photos-previews").locator("img")).toHaveCount(1);
  await m.getByRole("button", { name: "Сохранить" }).click();
  await m.waitForURL(/\/tasks\//);
  const taskUrl = new URL(m.url()).pathname;
  await expect(m.getByTestId("task-status")).toHaveText("Новая");
  await expect(m.getByTestId("gallery-brief").getByTestId("photo")).toHaveCount(1);
  await expect(m.getByTestId("no-actions")).toContainText("ход исполнителя");

  await login(w, WORKER2);
  await w.goto(taskUrl);
  await w.waitForLoadState("networkidle");
  await expect(w.getByTestId("gallery-brief").getByTestId("photo")).toHaveCount(1);
  await w.getByRole("button", { name: "Взять в работу" }).click();
  await w.getByTestId("confirm-action").click();
  await expect(w.getByTestId("task-status")).toHaveText("В работе");
  await w.getByRole("button", { name: "Отправить на проверку" }).click();
  await w.getByTestId("result-photos").setInputFiles("e2e/fixtures/result.png");
  await w.getByLabel(/Комментарий/).fill("Готово, фото приложил");
  await w.getByTestId("confirm-action").click();
  await expect(w.getByTestId("task-status")).toHaveText("На проверке");
  await expect(w.getByTestId("gallery-result").getByTestId("photo")).toHaveCount(1);
  await expect(w.getByTestId("no-actions")).toContainText("на проверке");
  await expect(w.getByTestId("history")).toContainText("Готово, фото приложил");

  // worker1 не видит чужую задачу и её фото
  await login(w1, WORKER);
  await w1.goto(taskUrl);
  await expect(w1.getByText("Не найдено")).toBeVisible();
  await expect(w1.getByTestId("photo")).toHaveCount(0);

  await m.goto(taskUrl);
  await m.waitForLoadState("networkidle");
  await expect(m.getByTestId("gallery-result").getByTestId("photo")).toHaveCount(1);
  await m.getByRole("button", { name: "Вернуть на доработку" }).click();
  await m.getByTestId("confirm-action").click();
  await expect(m.getByRole("dialog").getByRole("alert")).toContainText("доработать");
  await m.getByRole("dialog").getByLabel(/Комментарий/).fill("Переделать швы");
  await m.getByTestId("confirm-action").click();
  await expect(m.getByTestId("task-status")).toHaveText("На доработке");
  await expect(m.getByTestId("history")).toContainText("Переделать швы");

  await w.goto(taskUrl);
  await w.waitForLoadState("networkidle");
  await w.getByRole("button", { name: "Взять в работу" }).click();
  await w.getByTestId("confirm-action").click();
  await expect(w.getByTestId("task-status")).toHaveText("В работе");
  await w.getByRole("button", { name: "Отправить на проверку" }).click();
  await w.getByTestId("confirm-action").click();
  await expect(w.getByTestId("task-status")).toHaveText("На проверке");

  await m.goto(taskUrl);
  await m.waitForLoadState("networkidle");
  await m.getByRole("button", { name: "Принять" }).click();
  await m.getByTestId("confirm-action").click();
  await expect(m.getByTestId("task-status")).toHaveText("Принята");
  await expect(m.getByTestId("history").locator("li")).toHaveCount(7);
  await expect(m.getByTestId("no-actions")).toContainText("принята");
  await m.screenshot({ path: "test-results/manager-task.png", fullPage: true });
});

test("фильтры: объекты (поиск, незакрытые), карточка объекта, мои задачи", async ({ page }) => {
  await login(page, MANAGER);
  await page.waitForLoadState("networkidle");
  const cards = page.getByTestId("object-card");
  const total = await cards.count();
  await page.getByTestId("objects-search").fill("Северный");
  await expect(page).toHaveURL(/q=/);
  await expect(cards).toHaveCount(1);
  await page.getByTestId("objects-search").fill("");
  await expect(page).not.toHaveURL(/q=/);
  await expect(cards).toHaveCount(total);
  await page.getByTestId("only-open").click();
  await expect(page).toHaveURL(/open=1/);
  await page.getByTestId("open-link").first().click();
  await expect(page).toHaveURL(/\/objects\/[0-9a-f-]{36}\?status=active/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("chip-active")).toHaveClass(/bg-primary/);
  await page.getByTestId("chip-all").click();
  await expect(page).not.toHaveURL(/status=/);
  const all = await page.getByTestId("task-list").locator("li").count();
  await page.getByLabel("Исполнитель:").selectOption({ index: 1 });
  await expect(page).toHaveURL(/assignee=/);
  const byWorker = await page.getByTestId("task-list").locator("li").count().catch(() => 0);
  expect(byWorker).toBeLessThanOrEqual(all);
  await page.goto("/my-tasks?status=all");
  const everything = await page.getByTestId("task-list").locator("li").count();
  await page.getByLabel("Объект:").selectOption({ index: 1 });
  await expect(page).toHaveURL(/object=/);
  await expect(page.getByTestId("filter-count")).toContainText(`из ${everything}`);
  expect(await page.getByTestId("task-list").locator("li").count()).toBeLessThan(everything);

  // исполнитель: на карточке объекта фильтра по исполнителю нет
  const ctx = await page.context().browser()!.newContext();
  const w = await ctx.newPage();
  await login(w, WORKER);
  await w.goto("/objects");
  await w.getByTestId("object-card").first().click();
  await expect(w.getByTestId("status-chips")).toBeVisible();
  await expect(w.getByLabel("Исполнитель:")).toHaveCount(0);
});
