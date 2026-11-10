// Usage: node capture.mjs <org-alias> <out-name> [lightning-path]
// Logs in with a one-time frontdoor URL from the Salesforce CLI (no password, no MFA prompt),
// opens the page, and saves a screenshot + a short video to ./out.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';

const [alias, name, path = '/lightning/page/home', app = 'standard__LightningSalesConsole'] = process.argv.slice(2);
mkdirSync('out', { recursive: true });
const { result } = JSON.parse(execFileSync('sf', ['org', 'open', '-o', alias, '--url-only', '--path', `/lightning/app/${app}`, '--json'], { encoding: 'utf8' }));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, recordVideo: { dir: 'out/video-tmp', size: { width: 1440, height: 900 } } });
const page = await context.newPage();
await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForURL(/lightning\//, { timeout: 90_000 });
await page.waitForTimeout(5000); // let the app load and become the current app
await page.goto(new URL(path, page.url()).toString(), { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
await page.locator('.slds-global-header, .appName, one-appnav').first().waitFor({ state: 'attached', timeout: 60_000 });
await page.waitForTimeout(8000); // let console tabs + home components settle
// close any "welcome"/setup assistant dialogs
for (const sel of ['button[title="Close"]', 'button:has-text("Dismiss")', 'button:has-text("Got It")']) {
  const b = page.locator(`section[role="dialog"] ${sel}`).first();
  if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
}
await page.screenshot({ path: `out/${name}.png` });
const video = page.video();
await context.close();
await browser.close();
renameSync(await video.path(), `out/${name}.webm`);
console.log(`saved out/${name}.png + out/${name}.webm (${page.url().replace(/^https:\/\/[^/]+/, '')})`);
