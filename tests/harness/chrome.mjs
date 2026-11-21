// Headless Chromium: CHROME_PATH, else Google Chrome on macOS, else the Playwright
// Chromium installed for playwright-core (`npx playwright-core install chromium`).
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function launchBrowser() {
  const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
  return chromium.launch({ executablePath, headless: true });
}
