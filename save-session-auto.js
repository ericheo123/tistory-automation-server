const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_HINTS = ['/manage', 'tistory.com/manage', 'newpost'];
const MAX_WAIT_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

function looksReady(url) {
  return TARGET_HINTS.some((hint) => String(url || '').includes(hint));
}

function allPages(context) {
  try {
    return context.pages();
  } catch {
    return [];
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext();
  const outPath = path.join(__dirname, 'storageState.json');

  console.log('브라우저가 열립니다.');
  console.log('반드시 이 스크립트가 띄운 "Chrome for Testing" 창에서 로그인하세요.');
  console.log('카카오/티스토리 로그인 후, 같은 창 또는 새로 열린 탭에서 티스토리 관리 화면까지 들어가면 자동 저장됩니다.');

  const firstPage = await context.newPage();
  await firstPage.goto('https://www.tistory.com/', { waitUntil: 'domcontentloaded' });

  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    for (const page of allPages(context)) {
      const currentUrl = page.url();
      if (looksReady(currentUrl)) {
        const storageState = await context.storageState();
        fs.writeFileSync(outPath, JSON.stringify(storageState, null, 2), 'utf8');
        console.log(`세션 저장 완료: ${outPath}`);
        console.log(`감지된 URL: ${currentUrl}`);
        await browser.close();
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
  }

  throw new Error('로그인 대기 시간이 초과되었습니다. 관리 화면까지 진입한 뒤 다시 시도해주세요.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
