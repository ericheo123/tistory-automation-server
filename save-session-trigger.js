const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const triggerPath = path.join(__dirname, 'capture-now.txt');
const outPath = path.join(__dirname, 'storageState.json');
const maxWaitMs = 10 * 60 * 1000;

async function main() {
  try {
    fs.unlinkSync(triggerPath);
  } catch {}

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Chrome for Testing 창이 열립니다.');
  console.log('이 창에서 티스토리 로그인을 끝낸 뒤, Codex에 완료라고 말하세요.');
  console.log('그러면 capture-now 신호를 받아 세션을 저장합니다.');

  await page.goto('https://www.tistory.com/', { waitUntil: 'domcontentloaded' });

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (fs.existsSync(triggerPath)) {
      const state = await context.storageState();
      fs.writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');
      console.log(`세션 저장 완료: ${outPath}`);
      try {
        fs.unlinkSync(triggerPath);
      } catch {}
      await browser.close();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('세션 저장 대기 시간이 초과되었습니다.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
