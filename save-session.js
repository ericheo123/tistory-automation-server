const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const outPath = path.join(__dirname, 'storageState.json');

  console.log('브라우저가 열립니다.');
  console.log('카카오/티스토리 로그인을 완료하고, 티스토리 관리 화면까지 진입하세요.');
  console.log('준비가 끝나면 이 터미널 창으로 돌아와 Enter를 누르세요.');

  await page.goto('https://www.tistory.com/', { waitUntil: 'domcontentloaded' });

  process.stdin.setEncoding('utf8');
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  const storageState = await context.storageState();
  fs.writeFileSync(outPath, JSON.stringify(storageState, null, 2), 'utf8');

  console.log(`세션 저장 완료: ${outPath}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
