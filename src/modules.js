// 页面注册表：23 个页面 → 4 个源文件 + hash 路由（从旧单体 const pages 原样迁出）。
import modules from './legacy/modules.json' with { type: 'json' };

export const MODULES = modules;

// 统一壳侧边导航（与旧壳分组一致；公共入口/独立入口挂在侧栏底部工具区）
const GROUP_ORDER = ['总览', '商户运营', '业务运营', '资金中心', '运营中心', '系统管理'];

export const NAV_GROUPS = GROUP_ORDER.map(title => ({
  title,
  items: Object.entries(modules)
    .filter(([, m]) => m.group === title && !m.utility)
    .map(([id, m]) => ({ id, label: m.label })),
}));

export const UTILITY_ITEMS = Object.entries(modules)
  .filter(([, m]) => m.utility)
  .map(([id, m]) => ({ id, label: m.label, group: m.group }));
