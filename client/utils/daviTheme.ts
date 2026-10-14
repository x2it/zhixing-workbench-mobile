/**
 * 知行工作台 Design System
 * 理念：知行合一 — 知是行之始，行是知之成
 * 风格：深邃、沉静、内容的纯粹容器
 */

export const DaviTheme = {
  colors: {
    // 深色主题 - 沉浸式科学感
    primary: '#3B82F6',        // 科技蓝
    primaryDark: '#2563EB',     // 深蓝
    primaryLight: '#60A5FA',    // 亮蓝
    
    background: '#020617',     // 极深蓝黑 - 主背景
    surface: '#0F172A',         // 深蓝灰 - 卡片/容器
    surfaceElevated: '#1E293B', // 稍亮的面板
    
    text: '#F8FAFC',            // 亮白 - 主文字
    textSecondary: '#94A3B8',   // 蓝灰 - 次要文字
    textMuted: '#64748B',      // 深灰 - 弱化文字
    
    accent: '#06B6D4',          // 青色 - 强调
    success: '#10B981',        // 绿色 - 成功
    warning: '#F59E0B',        // 琥珀 - 警告
    error: '#EF4444',           // 红色 - 错误
    
    border: 'rgba(148, 163, 184, 0.1)', // 微弱边框
    overlay: 'rgba(2, 6, 23, 0.8)',     // 遮罩层
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  
  typography: {
    title: {
      fontSize: 24,
      fontWeight: '700' as const,
      lineHeight: 32,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
    },
  },
  
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
  },
  
  // WebView 配置
  webview: {
    url: 'https://w3b.pub/',
    appName: '知行工作台',
  },
};
