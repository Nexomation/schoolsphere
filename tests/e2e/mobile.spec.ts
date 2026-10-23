import { expect, test } from "@playwright/test";
import { demoSignIn } from "./helpers";

test("parent dashboard works on a phone without horizontal scrolling", async ({ page }) => {
  await demoSignIn(page, "Parent / Guardian", "Vignesh Raman");
  await expect(page.getByText("Homework pending")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL(/\/app\/attendance/);
  await expect(page.getByText("How this is calculated")).toBeVisible();
});
