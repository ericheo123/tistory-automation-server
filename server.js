const fs = require('fs');
const path = require('path');
const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

const config = {
  port: Number(env('PORT', '3000')),
  blogUrl: env('TISTORY_BLOG_URL'),
  newPostUrl: env('TISTORY_NEW_POST_URL'),
  manageUrl: env('TISTORY_MANAGE_URL'),
  storageStatePath: env('TISTORY_STORAGE_STATE_PATH', path.join(__dirname, 'data', 'storageState.json')),
  headless: env('TISTORY_HEADLESS', 'true') !== 'false',
  slowMo: Number(env('TISTORY_SLOW_MO_MS', '0')),
  timeoutMs: Number(env('TISTORY_NAVIGATION_TIMEOUT_MS', '45000')),
  defaultCategoryId: env('TISTORY_CATEGORY_ID', '0'),
  defaultVisibility: env('TISTORY_VISIBILITY', 'public'),
  selectors: {
    title: env('TISTORY_TITLE_SELECTOR', 'textarea.textarea_tit||textarea[placeholder*="제목"]||input[name="title"]||textarea[name="title"]||input[placeholder*="제목"]'),
    editor: env('TISTORY_EDITOR_SELECTOR', '#editor-tistory_ifr||[contenteditable="true"]'),
    tagInput: env('TISTORY_TAG_INPUT_SELECTOR', 'input[name="tagText"]||input[placeholder*="태그"]||input[aria-label*="태그"]'),
    publishButton: env('TISTORY_PUBLISH_BUTTON_SELECTOR', 'button.btn.btn-default'),
    confirmButton: env('TISTORY_CONFIRM_BUTTON_SELECTOR', '.layer_foot .btn.btn-default'),
    htmlModeButton: env('TISTORY_HTML_MODE_BUTTON_SELECTOR', ''),
    htmlTextarea: env('TISTORY_HTML_TEXTAREA_SELECTOR', 'textarea:not(.textarea_tit)'),
    category: env('TISTORY_CATEGORY_SELECTOR', ''),
    publicRadio: env('TISTORY_PUBLIC_RADIO_SELECTOR', 'input[name="basicSet"]'),
    privateRadio: env('TISTORY_PRIVATE_RADIO_SELECTOR', 'input[name="basicSet"]'),
  },
};

function ensureDataDir() {
  fs.mkdirSync(path.dirname(config.storageStatePath), { recursive: true });
}
function storageStateExists() {
  return fs.existsSync(config.storageStatePath);
}
function writeStorageState(storageState) {
  ensureDataDir();
  fs.writeFileSync(config.storageStatePath, JSON.stringify(storageState, null, 2));
}

function splitSelectors(value) {
  return String(value || '').split('||').map((item) => item.trim()).filter(Boolean);
}

async function firstLocator(page, selectorString) {
  for (const selector of splitSelectors(selectorString)) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator;
  }
  return null;
}

async function clickFirst(page, selectorString) {
  const locator = await firstLocator(page, selectorString);
  if (!locator) return false;
  try { await locator.click(); } catch (err) { await locator.click({ force: true }); }
  return true;
}

async function fillFirst(page, selectorString, value) {
  const locator = await firstLocator(page, selectorString);
  if (!locator) return false;
  await locator.fill('');
  await locator.fill(value);
  return true;
}

