// dist 冒烟：React 壳加载 → 资金申请渲染 → 详情行「确认已付款」→ 2FA+二次确认 →
// 提交 → 断言状态流转「待付款→待平台确认」+ 平台单号生成 + 审计写回。
// 与旧单体引擎挂载测试同等口径，但目标是重构后的构建产物。
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = 'file://' + process.argv[2];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(DIST, { waitUntil: 'networkidle0', timeout: 30000 });

  // React 壳就绪：侧边导航 + iframe 出现
  await page.waitForSelector('.arco-menu-item', { timeout: 10000 });
  console.log('SHELL_OK React+Arco 壳渲染');

  // 切到资金申请（默认 home，点「资金申请」；注意与「商户资金申请」精确区分）
  await page.evaluate(() => {
    [...document.querySelectorAll('.arco-menu-item')].find(li => li.textContent.trim() === '资金申请')?.click();
  });
  await page.waitForFunction(() => {
    const crumbs = [...document.querySelectorAll('.arco-breadcrumb-item')].map(n => n.textContent.trim());
    return crumbs[crumbs.length - 1] === '资金申请';
  }, { timeout: 5000 });
  console.log('NAV_OK 面包屑切换到资金申请');

  // 内页在 iframe 内，等引擎资金申请表格（待付款行 TF202607170021）
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe');
    try { return f?.contentDocument?.querySelector('[data-tenant-request-no="TF202607170021"]'); } catch { return false; }
  }, { timeout: 20000 });
  console.log('EMBED_OK 资金申请经 embed 管线加载');

  const doc = () => page.evaluateHandle(() => document.querySelector('iframe').contentDocument);
  const before = await page.evaluate(async (d) => d.defaultView.__HSTenantPrototype.getAuditTrail().length, await doc());

  // 点该行「确认已付款」→ 弹窗
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const row = inner.querySelector('[data-tenant-request-no="TF202607170021"]').closest('tr');
    [...row.querySelectorAll('button')].find(b => b.textContent.includes('确认已付款'))?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.getElementById('modalMask')?.classList.contains('show'), { timeout: 5000 }, await doc());
  console.log('MODAL_OPEN 确认外部存款已付款弹窗');

  // 填付款流水号 + 上传凭证 + 2FA + 二次确认
  const proofHandle = await page.evaluateHandle(async (d) => d.defaultView.document.getElementById('paymentProof'), await doc());
  await proofHandle.asElement().uploadFile('/tmp/tenant-smoke-proof.png');
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    inner.getElementById('paymentReference').value = 'SMOKE-PAY-REF-001';
    inner.getElementById('twoFactorCode').value = '123456';
    const cb = inner.getElementById('confirmBusinessAction');
    if (cb && !cb.checked) cb.click();
    inner.getElementById('modalConfirm').click();
  }, await doc());
  await new Promise(r => setTimeout(r, 800));

  const after = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const proto = d.defaultView.__HSTenantPrototype;
    const row = inner.querySelector('[data-tenant-request-no="TF202607170021"]')?.closest('tr');
    const status = row?.cells[7]?.textContent.replace(/\s+/g, ' ').trim();
    const platformNo = row?.querySelector('[data-fund-application-id]')?.dataset.fundApplicationId || '';
    const audits = proto.getAuditTrail();
    return { status, platformNo, audits: audits.length, last: audits[0] ? [audits[0].auditId, audits[0].action, audits[0].object] : null };
  }, await doc());

  console.log('AFTER TF-0021:', after.status, '| platformNo', after.platformNo, '| audits', before, '->', after.audits, '| last:', JSON.stringify(after.last));
  const pass = after.status === '待平台确认' && /^PF\d+$/.test(after.platformNo) && after.audits > before;
  console.log(pass ? 'DIST_SMOKE_PASS 重构产物端到端业务链路完好' : 'DIST_SMOKE_FAIL');
  await page.screenshot({ path: 'smoke-dist.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
