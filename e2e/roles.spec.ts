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
  await sb.from("tasks").delete().like("title", "E2E проверка %");
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

test("полный цикл: создать → в работу → на проверку → на доработку (с комментарием) → удалить", async ({ browser }) => {
  test.skip(!WORKER2.email, "нужны CHECK_WORKER2_*");
  const m = await (await browser.newContext()).newPage();
  const w = await (await browser.newContext()).newPage();
  await login(m, MANAGER);
  await expect(m).toHaveURL(/\/objects/);
  await m.locator("[data-testid=objects-list] a").first().click();
  await m.getByRole("button", { name: "Новая задача" }).click();
  const title = `E2E проверка ${Date.now()}`;
  await m.getByLabel("Название").fill(title);
  await m.getByLabel("Описание").fill("Автотест, будет удалена");
  await m.getByLabel("Исполнитель").selectOption({ label: "Олег Отделочников" });
  await m.getByRole("button", { name: "Сохранить" }).click();
  await m.waitForURL(/\/tasks\//);
  const taskUrl = new URL(m.url()).pathname;
  await expect(m.getByTestId("task-status")).toHaveText("Новая");
  await expect(m.getByTestId("no-actions")).toBeVisible(); // постановщик не берёт в работу

  await login(w, WORKER2);
  await w.goto(taskUrl);
  await w.waitForLoadState("networkidle"); // дождаться гидратации перед кликом
  await w.getByRole("button", { name: "Взять в работу" }).click();
  await expect(w.getByTestId("task-status")).toHaveText("В работе");
  await w.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(w.getByTestId("task-status")).toHaveText("На проверке");
  await expect(w.getByTestId("no-actions")).toBeVisible();

  await m.goto(taskUrl);
  await m.waitForLoadState("networkidle");
  await m.getByRole("button", { name: "Вернуть на доработку" }).click();
  await expect(m.getByRole("alert").filter({ hasText: /\S/ })).toContainText("доработать");
  await expect(m.getByTestId("task-status")).toHaveText("На проверке");
  await m.getByLabel(/Комментарий/).fill("Переделать швы");
  await m.getByRole("button", { name: "Вернуть на доработку" }).click();
  await expect(m.getByTestId("task-status")).toHaveText("На доработке");
  await expect(m.getByTestId("history")).toContainText("Переделать швы");
  await expect(m.getByTestId("history").locator("li")).toHaveCount(4);
  await m.screenshot({ path: "test-results/manager-task.png", fullPage: true });

  await m.getByRole("button", { name: "Удалить" }).first().click();
  await m.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await m.waitForURL(/\/objects\//);
  await expect(m.getByText(title)).toHaveCount(0);
});
