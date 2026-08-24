// dist 冒烟：React 壳加载 → 资金划转渲染 → 发起划转 → 2FA →
// 提交 → 断言租户钱包划转订单生成、账务记录保留、订单详情收敛，
// 再验证租户钱包只展示三个钱包与平台端统一的最近钱包流水。
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
    [...document.querySelectorAll('.arco-menu-item')].find(li => li.textContent.trim() === '资金划转')?.click();
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
    || Object.hasOwn(seededIdempotency.duplicate, 'correlationId')
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
      text: inner.getElementById('modalBody')?.textContent.replace(/\s+/g, ' ').trim() || '',
      noteCount: inner.querySelectorAll('#modalBody .modal-note').length,
      hasVersionSummary: Boolean(inner.getElementById('transferVersionSummary')),
      hasBalancePreview: Boolean(inner.getElementById('transferPreview')),
      hasSecondConfirm: Boolean(inner.getElementById('confirmBusinessAction'))
    };
  }, await doc());
  if (transferModal.keyType !== 'hidden' || transferModal.noteCount || transferModal.hasVersionSummary || transferModal.hasBalancePreview || transferModal.hasSecondConfirm || transferModal.text.includes('商户')) {
    throw new Error(`TRANSFER_MODAL_NOT_COMPACT ${JSON.stringify(transferModal)}`);
  }
  console.log('MODAL_COMPACT 仅展示来源、目标、金额、用途与 2FA');

  // 分别选择来源、目标租户钱包，填写金额、用途与 2FA 后提交
  await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    inner.getElementById('transferSource').value = 'CNY 代收钱包';
    inner.getElementById('transferSource').dispatchEvent(new Event('change', { bubbles: true }));
    inner.getElementById('transferTarget').value = 'CNY 代付钱包';
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
    return {
      text,
      headers: [...inner.querySelectorAll('.rich-table thead th')].map(th => th.textContent.trim()),
      statusText: row?.cells[4]?.textContent.replace(/\s+/g, ' ').trim() || '',
      ledgerIds: transfer?.ledgerIds || [],
      hasCorrelationId: Boolean(transfer && Object.hasOwn(transfer, 'correlationId')),
      audits: audits.length,
      last: audits[0] ? [audits[0].auditId, audits[0].action, audits[0].object] : null
    };
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
      fields: [...inner.querySelectorAll('#drawerBody .kv-grid > div')].map(node => node.textContent.trim()),
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
        && [...inner?.querySelectorAll('h2') || []].some(node => node.textContent.trim() === '最近钱包流水');
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
      roleSelectors: inner.querySelectorAll('select[data-wallet-role]').length,
      walletDetails: inner.querySelectorAll('[data-action="wallet-showcase-detail"]').length,
      walletLedgerButtons: inner.querySelectorAll('.wallet-card-grid [data-action="wallet-ledger"][data-wallet]').length,
      walletTransferButtons: inner.querySelectorAll('.wallet-card-grid [data-action="internal-transfer"][data-source]').length,
      withdrawalButtons: inner.querySelectorAll('.wallet-card-grid [data-action="create-withdrawal"]').length,
      globalLedgerButtons: inner.querySelectorAll('[data-action="wallet-ledger"][data-wallet=""]').length,
      rows: ledgerRows.length,
      types: ledgerRows.map(row => row.cells[3]?.textContent.replace(/\s+/g, ' ').trim() || ''),
      tabs: [...inner.querySelectorAll('.wallet-ledger-tab')].map(button => button.textContent.trim()),
      columns: [...inner.querySelectorAll('.wallet-recent-ledger thead th')].map(th => th.textContent.trim()),
      text: inner.querySelector('main')?.textContent.replace(/\s+/g, ' ').trim() || ''
    };
  }, await doc());

  // 从钱包卡片发起时来源由卡片固定，弹窗只选择目标钱包。
  const inspectCardTransfer = async (sourceWallet) => {
    await page.evaluate(async (d, source) => {
      d.defaultView.document.querySelector(`[data-action="internal-transfer"][data-source="${source}"]`)?.click();
    }, await doc(), sourceWallet);
    await page.waitForFunction(async (d) => d.defaultView.document.getElementById('modalMask')?.classList.contains('show'), { timeout: 5000 }, await doc());
    const result = await page.evaluate(async (d) => {
      const inner = d.defaultView.document;
      return {
        title: inner.getElementById('modalTitle')?.textContent.trim() || '',
        source: inner.getElementById('transferSource')?.value || '',
        sourceType: inner.getElementById('transferSource')?.type || '',
        sourceLabelCount: inner.querySelectorAll('label[for="transferSource"]').length,
        targetOptions: [...inner.querySelectorAll('#transferTarget option')].map(option => option.value).filter(Boolean),
        labels: [...inner.querySelectorAll('#modalBody label')].map(label => label.textContent.trim())
      };
    }, await doc());
    await page.evaluate(async (d) => d.defaultView.document.getElementById('modalClose')?.click(), await doc());
    return result;
  };
  const collectCardTransfer = await inspectCardTransfer('CNY 代收钱包');
  const withdrawCardTransfer = await inspectCardTransfer('CNY 提款钱包');

  // 每张钱包卡只进入该钱包的流水，不提供跨钱包“全部流水”入口。
  await page.evaluate(async (d) => {
    d.defaultView.document.querySelector('.wallet-card-grid [data-action="wallet-ledger"][data-wallet="CNY 代收钱包"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.querySelector('.page-title')?.textContent.trim() === '账户流水', { timeout: 5000 }, await doc());
  const walletLedgerView = await page.evaluate(async (d) => {
    const inner = d.defaultView.document;
    const rows = [...inner.querySelectorAll('.wallet-recent-ledger tbody tr')];
    return {
      wallet: inner.querySelector('.wallet-recent-ledger')?.dataset.walletLedgerWallet || '',
      filters: inner.querySelectorAll('[data-astryx="FilterForm"]').length,
      pagination: inner.querySelectorAll('[data-module-pagination]').length,
      details: inner.querySelectorAll('[data-action="ledger-detail"]').length,
      backButtons: [...inner.querySelectorAll('[data-action="back-to-wallets"]')].map(button => button.textContent.trim()),
      tabs: [...inner.querySelectorAll('.wallet-ledger-tab')].map(button => button.textContent.trim()),
      columns: [...inner.querySelectorAll('.wallet-recent-ledger thead th')].map(th => th.textContent.trim()),
      wallets: rows.map(row => row.cells[2]?.textContent.trim() || '').filter(Boolean),
      types: rows.map(row => row.cells[3]?.textContent.trim() || '').filter(Boolean)
    };
  }, await doc());

  // 从钱包卡片进入分钱包流水后，可明确返回租户钱包总览。
  await page.evaluate(async (d) => {
    d.defaultView.document.querySelector('[data-action="back-to-wallets"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.querySelector('.page-title')?.textContent.trim() === '租户钱包', { timeout: 5000 }, await doc());
  const returnedWalletPage = await page.evaluate(async (d) => d.defaultView.document.querySelector('.page-title')?.textContent.trim() || '', await doc());

  // 从侧栏直接进入账户流水时不展示返回按钮。
  await page.evaluate(async (d) => {
    d.defaultView.document.querySelector('[data-nav="账户流水"]')?.click();
  }, await doc());
  await page.waitForFunction(async (d) => d.defaultView.document.querySelector('.page-title')?.textContent.trim() === '账户流水', { timeout: 5000 }, await doc());
  const directLedgerBackButtons = await page.evaluate(async (d) => d.defaultView.document.querySelectorAll('[data-action="back-to-wallets"]').length, await doc());

  // 覆盖三个钱包之间六个不同方向，并验证同钱包划转被拒绝。
  const pathCoverage = await page.evaluate(async (d) => {
    const proto = d.defaultView.__HSTenantPrototype;
    const wallets = ['CNY 代收钱包', 'CNY 代付钱包', 'CNY 提款钱包'];
    const snapshot = () => {
      const states = wallets.map(name => proto.getWalletState(name));
      return {
        totalMinor: Math.round(states.reduce((sum, wallet) => sum + wallet.total, 0) * 100),
        frozenMinor: Math.round(states.reduce((sum, wallet) => sum + wallet.frozen, 0) * 100),
        transfers: proto.getWalletTransfers().length,
        ledgers: proto.getWalletTransferLedgerRows().length
      };
    };
    const execute = (sourceWallet, targetWallet, idempotencyKey, purpose) => {
      const source = proto.getWalletState(sourceWallet);
      const target = proto.getWalletState(targetWallet);
      return proto.executeWalletTransfer({
        sourceWallet, targetWallet, amount: 1.25, purpose, idempotencyKey,
        expectedSourceVersion: source.version,
        expectedTargetVersion: target.version,
        authorized: true,
        twoFactorVerified: true
      });
    };
    const before = snapshot();
    const routes = [
      ['CNY 代收钱包', 'CNY 代付钱包'], ['CNY 代收钱包', 'CNY 提款钱包'],
      ['CNY 代付钱包', 'CNY 代收钱包'], ['CNY 代付钱包', 'CNY 提款钱包'],
      ['CNY 提款钱包', 'CNY 代收钱包'], ['CNY 提款钱包', 'CNY 代付钱包']
    ];
    const results = routes.map(([source, target], index) => execute(source, target, `SMOKE-PATH-${index + 1}`, `钱包划转路径${index + 1}`));
    const sameWallet = execute('CNY 提款钱包', 'CNY 提款钱包', 'SMOKE-PATH-SAME', '同钱包路径');
    const after = snapshot();
    return { before, after, results, sameWallet };
  }, await doc());

  console.log('AFTER WTR-0002:', after.text, '| ledger facts:', JSON.stringify(after.ledgerIds), '| audits', before, '->', after.audits, '| last:', JSON.stringify(after.last));
  const pass = after.text.includes('CNY 1,234.56')
    && after.headers[0] === '划转单号'
    && after.headers[4] === '订单状态'
    && after.statusText === '成功'
    && !after.text.includes('实时执行，无平台审核')
    && !after.text.includes('WCOR')
    && !after.hasCorrelationId
    && after.text.includes('CNY 代收钱包')
    && after.text.includes('CNY 代付钱包')
    && !after.text.includes('MCH-')
    && after.text.includes('成功')
    && !after.text.includes('LG-20260720-0002-OUT')
    && after.ledgerIds.includes('LG-20260720-0002-OUT')
    && after.ledgerIds.includes('LG-20260720-0002-IN')
    && detail.text.includes('划转信息')
    && detail.fields.includes('划转单号')
    && !detail.text.includes('关联号')
    && detail.fields.includes('来源钱包')
    && detail.fields.includes('CNY 代收钱包')
    && detail.fields.includes('目标钱包')
    && detail.fields.includes('CNY 代付钱包')
    && !detail.text.includes('商户')
    && !detail.text.includes('双边记账')
    && !detail.text.includes('误划')
    && detail.actions.length === 0
    && after.audits > before
    && walletPage.cards === 3
    && walletPage.hero === 0
    && walletPage.risk === 0
    && walletPage.versionBadges === 0
    && walletPage.roleSelectors === 0
    && walletPage.walletDetails === 0
    && walletPage.walletLedgerButtons === 3
    && walletPage.walletTransferButtons === 3
    && walletPage.withdrawalButtons === 0
    && walletPage.globalLedgerButtons === 0
    && walletPage.rows === 3
    && new Set(walletPage.types).size > 1
    && walletPage.types.every(type => ['增加', '减少', '冻结', '解冻'].includes(type))
    && JSON.stringify(walletPage.tabs) === JSON.stringify(['近一小时', '今日', '昨日'])
    && JSON.stringify(walletPage.columns) === JSON.stringify(['流水单号', '时间', '钱包', '类型', '金额', '变动后余额', '关联单号'])
    && !walletPage.text.includes('划转记录')
    && !walletPage.text.includes('风险冻结')
    && !walletPage.text.includes('演示角色：')
    && collectCardTransfer.source === 'CNY 代收钱包'
    && collectCardTransfer.sourceType === 'hidden'
    && collectCardTransfer.sourceLabelCount === 0
    && JSON.stringify(collectCardTransfer.targetOptions) === JSON.stringify(['CNY 代付钱包', 'CNY 提款钱包'])
    && withdrawCardTransfer.source === 'CNY 提款钱包'
    && withdrawCardTransfer.sourceType === 'hidden'
    && withdrawCardTransfer.sourceLabelCount === 0
    && JSON.stringify(withdrawCardTransfer.targetOptions) === JSON.stringify(['CNY 代收钱包', 'CNY 代付钱包'])
    && walletLedgerView.wallet === 'CNY 代收钱包'
    && walletLedgerView.filters === 0
    && walletLedgerView.pagination === 0
    && walletLedgerView.details === 0
    && JSON.stringify(walletLedgerView.backButtons) === JSON.stringify(['返回租户钱包'])
    && JSON.stringify(walletLedgerView.tabs) === JSON.stringify(['近一小时', '今日', '昨日'])
    && JSON.stringify(walletLedgerView.columns) === JSON.stringify(['流水单号', '时间', '钱包', '类型', '金额', '变动后余额', '关联单号'])
    && walletLedgerView.wallets.length > 0
    && walletLedgerView.wallets.every(wallet => wallet === '代收钱包')
    && walletLedgerView.types.every(type => ['增加', '减少', '冻结', '解冻'].includes(type))
    && returnedWalletPage === '租户钱包'
    && directLedgerBackButtons === 0
    && pathCoverage.results.length === 6
    && pathCoverage.results.every(result => result.ok)
    && pathCoverage.results.every(result => !Object.hasOwn(result, 'correlationId'))
    && pathCoverage.sameWallet.code === 'WALLET_TRANSFER_PATH_INVALID'
    && pathCoverage.after.totalMinor === pathCoverage.before.totalMinor
    && pathCoverage.after.frozenMinor === pathCoverage.before.frozenMinor
    && pathCoverage.after.transfers === pathCoverage.before.transfers + 6
    && pathCoverage.after.ledgers === pathCoverage.before.ledgers + 12;
  console.log('WALLETS:', JSON.stringify(walletPage), '| FILTERED_LEDGER:', JSON.stringify(walletLedgerView), '| RETURNED:', returnedWalletPage, '| DIRECT_BACK_BUTTONS:', directLedgerBackButtons);
  console.log('CARD_TRANSFERS:', JSON.stringify({ collectCardTransfer, withdrawCardTransfer }));
  console.log('PATHS:', JSON.stringify(pathCoverage));
  console.log(pass ? 'DIST_SMOKE_PASS 资金划转与租户钱包链路完好' : 'DIST_SMOKE_FAIL');
  await page.screenshot({ path: 'smoke-dist.png' });
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
