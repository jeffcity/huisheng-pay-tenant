import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout, Menu, Breadcrumb, Spin, Result, Tag, Button } from '@arco-design/web-react';
import { MODULES, NAV_GROUPS, UTILITY_ITEMS } from './modules.js';
import { prepareEmbeddedDocument } from './embed.js';

const Sider = Layout.Sider;
const Header = Layout.Header;
const Content = Layout.Content;
const MenuItem = Menu.Item;
const ItemGroup = Menu.ItemGroup;

export default function App() {
  const [activePage, setActivePage] = useState(() => {
    const fromHash = window.location.hash.slice(1);
    return MODULES[fromHash] ? fromHash : 'home';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const loadingRef = useRef(true);

  const openPage = useCallback(async (pageId, { updateHash = true } = {}) => {
    const config = MODULES[pageId] || MODULES.home;
    const resolved = MODULES[pageId] ? pageId : 'home';
    setActivePage(resolved);
    setLoading(true);
    loadingRef.current = true;
    setError('');
    try {
      const doc = await prepareEmbeddedDocument(config.sourceKey, config.module);
      const frame = frameRef.current;
      if (!frame) return;
      frame.dataset.initialHash = config.initialHash || '';
      frame.title = '汇盛支付租户端 · ' + config.label;
      frame.srcdoc = doc;
      if (updateHash) window.history.replaceState(null, '', '#' + resolved);
    } catch (err) {
      setError(String(err?.message || err));
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { openPage(activePage, { updateHash: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 旧壳对外的 postMessage API：内页跨页导航用 hs-unified-open-page（口径不变）
  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data;
      if (data?.type === 'hs-unified-open-page' && MODULES[data.pageId]) openPage(data.pageId);
    };
    const onHashChange = () => openPage(window.location.hash.slice(1), { updateHash: false });
    window.addEventListener('message', onMessage);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [openPage]);

  const config = MODULES[activePage] || MODULES.home;
  const sourceName = config.sourceName;

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={220} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="tenant-brand">
          <Tag color="arcoblue" style={{ fontWeight: 600 }}>HS</Tag>
          <span><strong>汇盛支付</strong><br /><small style={{ color: 'var(--color-text-3)' }}>租户端控制台</small></span>
        </div>
        <Menu
          style={{ flex: 1, overflowY: 'auto' }}
          selectedKeys={[activePage]}
          onClickMenuItem={(key) => openPage(key)}
        >
          {NAV_GROUPS.map(group => (
            <ItemGroup key={group.title} title={group.title}>
              {group.items.map(item => (
                <MenuItem key={item.id}>{item.label}</MenuItem>
              ))}
            </ItemGroup>
          ))}
        </Menu>
        <div style={{ borderTop: '1px solid var(--color-border-2)', padding: 8 }}>
          {UTILITY_ITEMS.map(item => (
            <Button
              key={item.id}
              type={activePage === item.id ? 'primary' : 'text'}
              size="small"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => openPage(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Sider>
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <Breadcrumb>
            <Breadcrumb.Item>租户端</Breadcrumb.Item>
            <Breadcrumb.Item>{config.group}</Breadcrumb.Item>
            <Breadcrumb.Item>{config.label}</Breadcrumb.Item>
          </Breadcrumb>
          <span
            style={{ marginLeft: 'auto', color: 'var(--color-text-3)', fontSize: 11, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={sourceName}
          >
            内容来源：{sourceName}
          </span>
        </Header>
        <Content style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {loading && !error && (
            <div className="frame-overlay"><Spin tip="正在加载专项页面" /></div>
          )}
          {error && (
            <div className="frame-overlay">
              <Result status="error" title="页面来源缺失" subTitle={error} />
            </div>
          )}
          <iframe
            ref={frameRef}
            title="汇盛支付租户端页面"
            referrerPolicy="no-referrer"
            onLoad={() => { if (loadingRef.current) { loadingRef.current = false; setLoading(false); } }}
          />
        </Content>
      </Layout>
    </Layout>
  );
}
