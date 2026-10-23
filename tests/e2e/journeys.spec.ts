import { expect, test } from "@playwright/test";
import { demoSignIn, expectToast } from "./helpers";

test.describe("public site", () => {
  test("landing page explains the product and accepts a demo request", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One School. One Platform.");
    await expect(page.getByRole("heading", { name: "Everything a school runs on" })).toBeVisible();
    await page.getByLabel("School name").fill("E2E Test Matriculation School");
    await page.getByLabel("Your name").fill("Test Principal");
    await page.getByLabel("Email").fill("principal@school.test");
    await page.getByLabel("Mobile number").fill("9876543210");
    await page.getByRole("button", { name: "Request a demo" }).last().click();
    await expect(page.getByText("Request received")).toBeVisible();
  });

  test("protected pages redirect to sign-in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/app/students");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fstudents/);
  });
});

test.describe("school administrator", () => {
  test("admits a student with a guardian and finds them in the list", async ({ page }) => {
    await demoSignIn(page, "School Administrator", "Dr. Lakshmi Narayanan");
    await expect(page.getByText("Active students")).toBeVisible();
    await page.goto("/app/students/new");
    const adm = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByLabel("First name").fill("Nivetha");
    await page.getByLabel("Last name / initial").fill("S");
    await page.getByLabel("Date of birth").fill("2014-08-12");
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Female" }).click();
    await page.getByLabel("Admission number").fill(adm);
    await page.getByLabel("Class & section").click();
    await page.getByRole("option", { name: "Class 6 A" }).click();
    await page.getByLabel("Full name").fill("Sundar Raj");
    await page.getByLabel("Mobile number").fill("9812345678");
    await page.getByRole("button", { name: "Admit student" }).click();
    await expect(page.getByRole("heading", { name: /Nivetha S/ })).toBeVisible();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    await page.goto(`/app/students?q=${adm}`);
    await expect(page.getByRole("link", { name: "Nivetha S" })).toBeVisible();
  });
});

test.describe("teacher", () => {
  test("marks today's attendance for their class", async ({ page }) => {
    await demoSignIn(page, "Teacher", "Priya Raman");
    await page.goto("/app/attendance");
    await page.getByRole("row", { name: /Class 6 B/ }).getByRole("link").click();
    await expect(page.getByRole("heading", { name: /Class 6 B/ })).toBeVisible();
    const save = page.getByRole("button", { name: /Save attendance|Save corrections/ });
    if ((await save.textContent())?.includes("Save attendance")) {
      await page.getByRole("radio", { name: "Absent" }).first().click();
      await save.click();
      await expectToast(page, /Attendance saved/);
    } else {
      await expect(page.getByText(/no unsaved changes/)).toBeVisible();
    }
  });
});

test.describe("fees", () => {
  test("accountant records a counter payment and gets a numbered receipt", async ({ page }) => {
    await demoSignIn(page, "Accountant", "R. Meenakshi");
    await page.goto("/app/fees/dues?overdue=due");
    await page.locator("table a[href^='/app/fees/students/']").first().click();
    await page.getByLabel("Amount received (₹)").fill("500");
    await page.getByRole("button", { name: "Record payment & issue receipt" }).click();
    await expect(page).toHaveURL(/\/app\/fees\/receipts\//);
    await expect(page.getByText("Fee receipt")).toBeVisible();
    await expect(page.locator("dd", { hasText: /^SVM\/2026-27\/\d{5}$/ })).toBeVisible();
    await expect(page.getByText("Five hundred rupees only.")).toBeVisible();
  });

  test("parent pays online through the clearly labelled sandbox", async ({ page }) => {
    await demoSignIn(page, "Parent / Guardian", "Vignesh Raman");
    await page.goto("/app/fees");
    const pay = page.getByRole("button", { name: /Pay ₹.* online/ });
    test.skip(!(await pay.isVisible().catch(() => false)), "Nothing outstanding for this family in the current data");
    await expect(page.getByText(/Sandbox mode/)).toBeVisible();
    // Items due now are preselected; once those are paid only future items remain, unticked.
    if (await pay.isDisabled()) await page.getByRole("checkbox", { name: /^Pay / }).first().check();
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(page.getByText("Payment sandbox — not a real gateway")).toBeVisible();
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await expect(page).toHaveURL(/\/app\/fees\/receipts\//);
    await expect(page.getByText(/Sandbox transaction/)).toBeVisible();
  });
});

test.describe("isolation through direct requests", () => {
  test("a School B admin cannot open School A records by URL", async ({ page, request }) => {
    await demoSignIn(page, "School Administrator", "Dr. Lakshmi Narayanan");
    await page.goto("/app/students");
    const href = await page.locator("table a[href^='/app/students/']").first().getAttribute("href");
    await demoSignIn(page, "School Administrator", "Mrs. Fathima Begum");
    const res = await page.goto(href!);
    expect(res?.status()).toBe(404);
    // The export API is scoped to the signed-in school as well.
    const csv = await page.request.get("/api/export/students");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).not.toContain("SVM0");
    // Unauthenticated API calls are rejected.
    const anon = await request.get("/api/export/students", { headers: { cookie: "" } });
    expect(anon.status()).toBe(401);
  });

  test("a parent cannot see another family's receipt", async ({ page }) => {
    await demoSignIn(page, "Accountant", "R. Meenakshi");
    await page.goto("/app/fees/payments");
    const receipts = page.locator("table a[href^='/app/fees/receipts/']");
    const count = await receipts.count();
    let foreign: string | null = null;
    for (let i = 0; i < count && !foreign; i++) {
      const row = receipts.nth(i).locator("xpath=ancestor::tr");
      if (!(await row.textContent())?.match(/Aadhya|Kavin/)) foreign = await receipts.nth(i).getAttribute("href");
    }
    await demoSignIn(page, "Parent / Guardian", "Vignesh Raman");
    const res = await page.goto(foreign!);
    expect(res?.status()).toBe(404);
  });
});

test.describe("transport", () => {
  test("coordinator runs the labelled simulator and sees a live position", async ({ page }) => {
    await demoSignIn(page, "Transport Coordinator", "Ramesh Babu");
    await page.goto("/app/transport/simulator");
    await expect(page.getByText("Development simulator")).toBeVisible();
    await page.getByRole("button", { name: "Start simulated trip" }).click();
    await expect(page.getByText(/SIMULATED trip/)).toBeVisible();
    await expect(page.getByText(/Last update/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "End trip" }).click();
  });
});
