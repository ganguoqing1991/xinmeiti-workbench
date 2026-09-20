import { chromium } from 'playwright-core';
const EXE = 'C:/Users/A/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const t = new Date().toISOString();
  const dyTask = {
    id: 'task-dy-1', postId: 'dy-post-1',
    title: '90%的家长都踩过这个坑：作业辅导顺序错了',
    content: '很多家长辅导作业都是从第一题开始讲，讲到最后孩子困了、家长火了。正确顺序应该是：先让孩子自己做完 → 只圈错题不讲解 → 让孩子自己讲思路 → 家长再补最后一步。这样孩子记住的是方法不是答案。',
    accountName: '南星教育', coverUrl: '', platform: 'douyin',
    addedAt: t, status: 'done', mode: 'recreate',
    result: '【新标题】\n辅导作业顺序错了，越辅导越差\n90%家长都踩的坑：先讲第一题\n作业辅导的正确4步顺序\n\n【新正文】\n别再从第一题开始讲了！\n正确顺序：自己做完 → 圈错题 → 孩子讲思路 → 家长补最后一步。\n孩子记住的是方法，不是答案。\n\n【标签】\n#家长必看 #作业辅导 #学习方法',
    resultAt: t,
    studio: {
      stage: 0,
      titleOptions: ['辅导作业顺序错了，越辅导越差', '90%家长都踩的坑：先讲第一题', '作业辅导的正确4步顺序'],
      chosenTitle: '辅导作业顺序错了，越辅导越差',
      outline: ['钩子：别从第一题开始讲', '正确顺序四步', '家长最容易犯的错', '行动号召：今晚试一次'],
      sections: ['别再从第一题开始讲了！', '正确顺序：自己做完 → 圈错题 → 孩子讲思路 → 家长补最后一步。', '孩子记住的是方法，不是答案。'],
      images: [
        { id: 'd1', url: 'https://picsum.photos/seed/dy1/720/1280', prompt: '', source: 'ai', isCover: true, createdAt: t },
        { id: 'd2', url: 'https://picsum.photos/seed/dy2/720/1280', prompt: '', source: 'ai', isCover: false, createdAt: t },
        { id: 'd3', url: 'https://picsum.photos/seed/dy3/720/1280', prompt: '', source: 'ai', isCover: false, createdAt: t },
      ],
      metrics: { likes: 8620, collects: 2340, comments: 431, shares: 908 },
    },
  };
  localStorage.setItem('reprocess_queue_v1', JSON.stringify([dyTask]));
  localStorage.setItem('reprocess_last_platform', 'douyin');
});
await page.goto('http://localhost:5173/reprocess', { waitUntil: 'load' });
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
await page.goto('http://localhost:5173/reprocess', { waitUntil: 'load' });
await page.waitForTimeout(3000);
// 确保平台切到抖音
const dy = await page.$('button:has-text("抖音")');
if (dy) { await dy.click(); await page.waitForTimeout(1500); }
await page.screenshot({ path: 'C:/Users/A/WorkBuddy/2026-09-03-10-06-07/二创加工新版面-抖音演示.png' });
await browser.close();
console.log('DONE');