function normalizeTags(tagsCsv) {
  return String(tagsCsv || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function resolveBlogUrl(inputUrl) {
  return String(inputUrl || config.blogUrl || '').replace(/\/+$/, '');
}
function resolveManageUrl(blogUrl) {
  return config.manageUrl || `${blogUrl}/manage`;
}
function resolveNewPostUrl(blogUrl) {
  return config.newPostUrl || `${blogUrl}/manage/newpost`;
}

// ─────────────────────────────────────────────
// 🔑 카카오 자동 로그인
//    환경변수: KAKAO_EMAIL, KAKAO_PASSWORD
// ─────────────────────────────────────────────
async function performKakaoLogin(page) {
  const kakaoEmail = env('KAKAO_EMAIL');
  const kakaoPassword = env('KAKAO_PASSWORD');

  if (!kakaoEmail || !kakaoPassword) {
    throw new Error(
      'KAKAO_EMAIL 또는 KAKAO_PASSWORD 환경변수가 설정되지 않았습니다. ' +
      'Render.com → Environment에서 추가해주세요.'
    );
  }

  console.log('[auto-login] 카카오 자동 로그인 시작...');

  const currentUrl = page.url();
  if (!currentUrl.includes('accounts.kakao.com')) {
    await page.goto('https://www.tistory.com/auth/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const kakaoBtn = page.locator('a.link_kakao_id, a.btn_login').first();
    if (await kakaoBtn.count()) {
      await kakaoBtn.click();
    } else {
      await page.goto(
        'https://accounts.kakao.com/login?continue=https%3A%2F%2Fwww.tistory.com',
        { waitUntil: 'domcontentloaded', timeout: 30000 }
      );
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  console.log('[auto-login] 카카오 로그인 페이지 도달. URL:', page.url());

  const loginIdSel = '#loginId--1, input[name="loginId"], input[placeholder*="이메일"], input[placeholder*="전화번호"]';
  await page.waitForSelector(loginIdSel, { timeout: 15000 });
  await page.fill(loginIdSel, kakaoEmail);

  const passwordSel = '#password--2, input[name="password"], input[type="password"]';
  await page.fill(passwordSel, kakaoPassword);

  const submitBtn = page.locator('button.btn_confirm[type="submit"], button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

  let retries = 3;
  while (retries-- > 0 && page.url().includes('kakao')) {
    const confirmBtn = page.locator('button.btn_confirm, button.btn_agree, button[type="submit"]').first();
    if (await confirmBtn.count()) {
      console.log('[auto-login] 추가 확인 화면 처리 중... URL:', page.url());
      await confirmBtn.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    } else {
      break;
    }
  }

  console.log('[auto-login] 로그인 완료. 최종 URL:', page.url());
}

async function launchContext() {
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const contextOptions = {};
  if (storageStateExists()) {
    contextOptions.storageState = config.storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);
  page.setDefaultNavigationTimeout(config.timeoutMs);
  return { browser, context, page };
}

async function cleanupBrowser(browser) {
  if (browser) await browser.close();
}

async function findPublishedPostUrl(context, blogUrl, title) {
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);
  page.setDefaultNavigationTimeout(config.timeoutMs);
  try {
    await page.goto(`${resolveManageUrl(blogUrl)}/posts/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const targetTitle = String(title || '').trim();
    if (!targetTitle) return null;
    const href = await page.evaluate((expectedTitle) => {
      const links = Array.from(document.querySelectorAll('a.link_cont'));
      const normalized = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const exact = links.find((link) => normalized(link.textContent) === normalized(expectedTitle));
      if (exact?.href) return exact.href;
      const partial = links.find((link) => normalized(link.textContent).includes(normalized(expectedTitle)));
      return partial?.href || null;
    }, targetTitle);
    return href || null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────
// 🔑 ensureLoggedIn: 세션 만료 시 자동 재로그인
// ─────────────────────────────────────────────
async function ensureLoggedIn(page, context, blogUrl) {
  await page.goto(resolveManageUrl(blogUrl), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const currentUrl = page.url();
  const loggedIn = currentUrl.includes('/manage') && !currentUrl.includes('accounts.kakao.com');

  if (!loggedIn) {
    console.log('[session] 세션 만료 감지 → 자동 재로그인 시작');

    if (storageStateExists()) {
      fs.unlinkSync(config.storageStatePath);
      console.log('[session] 만료된 storageState 삭제');
    }

    await performKakaoLogin(page);

    const newStorageState = await context.storageState();
    writeStorageState(newStorageState);
    console.log('[session] 새 storageState 저장 완료');

    await page.goto(resolveManageUrl(blogUrl), { waitUntil: 'domcontentloaded' });
    const afterUrl = page.url();
    if (!afterUrl.includes('/manage') || afterUrl.includes('accounts.kakao.com')) {
      throw new Error(`카카오 로그인 실패. URL: ${afterUrl}`);
    }
    return { loggedIn: true, currentUrl: afterUrl, autoLoginPerformed: true };
  }

  return { loggedIn: true, currentUrl, autoLoginPerformed: false };
}

async function setHtmlContent(page, html) {
  if (config.selectors.htmlModeButton) {
    await clickFirst(page, config.selectors.htmlModeButton);
  }

  const frameLocator = page.locator('#editor-tistory_ifr').first();
  if (await frameLocator.count().catch(() => 0)) {
    const frame = await frameLocator.elementHandle();
    const contentFrame = frame ? await frame.contentFrame() : null;
    if (contentFrame) {
      const body = contentFrame.locator('body').first();
      await body.click();
      await contentFrame.evaluate((value) => { document.body.innerHTML = value; }, html);
      return { mode: 'iframe-body' };
    }
  }

  if (config.selectors.htmlTextarea) {
    const selectors = splitSelectors(config.selectors.htmlTextarea);
    for (const selector of selectors) {
      const count = await page.locator(selector).count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const textarea = page.locator(selector).nth(index);
        const currentValue = await textarea.inputValue().catch(() => '');
        if (selector.includes('textarea') && currentValue.length > 2000) continue;
        await textarea.fill(html);
        return { mode: 'html-textarea', selector, index };
      }
    }
    const textarea = await firstLocator(page, config.selectors.htmlTextarea);
    if (textarea) {
      await textarea.fill(html);
      return { mode: 'html-textarea' };
    }
  }

  const editor = await firstLocator(page, config.selectors.editor);
  if (!editor) {
    throw new Error('에디터를 찾을 수 없습니다. TISTORY_EDITOR_SELECTOR를 확인해주세요.');
  }
  await editor.click();
  await page.evaluate(
    ({ selector, value }) => {
      const candidates = selector.split('||').map((item) => item.trim()).filter(Boolean);
      const target =
        candidates.map((candidate) => document.querySelector(candidate)).find(Boolean) ||
        document.querySelector('[contenteditable="true"]');
      if (!target) throw new Error('에디터 요소를 찾을 수 없습니다');
      target.innerHTML = value;
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '' }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector: config.selectors.editor, value: html }
  );
  return { mode: 'contenteditable' };
}

async function addTags(page, tagsCsv) {
  const tags = normalizeTags(tagsCsv);
  if (!tags.length) return { count: 0 };
  const input = await firstLocator(page, config.selectors.tagInput);
  if (!input) return { count: 0, skipped: true };
  for (const tag of tags) {
    await input.fill(tag);
    await input.press('Enter');
  }
  return { count: tags.length };
}

async function setCategory(page, categoryId) {
  if (!config.selectors.category || !categoryId) return { skipped: true };
  const locator = await firstLocator(page, config.selectors.category);
  if (!locator) return { skipped: true };
  await locator.selectOption(String(categoryId));
  return { skipped: false };
}

async function setVisibility(page, visibility) {
  if (!config.selectors.publicRadio) return { skipped: true };
  const radios = page.locator(config.selectors.publicRadio);
  const count = await radios.count().catch(() => 0);
  if (!count) return { skipped: true };
  if (visibility === 'public') {
    await radios.nth(0).check({ force: true });
    return { skipped: false, mode: 'public' };
  }
  await radios.nth(Math.max(0, count - 1)).check({ force: true });
  return { skipped: false, mode: 'private' };
}

async function publishPost(payload) {
  const blogUrl = resolveBlogUrl(payload.blogUrl);
  if (!blogUrl) throw new Error('blogUrl is required');
  if (!payload.title) throw new Error('title is required');
  if (!payload.html) throw new Error('html is required');

  const { browser, context, page } = await launchContext();
  try {
    const session = await ensureLoggedIn(page, context, blogUrl);
    console.log(`[publish] 세션 확인 완료. 자동로그인: ${session.autoLoginPerformed}`);

    await page.goto(resolveNewPostUrl(blogUrl), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    const titleFilled = await fillFirst(page, config.selectors.title, payload.title);
    if (!titleFilled) throw new Error('제목 필드를 찾을 수 없습니다.');

    const editorResult = await setHtmlContent(page, payload.html);
    await setCategory(page, payload.categoryId || config.defaultCategoryId);
    await setVisibility(page, payload.visibility || config.defaultVisibility);
    const tagResult = await addTags(page, payload.tagsCsv);

    const publishClicked = await clickFirst(page, config.selectors.publishButton);
    if (!publishClicked) throw new Error('발행 버튼을 찾을 수 없습니다.');

    await page.waitForTimeout(1000);
    await setVisibility(page, payload.visibility || config.defaultVisibility);
    await page.waitForTimeout(300);
    await clickFirst(page, config.selectors.confirmButton);
    await page.waitForLoadState('networkidle').catch(() => {});

    let finalUrl = page.url();
    if (finalUrl.includes('/manage/newpost') || finalUrl.includes('/manage/post')) {
      await page.waitForTimeout(2500);
      finalUrl = page.url();
    }
    if (finalUrl.includes('/manage/newpost') || finalUrl.includes('/manage/post')) {
      const recoveredUrl = await findPublishedPostUrl(context, blogUrl, payload.title);
      if (recoveredUrl) finalUrl = recoveredUrl;
    }

    return {
      ok: true,
      title: payload.title,
      url: finalUrl,
      postId: finalUrl.split('/').pop() || null,
      editorMode: editorResult.mode,
      tagsApplied: tagResult.count || 0,
      autoLoginPerformed: session.autoLoginPerformed,
    };
  } finally {
    await cleanupBrowser(browser);
  }
}

// ─── Routes ─────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'tistory-automation-server',
    time: new Date().toISOString(),
    storageStateExists: storageStateExists(),
    kakaoEmailConfigured: !!env('KAKAO_EMAIL'),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/session/check', async (req, res) => {
  const blogUrl = resolveBlogUrl(req.query.blogUrl);
  if (!blogUrl) return res.status(400).json({ ok: false, error: 'blogUrl is required' });
  let browser;
  try {
    const launched = await launchContext();
    browser = launched.browser;
    const session = await ensureLoggedIn(launched.page, launched.context, blogUrl);
    res.json({
      ok: true,
      storageStateExists: storageStateExists(),
      loggedIn: session.loggedIn,
      currentUrl: session.currentUrl,
      autoLoginPerformed: session.autoLoginPerformed,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    await cleanupBrowser(browser);
  }
});

app.post('/session/seed', (req, res) => {
  const storageState = req.body?.storageState;
  if (!storageState) return res.status(400).json({ ok: false, error: 'storageState is required' });
  try {
    const parsed = typeof storageState === 'string' ? JSON.parse(storageState) : storageState;
    if (!Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
      throw new Error('storageState must contain cookies and origins arrays');
    }
    writeStorageState(parsed);
    res.json({ ok: true, path: config.storageStatePath });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/publish', async (req, res) => {
  try {
    const result = await publishPost(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[publish] 오류:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const host = '0.0.0.0';
app.listen(config.port, host, () => {
  ensureDataDir();
  console.log(`tistory automation server listening on ${host}:${config.port}`);
  console.log(`카카오 자동 로그인: ${env('KAKAO_EMAIL') ? '✅ 설정됨' : '❌ KAKAO_EMAIL 미설정'}`);
});
