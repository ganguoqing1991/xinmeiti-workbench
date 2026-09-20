import { chromium } from 'playwright-core';
const EXE = 'C:/Users/A/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/api', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const nameInput = await page.$('input[placeholder*="张三"]');
if (nameInput) {
  await nameInput.fill('老甘');
  const pw = await page.$$('input[type="password"]');
  await pw[0].fill('demo123456');
  await pw[1].fill('demo123456');
  await page.click('button:has-text("创建并进入")');
  await page.waitForTimeout(2500);
}
await page.goto('http://localhost:5173/api', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const el = await page.$('text=生图模型（AI 配图）');
if (el) {
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '_verify_imggen.png' });
  // 再往下滚看模型名/尺寸/测试区
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '_verify_imggen2.png' });
}
await browser.close();
console.log('DONE');
