// 二创加工页截图验证脚本：先走真实初始化流程，再截图
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/A/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

// 注入演示任务（看工作台全貌）
await page.addInitScript(() => {
  const task = {
    id: 'task-demo-1',
    postId: 'demo-post-1',
    title: '对标内容，别只抄句子',
    content:
      '看到一篇爆款内容，很多人第一反应是：抄！但真正能持续做出爆款的人，都会先拆解，再创作。对标不是复制文案，而是拆解它的结构、选题逻辑、情绪钩子和表达方式。可以从 4 个维度入手：选题、标题结构、开头钩子、结尾行动号召。做二创时先记录这个点带过了哪些笔记，整理它们的开头和结尾句式，再为 3 个案例支撑观点，给出行动建议。记住，好的内容不是凭空出现，而是在有效对标后，结合自身经验做出的优化与创新。',
    accountName: '芥舟语文',
    coverUrl: '',
    platform: 'xiaohongshu',
    addedAt: new Date().toISOString(),
    status: 'done',
    mode: 'recreate',
    result:
      '【新标题】\n爆款笔记抄之前，先拆这4层\n别再盲抄了！对标拆解才涨粉\n一句话教会你拆爆款结构\n\n【新正文】\n看到爆款第一反应是抄？那你已经输了。\n真正的高手都先拆解再创作：选题逻辑、标题结构、开头钩子、行动号召，一层一层看透。\n从今天起，抄结构不抄句子，涨粉速度翻倍。\n\n【标签】\n#小红书运营 #内容创作 #对标拆解',
    resultAt: new Date().toISOString(),
  };
  localStorage.setItem('reprocess_queue_v1', JSON.stringify([task]));
  localStorage.setItem('reprocess_last_platform', 'xiaohongshu');
});

await page.goto(BASE + '/reprocess', { waitUntil: 'load' });
await page.waitForTimeout(1500);

// 若被登录门控拦住，走「创建并进入」初始化
const nameInput = await page.$('input[placeholder*="张三"]');
if (nameInput) {
  console.log('[gate] filling setup form');
  await nameInput.fill('老甘');
  const pwInputs = await page.$$('input[type="password"]');
  if (pwInputs.length >= 2) {
    await pwInputs[0].fill('demo123456');
    await pwInputs[1].fill('demo123456');
  }
  await page.click('button:has-text("创建并进入")');
  await page.waitForTimeout(2500);
}

// 进入二创页
await page.goto(BASE + '/reprocess', { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('URL:', page.url());
const t = ((await page.textContent('body')) || '').replace(/\s+/g, ' ').slice(0, 200);
console.log('BODY:', t);
await page.screenshot({ path: '_verify_reprocess.png', fullPage: false });

// 切抖音平台
const douyinBtn = await page.$('button:has-text("抖音")');
if (douyinBtn) {
  await douyinBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '_verify_douyin.png', fullPage: false });
}

// API 配置页
await page.goto(BASE + '/api', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '_verify_api.png', fullPage: true });

await browser.close();
console.log('DONE');
