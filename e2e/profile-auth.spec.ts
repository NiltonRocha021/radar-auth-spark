import { test, expect } from "@playwright/test";

// E2E: proteção da rota /profile.
//
// Sem sessão: o guard de `_authenticated` redireciona para /login (ou, quando
// a sessão ainda hidrata no client, o AuthGate impede o render do formulário).
// Nunca deve aparecer o formulário de perfil para anônimo, e a falha deve ser
// comunicada inline (nunca tela em branco).

test.describe("/profile — acesso anônimo", () => {
  test("redireciona para /login e não renderiza o formulário de perfil", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/login");
    await expect(page.getByRole("heading", { name: /profile/i })).toHaveCount(0);
  });

  test("deep link com ?tab=wishlist também é bloqueado", async ({ page }) => {
    await page.goto("/profile?tab=wishlist");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");
  });

  test("a página não fica em branco (há conteúdo renderizado)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe("/profile — falha de sessão aparece inline", () => {
  test("sessão inválida no storage: mostra alerta inline em vez de crash", async ({ page, baseURL }) => {
    await page.goto("/login");
    // Injeta um token corrompido — o client não consegue hidratar a sessão.
    await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.startsWith("sb-"));
      if (key) window.localStorage.setItem(key, "{}");
    });

    await page.goto(`${baseURL}/profile`);
    await page.waitForLoadState("networkidle");

    // Ou redireciona para o login, ou mostra o alerta inline de sessão.
    const onLogin = page.url().includes("/login");
    if (!onLogin) {
      await expect(page.getByRole("alert").first()).toBeVisible();
      await expect(page.getByText(/sess(ã|a)o necess(á|a)ria|não foi possível carregar/i)).toBeVisible();
    }
    expect(await page.locator("body").innerText()).not.toBe("");
  });
});
