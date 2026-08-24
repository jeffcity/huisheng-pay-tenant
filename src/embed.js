// 旧壳 prepareEmbeddedModule 的忠实移植：fetch 真实源文件 → 注入统一壳补丁
// （隐藏内页自带 sidebar/topbar + __UNIFIED_DEMO_HASH 引导）→ 注入路由应用脚本 → 交给 iframe.srcdoc。
// 与旧实现逐条对应，行为口径不变。
const sourceCache = new Map();

async function fetchSource(key) {
  if (sourceCache.has(key)) return sourceCache.get(key);
  const res = await fetch(`./legacy/sources/${key}.html`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`页面来源缺失：${key}`);
  const text = await res.text();
  sourceCache.set(key, text);
  return text;
}

const headBridge = `
        <style id="hs-unified-content-bridge">
          html, body { min-width: 0 !important; }
          body { overflow: auto !important; }
          .sidebar, [data-astryx="SidebarNav"] { display: none !important; }
          header.topbar, [data-astryx="TopBar"] { display: none !important; }
          .app, .app-shell { grid-template-columns: minmax(0, 1fr) !important; }
          main, .main, .workspace { min-width: 0 !important; }
          @media (max-width: 900px) {
            .app, .app-shell { grid-template-columns: minmax(0, 1fr) !important; }
          }
        </style>
        <script id="hs-unified-route-bridge">
          (() => {
            const requestedHash = window.frameElement?.dataset.initialHash || "";
            window.__UNIFIED_DEMO_HASH = requestedHash;
            document.documentElement.dataset.unifiedTenantContent = "true";
          })();
        </script>
      `;

function routeBridge(moduleName) {
  return `
        <script id="hs-unified-route-apply">
          (() => {
            const requestedHash = window.frameElement?.dataset.initialHash || "";
            const moduleName = ${JSON.stringify(moduleName)};
            if (!requestedHash) return;
            if (moduleName === "system") {
              document.querySelector('[data-view="' + requestedHash + '"]')?.click();
            } else if (moduleName === "merchants") {
              document.querySelector('.nav-button[data-page="' + requestedHash + '"]')?.click();
            }
          })();
        </script>
      `;
}

function prepareEmbeddedModule(html, moduleName) {
  if (moduleName === 'login') return html;
  const withHead = html.includes('</head>') ? html.replace('</head>', headBridge + '</head>') : headBridge + html;
  return withHead.includes('</body>') ? withHead.replace('</body>', routeBridge(moduleName) + '</body>') : withHead + routeBridge(moduleName);
}

export async function prepareEmbeddedDocument(sourceKey, moduleName) {
  const html = await fetchSource(sourceKey);
  return prepareEmbeddedModule(html, moduleName);
}
