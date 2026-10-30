const { chromium } = require("playwright");
const assert = require("node:assert/strict");
require("node:fs").mkdirSync("work", { recursive: true });
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  checks.push = function (s) {
    console.log("PASS " + s);
    return Array.prototype.push.call(this, s);
  };
  await page.goto(base + "", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: /A higher.*level of chess/i })
    .waitFor();
  await page.screenshot({ path: "work/home-desktop.png", fullPage: true });
  checks.push("Desktop home renders");
  await page.getByRole("button", { name: "Join the arena" }).click();
  await page.getByRole("button", { name: "Explore as a demo player" }).click();
  await page.getByRole("button", { name: "Alex" }).waitFor();
  checks.push("Demo sign-in");
  await page.goto(base + "/tournaments/rising-stars-under-1600", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Register a player" }).click();
  await page
    .getByRole("button", { name: "Use a sample player for the demo" })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Complete demo registration" })
    .click();
  await page
    .getByRole("heading", { name: "Demo registration complete" })
    .waitFor();
  await page.screenshot({ path: "work/registration.png" });
  await page.getByRole("button", { name: "View my registrations" }).click();
  await page.getByText("sample_knight", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByText("sample_knight", { exact: true }).count(),
    1,
  );
  checks.push("Registration and persistence");
  await page.goto(base + "/tournaments/rising-stars-under-1600", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Save for later" }).click();
  await page.getByRole("button", { name: "Saved to your playbook" }).waitFor();
  await page.getByRole("button", { name: "Register a player" }).click();
  await page
    .getByRole("button", { name: "Use a sample player for the demo" })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Complete demo registration" })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "already registered" })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push("Bookmark and duplicate prevention");
  await page.goto(base + "/tournaments?category=Rapid&entry=free", {
    waitUntil: "networkidle",
  });
  assert.equal(await page.locator(".tournament-card").count(), 1);
  checks.push("URL filters");
  await page.goto(base + "/community", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start a discussion" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("A new practice challenge");
  await page
    .getByLabel("Your post")
    .fill("Looking for a friendly rapid practice partner this weekend.");
  await page.getByRole("button", { name: "Publish discussion" }).click();
  await page
    .getByRole("button", { name: "A new practice challenge", exact: true })
    .click();
  await page
    .getByLabel("Add to the discussion")
    .fill("Happy to join for a practice game.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await page
    .getByText("Happy to join for a practice game.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  checks.push("Community posts and comments");
  await page.goto(base + "/admin", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Explore the demo studio" }).click();
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await page.getByLabel("Tournament name").fill("QA Rapid Invitational");
  await page
    .getByLabel("Description & prize distribution")
    .fill(
      "A friendly rapid event with no entry fee and a welcoming player field.",
    );
  const future = new Date(Date.now() + 5 * 86400000),
    close = new Date(future - 3600000);
  await page
    .getByLabel("Starts (your local time)")
    .fill(future.toISOString().slice(0, 16));
  await page
    .getByLabel("Registration closes (local time)")
    .fill(close.toISOString().slice(0, 16));
  await page.locator('select[name="status"]').selectOption("open");
  await page.getByRole("button", { name: "Save tournament" }).click();
  await page.locator(".modal").waitFor({ state: "hidden" });
  await page
    .locator(".admin-nav")
    .getByRole("button", { name: "Tournaments", exact: true })
    .click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "QA Rapid Invitational" });
  await row.waitFor();
  await row.getByTitle("Edit tournament").click();
  await page.getByLabel("Tournament name").fill("QA Rapid Championship");
  await page.getByRole("button", { name: "Save tournament" }).click();
  await page.locator(".modal").waitFor({ state: "hidden" });
  const edited = page
    .getByRole("row")
    .filter({ hasText: "QA Rapid Championship" });
  await edited.getByTitle("Import standings").click();
  await page
    .getByLabel("CSV data")
    .fill(
      "username,score,wins,draws,losses,tiebreak\nsample_knight,7,7,0,0,32",
    );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import standings", exact: true })
    .click();
  await page.locator(".modal").waitFor({ state: "hidden" });
  await page.screenshot({ path: "work/organizer.png", fullPage: true });
  checks.push("Organizer create/edit and standings import");
  await page.goto(base + "/tournaments/qa-rapid-invitational", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Standings", exact: true }).click();
  await page
    .getByRole("cell", { name: "sample_knight", exact: true })
    .waitFor();
  checks.push("Imported standings render");
  await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await page
    .getByRole("button", { name: "Withdraw player", exact: true })
    .click();
  await page.getByText("withdrawn", { exact: true }).waitFor();
  checks.push("Withdrawal confirmation");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/tournaments",
    "/tournaments/knightfall-grand-prix",
    "/community",
    "/leaderboard",
    "/about",
    "/help",
    "/legal/terms",
  ]) {
    await mobile.goto(base + "" + path, { waitUntil: "networkidle" });
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Mobile overflow " + path,
    );
  }
  await mobile.goto(base + "", { waitUntil: "networkidle" });
  await mobile.screenshot({ path: "work/home-mobile.png", fullPage: true });
  await mobile.getByRole("button", { name: "Open navigation" }).click();
  await mobile
    .locator(".sidebar")
    .getByRole("link", { name: "Community", exact: true })
    .click();
  await mobile
    .getByRole("heading", { name: "Find your chess people." })
    .waitFor();
  checks.push("Mobile layout and navigation across 8 routes");
  assert.equal((await page.request.get(base + "/api/admin")).status(), 401);
  assert.equal(
    (
      await page.request.post(base + "/api/registration", {
        data: { fee_paise: 0 },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await page.request.get(base + "/api/chess/player?username=../bad")
    ).status(),
    400,
  );
  checks.push("Anonymous API requests rejected");
  console.log(JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
