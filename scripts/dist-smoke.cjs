// dist 冒烟：React 壳加载 → 资金划转渲染 → 发起划转 → 2FA →
// 提交 → 断言商户划转订单生成、账务记录保留、订单详情收敛，
// 再验证租户钱包只展示三个钱包与多类型最近流水。
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

  // 切到资金划转
  await page.evaluate(() => {
    [...document.querySelectorAll('.arco-menu-item')].find(li => li.textContent.trim() === '商户资金划转')?.click();
  });
  await page.waitForFunction(() => {
    const crumbs = [...document.querySelectorAll('.arco-breadcrumb-item')].map(n => n.textContent.trim());
    return crumbs[crumbs.length - 1] === '资金划转';
  }, { timeout: 5000 });
  console.log('NAV_OK 面包屑切换到资金划转');

  // 内页在 iframe 内，等待划转订单表格
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe');
    try { return [...frame?.contentDocument?.querySelectorAll('h2') || []].some(node => node.textContent.trim() === '划转订单'); } catch { return false; }
  }, { timeout: 20000 });
  console.log('EMBED_OK 资金划转经 embed 管线加载');

  const doc = () => page.evaluateHandle(() => document.querySelector('iframe').contentDocument);
  const seededIdempotency = await page.evaluate(async (d) => {
    const proto = d.defaultView.__HSTenantPrototype;
    const snapshot = () => ({
      source: proto.getWalletState('CNY 代收钱包'),
      target: proto.getWalletState('CNY 代付钱包'),
      transfers: proto.getWalletTransfers().length,
      ledgers: proto.getWalletTransferLedgerRows().length
    });
    const before = snapshot();
    const input = {
      sourceMerchantId: 'MCH-2031',
      targetMerchantId: 'MCH-1188',
      sourceWallet: 'CNY 代收钱包',
      targetWallet: 'CNY 代付钱包',
      amount: 10000,
      purpose: '日常代付备付',
      idempotencyKey: 'WTR-IDEM-20260720-0001',
      expectedSourceVersion: 53,
      expectedTargetVersion: 32,
      authorized: true,
      twoFactorVerified: true
    };
    const duplicate = proto.executeWalletTransfer(input);
    const conflict = proto.executeWalletTransfer({ ...input, amount: 10000.01 });
    const after = snapshot();
    return { before, after, duplicate, conflict };
  }, await doc());
  if (!seededIdempotency.duplicate.ok
    || !seededIdempotency.duplicate.duplicate
    || seededIdempotency.duplicate.transferId !== 'WTR202607200001'
    || seededIdempotency.conflict.code !== 'IDEMPOTENCY_CONFLICT'
    || JSON.stringify(seededIdempotency.before) !== JSON.stringify(seededIdempotency.after)) {
    throw new Error(`SEEDED_IDEMPOTENCY_FAILED ${JSON.stringify(seededIdempotency)}`);
  }
  console.log('IDEMPOTENCY_OK 已有划转同键同参返回原结果、同键异参拒绝且资金不变');

  const before = await page.evaluate(async (d) => d.defaultView.__HSTenantPrototype.getAuditTrail().length, await doc());

  // 打开发起划转弹窗
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    inner.querySelector('[data-action="internal-transfer"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.getElementById('modalMask')?.classList.contains('show'), { timeout: 5000 }, await doc());
  console.log('MODAL_OPEN 发起钱包划转弹窗');

  const transferModal = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const key = inner.getElementById('transferIdempotencyKey');
    return {
      keyType: key?.type || '',
      noteCount: inner.querySelectorAll('#modalBody .modal-note').length,
      hasVersionSummary: Boolean(inner.getElementById('transferVersionSummary')),
      hasBalancePreview: Boolean(inner.getElementById('transferPreview')),
      hasSecondConfirm: Boolean(inner.getElementById('confirmBusinessAction'))
    };
  }, await doc());
  if (transferModal.keyType !== 'hidden' || transferModal.noteCount || transferModal.hasVersionSummary || transferModal.hasBalancePreview || transferModal.hasSecondConfirm) {
    throw new Error(`TRANSFER_MODAL_NOT_COMPACT ${JSON.stringify(transferModal)}`);
  }
  console.log('MODAL_COMPACT 仅展示来源、目标、金额、用途与 2FA');

  // 分别选择来源、目标商户钱包，填写金额、用途与 2FA 后提交
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    inner.getElementById('transferSource').value = 'MCH-2031::CNY 代收钱包';
    inner.getElementById('transferSource').dispatchEvent(new Event('change', { bubbles: true }));
    inner.getElementById('transferTarget').value = 'MCH-1188::CNY 代付钱包';
    inner.getElementById('transferTarget').dispatchEvent(new Event('change', { bubbles: true }));
    inner.getElementById('transferAmount').value = '1234.56';
    inner.getElementById('transferReason').value = '冒烟测试资金调拨';
    inner.getElementById('twoFactorCode').value = '123456';
    inner.getElementById('modalConfirm').click();
  }, await doc());

  await page.waitForFunction(async (d) => {
    const inner = d.defaultView.document;
    return !inner.getElementById('modalMask')?.classList.contains('show')
      && [...inner.querySelectorAll('tbody tr')].some(row => row.textContent.includes('WTR202607200002'));
  }, { timeout: 5000 }, await doc());

  const after = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const proto = d.defaultView.__HSTenantPrototype;
    const row = [...inner.querySelectorAll('tbody tr')].find(item => item.textContent.includes('WTR202607200002'));
    const text = row?.textContent.replace(/\s+/g, ' ').trim() || '';
    const transfer = proto.getWalletTransfers().find(item => item.transferId === 'WTR202607200002');
    const audits = proto.getAuditTrail();
    return { text, ledgerIds: transfer?.ledgerIds || [], audits: audits.length, last: audits[0] ? [audits[0].auditId, audits[0].action, audits[0].object] : null };
  }, await doc());

  // 详情只保留订单必要信息，不重复展示账务分录、误划流程或下钻按钮
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    [...inner.querySelectorAll('tbody tr')].find(row => row.textContent.includes('WTR202607200002'))?.querySelector('[data-action="transfer-detail"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.getElementById('drawer')?.classList.contains('show'), { timeout: 5000 }, await doc());
  const detail = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    return {
      text: inner.getElementById('drawerBody')?.textContent.replace(/\s+/g, ' ').trim() || '',
      actions: [...inner.querySelectorAll('#drawerBody button')].map(button => button.textContent.trim())
    };
  }, await doc());

  // 租户钱包只展示三个钱包，下方展示多类型最近流水。
  await page.evaluate(async (d) => d.defaultView.document.getElementById('drawerClose')?.click(), await doc());
  await page.evaluate(() => {
    [...document.querySelectorAll('.arco-menu-item')].find(li => li.textContent.trim() === '租户钱包')?.click();
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe');
    try {
      const inner = frame?.contentDocument;
      return [...inner?.querySelectorAll('h1') || []].some(node => node.textContent.trim() === '租户钱包')
        && [...inner?.querySelectorAll('h2') || []].some(node => node.textContent.trim() === '最近流水');
    } catch { return false; }
  }, { timeout: 10000 });
  const walletPage = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const ledgerRows = [...inner.querySelectorAll('.wallet-recent-ledger tbody tr')];
    return {
      cards: inner.querySelectorAll('.wallet-card-grid .wallet-pipe-node').length,
      hero: inner.querySelectorAll('.wallet-hero').length,
      risk: inner.querySelectorAll('.wallet-risk-banner').length,
      versionBadges: inner.querySelectorAll('.wallet-pipe-ver').length,
      walletDetails: inner.querySelectorAll('[data-action="wallet-showcase-detail"]').length,
      walletLedgerButtons: inner.querySelectorAll('.wallet-card-grid [data-action="wallet-ledger"][data-wallet]').length,
      globalLedgerButtons: inner.querySelectorAll('[data-action="wallet-ledger"][data-wallet=""]').length,
      rows: ledgerRows.length,
      types: ledgerRows.map(row => row.cells[2]?.textContent.replace(/\s+/g, ' ').trim() || ''),
      text: inner.querySelector('main')?.textContent.replace(/\s+/g, ' ').trim() || ''
    };
  }, await doc());

  // 每张钱包卡只进入该钱包的流水，不提供跨钱包“全部流水”入口。
  await page.evaluate(async (d) => {
    d.defaultView.document.querySelector('.wallet-card-grid [data-action="wallet-ledger"][data-wallet="CNY 代收钱包"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.querySelector('.page-title')?.textContent.trim() === '账户流水', { timeout: 5000 }, await doc());
  const walletLedgerView = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const rows = [...inner.querySelectorAll('.rich-table tbody tr')].filter(row => !row.hidden);
    return {
      filter: inner.getElementById('moduleFilter1')?.value || '',
      wallets: rows.map(row => row.cells[1]?.textContent.trim() || '').filter(Boolean)
    };
  }, await doc());

  console.log('AFTER WTR-0002:', after.text, '| ledger facts:', JSON.stringify(after.ledgerIds), '| audits', before, '->', after.audits, '| last:', JSON.stringify(after.last));
  const pass = after.text.includes('CNY 1,234.56')
    && after.text.includes('星河游戏')
    && after.text.includes('MCH-2031')
    && after.text.includes('东盛电商')
    && after.text.includes('MCH-1188')
    && after.text.includes('成功')
    && !after.text.includes('LG-20260720-0002-OUT')
    && after.ledgerIds.includes('LG-20260720-0002-OUT')
    && after.ledgerIds.includes('LG-20260720-0002-IN')
    && detail.text.includes('划转信息')
    && detail.text.includes('星河游戏 · MCH-2031 / CNY 代收钱包')
    && detail.text.includes('东盛电商 · MCH-1188 / CNY 代付钱包')
    && !detail.text.includes('双边记账')
    && !detail.text.includes('误划')
    && detail.actions.length === 0
    && after.audits > before
    && walletPage.cards === 3
    && walletPage.hero === 0
    && walletPage.risk === 0
    && walletPage.versionBadges === 0
    && walletPage.walletDetails === 0
    && walletPage.walletLedgerButtons === 3
    && walletPage.globalLedgerButtons === 0
    && walletPage.rows > 0
    && walletPage.rows <= 8
    && new Set(walletPage.types).size > 1
    && !walletPage.text.includes('划转记录')
    && !walletPage.text.includes('风险冻结')
    && walletLedgerView.filter === 'CNY 代收钱包'
    && walletLedgerView.wallets.length > 0
    && walletLedgerView.wallets.every(wallet => wallet === 'CNY 代收钱包');
  console.log('WALLETS:', JSON.stringify(walletPage), '| FILTERED_LEDGER:', JSON.stringify(walletLedgerView));
  console.log(pass ? 'DIST_SMOKE_PASS 资金划转与租户钱包链路完好' : 'DIST_SMOKE_FAIL');
  await page.screenshot({ path: 'smoke-dist.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
