import { chromium } from 'playwright-core';
const EXE = 'C:/Users/A/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const t = new Date().toISOString();
  const dy = {
    id: 'task-dy-1', postId: 'dy-post-1',
    title: '90%的家长都踩过这个坑：作业辅导顺序错了',
    content: '很多家长辅导作业都是从第一题开始讲，讲到最后孩子困了、家长火了。正确顺序应该是：先让孩子自己做完 → 只圈错题不讲解 → 让孩子自己讲思路 → 家长再补最后一步。这样孩子记住的是方法不是答案。',
    accountName: '南星教育', coverUrl: '', platform: 'douyin',
    addedAt: t, status: 'done', mode: 'recreate',
    result: '【新标题】\n辅导作业顺序错了，越辅导越差\n90%家长都踩的坑：先讲第一题\n作业辅导的正确4步顺序\n\n【新正文】\n别再从第一题开始讲了！\n正确顺序：自己做完 → 圈错题 → 孩子讲思路 → 家长补最后一步。\n孩子记住的是方法，不是答案。\n\n【标签】\n#家长必看 #作业辅导 #学习方法',
    resultAt: t,
    studio: {
      stage: 1,
      titleOptions: ['辅导作业顺序错了，越辅导越差', '90%家长都踩的坑：先讲第一题', '作业辅导的正确4步顺序'],
      chosenTitle: '辅导作业顺序错了，越辅导越差',
      scriptOptions: [
        '【Hook】你辅导作业是不是也从第一题开始讲？那孩子只会越来越依赖你。\n【痛点】讲到最后，孩子困了，家长火了，作业还是不会。\n【方法】记住这个顺序：先让孩子自己做完 → 你只圈错题不讲解 → 让孩子把解题思路讲给你听 → 最后你只补那关键一步。\n【行动】今晚就试一次，你会发现孩子记住的是方法，不是答案。',
        '【Hook】作业辅导这个坑，90%的家长每天都在踩。\n【冲突】从第一题讲到最后一题，看似负责，其实是在替孩子思考。\n【方法】换成四步：自己做完、圈错题、讲思路、补最后一步。把"讲"变成"问"，孩子的大脑才会真正运转。\n【行动】收藏这条，今晚辅导前看一遍。',
        '【Hook】别再一题一题讲了，越讲越差。\n【痛点】你讲得越细，孩子越不动脑，下次照样错。\n【方法】正确顺序四步：自己做、圈错题、讲思路、家长补最后一步。关键是第三步，让孩子说出来，你才能知道他卡在哪。\n【行动】试一周，回来告诉我变化。',
      ],
      chosenScript: '【Hook】你辅导作业是不是也从第一题开始讲？那孩子只会越来越依赖你。\n【痛点】讲到最后，孩子困了，家长火了，作业还是不会。\n【方法】记住这个顺序：先让孩子自己做完 → 你只圈错题不讲解 → 让孩子把解题思路讲给你听 → 最后你只补那关键一步。\n【行动】今晚就试一次，你会发现孩子记住的是方法，不是答案。',
      outline: [], sections: [], images: [],
    },
  };
  localStorage.setItem('reprocess_queue_v1', JSON.stringify([dy]));
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
const dy = await page.$('button:has-text("抖音")');
if (dy) { await dy.click(); await page.waitForTimeout(1500); }
await page.screenshot({ path: 'C:/Users/A/WorkBuddy/2026-09-03-10-06-07/二创加工-抖音口播稿版.png' });
await browser.close();
console.log('DONE');
