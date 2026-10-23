import { expect, type Page } from "@playwright/test";

/** Signs in through the development-only demo account panel on /login. */
export async function demoSignIn(page: Page, roleLabel: string, personName: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`${roleLabel}.*${personName}`) }).click();
  await page.waitForURL(/\/(app|platform)(\/|$|\?)/);
}

export async function expectToast(page: Page, text: RegExp | string) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
