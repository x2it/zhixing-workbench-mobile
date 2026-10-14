/**
 * 知行工作台 - 全屏 WebView
 * 理念：知行合一 — 内容与工具的纯粹容器
 * 手势支持：边缘右滑返回网页历史
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  BackHandler,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  ScrollView,
  Linking,
  Switch,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DaviTheme } from '@/utils/daviTheme';
import LoadingScreen from '@/components/LoadingScreen';
import {
  isDownloadableUrl,
  handleDownload,
  handleDownloadMessage,
} from '@/utils/fileDownload';
import { daviGetItem, daviSetItem } from '@/utils/daviStorage';

const STORAGE_URL_KEY = '@zhixing:custom_url';
const STORAGE_URL_LIST_KEY = '@zhixing:url_list';
const STORAGE_DESKTOP_KEY = '@zhixing:desktop_mode';

// 桌面版 User-Agent
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const DEFAULT_SITES: string[] = [
  'https://w3b.pub/',
];

// Web 平台使用 iframe
const WebView_Web: React.FC<{ url: string; onOpenSettings: () => void }> = ({ url, onOpenSettings }) => {
  const insets = useSafeAreaInsets();
  // 重试计数（改变 iframe key 强制重新加载）
  const [reloadKey, setReloadKey] = useState(0);

  if (Platform.OS !== 'web') return null;

  const handleRetry = () => {
    setReloadKey((k) => k + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* key=url+reloadKey：站点切换或重试时强制重挂载 iframe（子组件状态随之重置） */}
      <WebFrame key={`${url}-${reloadKey}`} url={url} onRetry={handleRetry} />
      {/* Web 端设置入口 */}
      <TouchableOpacity
        onPress={onOpenSettings}
        style={styles.webSettingsBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="settings-outline" size={16} color="#64748B" />
      </TouchableOpacity>
    </View>
  );
};

// 单次加载会话的 iframe：状态随组件挂载重置，卸载即清除定时器
const WebFrame: React.FC<{ url: string; onRetry: () => void }> = ({ url, onRetry }) => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // 加载超时/失败检测
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    // 20 秒未完成加载则视为失败（跨域 iframe 无 onError 事件，用超时兜底）
    const timer = setTimeout(() => {
      setIframeLoaded((loaded) => {
        if (!loaded) setIframeError(true);
        return loaded;
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <iframe
        src={url}
        style={styles.iframe}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onLoad={() => {
          setIframeLoaded(true);
          setIframeError(false);
        }}
      />
      {/* 加载失败覆盖层 */}
      {iframeError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={52} color={DaviTheme.colors.accent} />
          </View>
          <Text style={styles.errorTitle}>暂时无法连接</Text>
          <Text style={styles.errorMessage}>请检查网络连接后重试</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* 网页加载完成前显示加载页（与移动端 renderLoading 体验一致） */}
      {!iframeLoaded && !iframeError && <LoadingScreen />}
    </>
  );
};

// WebView 内容加载前注入 — 隐藏滚动条 CSS + 桌面模式视口
function makePreInjectedJS(desktopMode?: boolean): string {
  const hideScrollbarCSS = `
    var _s = document.createElement('style');
    _s.textContent = '::-webkit-scrollbar{display:none;width:0;height:0}html{overflow:-moz-scrollbars-none;-ms-overflow-style:none;scrollbar-width:none}';
    document.head.appendChild(_s);
  `;
  const viewportScript = desktopMode ? `
    (function() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        meta.content = 'width=1024, initial-scale=' + (Math.min(window.screen.width, 414) / 1024).toFixed(2) + ', maximum-scale=5.0, user-scalable=yes';
      } else {
        var m = document.createElement('meta');
        m.name = 'viewport';
        m.content = 'width=1024, maximum-scale=5.0, user-scalable=yes';
        document.head.appendChild(m);
      }
    })();
  ` : '';
  return hideScrollbarCSS + viewportScript;
}

// WebView 内容加载后注入 — 长按检测 + 拦截下载等交互逻辑
function makeInjectedJS(): string {
  return `(function() {
      /* 长按顶部呼出设置 (1.5s 长按，不跟系统三击放大冲突) */
      var _lpTimer = null;
      document.addEventListener('touchstart', function(e) {
        var y = e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY;
        if (y !== undefined && y < 60) {
          _lpTimer = setTimeout(function() {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage('__TRIPLE_TAP__');
          }, 1500);
        }
      }, true);
      document.addEventListener('touchmove', function(e) {
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      }, true);
      document.addEventListener('touchend', function(e) {
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      }, true);
      /* 下载拦截 */
      var blobMap = {};
      var origCreate = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
        var url = origCreate.call(URL, blob);
        blobMap[url] = blob;
        return url;
      };
      document.addEventListener('click', function(e) {
        var t = e.target.closest('a');
        if (!t || !t.href) return;
        var h = t.href;
        /* 电话/邮件/短信 — 截获发给 RN 处理 */
        if (h.startsWith('tel:') || h.startsWith('mailto:') || h.startsWith('sms:')) {
          e.preventDefault();
          e.stopPropagation();
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage('__PROTOCOL__' + h);
          return;
        }
        if (t.download && h) {
          e.preventDefault();
          e.stopPropagation();
          var name = t.download || 'download';
          if (h.startsWith('blob:')) {
            var b = blobMap[h];
            if (b) {
              var r = new FileReader();
              r.onload = function() {
                var parts = r.result.split(',');
                window.ReactNativeWebView.postMessage(JSON.stringify({type:'BLOB_DOWNLOAD',fileName:name,mimeType:b.type,data:parts[1]}));
              };
              r.readAsDataURL(b);
            }
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'URL_DOWNLOAD',url:h,fileName:name}));
          }
        }
      }, true);
    })();
    true;
  `;
}

// 移动端 WebView
const WebView_Mobile: React.FC<{ url: string; onTripleTap: () => void; desktopMode?: boolean; onReloadReady?: (reload: () => void) => void }> = ({ url, onTripleTap, desktopMode, onReloadReady }) => {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 接收 WebView 发来的消息
  const handleMessage = useCallback((event: any) => {
    const data = event.nativeEvent.data;
    
    if (data === '__TRIPLE_TAP__') {
      onTripleTap();
      return;
    }
    
    // 处理 tel:/mailto:/sms: 协议链接
    if (typeof data === 'string' && data.startsWith('__PROTOCOL__')) {
      const protocolUrl = data.slice('__PROTOCOL__'.length);
      Linking.openURL(protocolUrl);
      return;
    }
    
    handleDownloadMessage(data);
  }, [onTripleTap]);

  // 重试加载
  const reloadWebView = useCallback(() => {
    setHasError(false);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  // 暴露 reloadWebView 给父组件
  useEffect(() => {
    if (onReloadReady) {
      onReloadReady(reloadWebView);
    }
  }, [onReloadReady, reloadWebView]);
  
  // 监听导航状态变化，保存当前 URL 以便下次启动时恢复
  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    // 保存当前页面 URL，以便下次启动时恢复到上次退出的页面
    if (navState.url && navState.url !== url && navState.url.startsWith('http')) {
      daviSetItem(STORAGE_URL_KEY, navState.url);
    }
  }, [url]);
  
  // 返回网页上一页
  const handleGoBack = useCallback(() => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    }
  }, [canGoBack]);
  
  // 处理 Android 物理返回键
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    
    return () => backHandler.remove();
  }, [canGoBack]);
  
  // 拦截下载链接 + 处理 tel:/mailto:/sms:
  const handleShouldStartLoad = useCallback((request: any) => {
    const { url: requestUrl } = request;
    if (requestUrl.startsWith('tel:') || requestUrl.startsWith('mailto:') || requestUrl.startsWith('sms:')) {
      Linking.openURL(requestUrl).catch(() => ({}));
      return false;
    }
    if (isDownloadableUrl(requestUrl)) {
      handleDownload(requestUrl);
      return false;
    }
    return true;
  }, []);
  
  // Android 原生下载检测
  const handleFileDownload = useCallback((event: any) => {
    const downloadUrl = event?.url;
    if (downloadUrl) {
      handleDownload(downloadUrl);
    }
  }, []);

  // 处理 window.open — 阻止新窗口，在当前 WebView 加载
  const handleOpenWindow = useCallback((event: any) => {
    const eventUrl = event?.nativeEvent?.url;
    if (eventUrl && webViewRef.current) {
      // 使用 JSON.stringify 安全转义 URL，防止注入
      const safeUrl = JSON.stringify(eventUrl);
      webViewRef.current.injectJavaScript(`window.location.href = ${safeUrl};`);
    }
  }, []);
  
  return (
    <View style={styles.container}>
      {/* 顶部安全区域占位 */}
      <View style={{ height: insets.top }} />
      
      <View style={styles.webViewWrapper}>
        <WebView
          key={desktopMode ? 'desktop' : 'mobile'}
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          injectedJavaScriptBeforeContentLoaded={makePreInjectedJS(desktopMode)}
          injectedJavaScript={makeInjectedJS()}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onFileDownload={handleFileDownload}
          onOpenWindow={handleOpenWindow}
          geolocationEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          userAgent={desktopMode ? DESKTOP_UA : undefined}
          onError={() => {
            setHasError(true);
          }}
          androidLayerType="hardware"
          bounces={true}
          allowsBackForwardNavigationGestures={true}
          startInLoadingState={true}
          renderLoading={() => <LoadingScreen />}
          scalesPageToFit={true}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheMode="LOAD_DEFAULT"
          mixedContentMode="compatibility"
        />
        
        {/* 错误覆盖层 — 全屏覆盖 WebView 原生错误页 */}
        {hasError && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={52} color={DaviTheme.colors.accent} />
            </View>
            <Text style={styles.errorTitle}>暂时无法连接</Text>
            <Text style={styles.errorMessage}>
              请检查网络连接后重试
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={reloadWebView} activeOpacity={0.8}>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryText}>重新加载</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* 底部安全区域占位 */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
};

export default function DaviScreen() {
  const defaultUrl = DaviTheme.webview.url;
  const appVersion = Constants.expoConfig?.version ?? '2.0.0';
  const [targetUrl, setTargetUrl] = useState(defaultUrl);
  const [urlList, setUrlList] = useState<string[]>(DEFAULT_SITES);
  const [showSettings, setShowSettings] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const reloadFnRef = useRef<(() => void) | null>(null);
  // 持久化数据是否已恢复（避免先渲染默认页再跳转造成闪烁 / 错误覆盖）
  const [isHydrated, setIsHydrated] = useState(false);
  
  // 加载持久化数据
  useEffect(() => {
    (async () => {
      try {
        const saved = await daviGetItem(STORAGE_URL_KEY);
        if (saved && saved.startsWith('http')) {
          setTargetUrl(saved);
        }
        const listJson = await daviGetItem(STORAGE_URL_LIST_KEY);
        if (listJson) {
          const parsed = JSON.parse(listJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setUrlList(parsed);
          }
        }
        const desktopJson = await daviGetItem(STORAGE_DESKTOP_KEY);
        if (desktopJson !== null) {
          setDesktopMode(desktopJson === 'true');
        }
      } catch {} finally {
        setIsHydrated(true);
      }
    })();
  }, []);
  
  // 持久化站点列表
  const persistUrlList = useCallback(async (list: string[]) => {
    setUrlList(list);
    try {
      await daviSetItem(STORAGE_URL_LIST_KEY, JSON.stringify(list));
    } catch {}
  }, []);
  
  // 切换到某个站点
  const switchToUrl = useCallback((url: string) => {
    setTargetUrl(url);
    setShowSettings(false);
    setEditingIndex(null);
    setIsAdding(false);
    setConfirmDeleteIndex(null);
    daviSetItem(STORAGE_URL_KEY, url);
  }, []);
  
  // 桌面模式切换
  const toggleDesktopMode = useCallback((value: boolean) => {
    setDesktopMode(value);
    daviSetItem(STORAGE_DESKTOP_KEY, value ? 'true' : 'false');
  }, []);
  
  // 打开设置
  const openSettings = useCallback(() => {
    setEditingIndex(null);
    setIsAdding(false);
    setEditUrl('');
    setShowSettings(true);
  }, []);
  
  // 开始编辑
  const startEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditUrl(urlList[index]);
    setIsAdding(false);
  }, [urlList]);
  
  // 开始新增
  const startAdd = useCallback(() => {
    setEditingIndex(null);
    setIsAdding(true);
    setEditUrl('https://');
  }, []);
  
  // 保存编辑/新增
  const saveSite = useCallback(async () => {
    const trimmed = editUrl.trim();
    if (!trimmed) return;
    const final = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    
    let newList: string[];
    if (editingIndex !== null) {
      newList = [...urlList];
      newList[editingIndex] = final;
    } else {
      newList = [...urlList, final];
    }
    
    await persistUrlList(newList);
    setEditingIndex(null);
    setIsAdding(false);
    setEditUrl('');
    // 自动切换到编辑/新增后的站点
    switchToUrl(final);
  }, [editUrl, editingIndex, urlList, persistUrlList, switchToUrl]);
  
  // 删除站点
  const deleteSite = useCallback(async (index: number) => {
    const newList = urlList.filter((_, i) => i !== index);
    if (newList.length === 0) return;
    await persistUrlList(newList);
    // 如果删除的是当前站点，切换到第一个
    if (urlList[index] === targetUrl) {
      switchToUrl(newList[0]);
    }
    setEditingIndex(null);
    setIsAdding(false);
    setEditUrl('');
    setConfirmDeleteIndex(null);
  }, [urlList, targetUrl, persistUrlList, switchToUrl]);
  
  // 确认删除（Web 端 Alert 多按钮不可用，改为内联确认）
  const confirmDelete = useCallback((index: number) => {
    setConfirmDeleteIndex(index);
  }, []);

  // 取消删除确认
  const cancelDelete = useCallback(() => {
    setConfirmDeleteIndex(null);
  }, []);
  
  // 接收 WebView 的 reload 函数
  const handleReloadReady = useCallback((fn: () => void) => {
    reloadFnRef.current = fn;
  }, []);
  
  // 设置弹窗（Web 和 Mobile 共用）
  const renderSettingsModal = () => (
    <Modal visible={showSettings} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView behavior="padding" style={styles.modalCenter}>
              <View style={styles.settingsPanel}>
                
                {/* 编辑/新增模式 */}
                {(editingIndex !== null || isAdding) ? (
                  <>
                    <View style={styles.editHeader}>
                      <TouchableOpacity onPress={() => { setEditingIndex(null); setIsAdding(false); setEditUrl(''); }}>
                        <Ionicons name="arrow-back" size={22} color="#94A3B8" />
                      </TouchableOpacity>
                      <Text style={styles.settingsTitle}>
                        {isAdding ? '添加站点' : '编辑站点'}
                      </Text>
                      <View style={{ width: 22 }} />
                    </View>
                    <TextInput
                      style={styles.urlInput}
                      value={editUrl}
                      onChangeText={setEditUrl}
                      placeholder="输入网址..."
                      placeholderTextColor="rgba(148, 163, 184, 0.4)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      autoFocus
                    />
                    <View style={styles.settingsButtons}>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => { setEditingIndex(null); setIsAdding(false); setEditUrl(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cancelText}>取消</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.saveButton}
                        onPress={saveSite}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.saveText}>保存</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.scrollContent}
                    >
                      {/* 站点列表 */}
                      <View style={styles.settingRow}>
                        <Text style={styles.settingsTitle}>站点管理</Text>
                        <View style={styles.titleActions}>
                          <TouchableOpacity onPress={() => reloadFnRef.current?.()} activeOpacity={0.7} style={styles.actionBtn}>
                            <Ionicons name="refresh" size={18} color="#64748B" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={startAdd} activeOpacity={0.7}>
                            <Ionicons name="add-circle" size={24} color={DaviTheme.colors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setShowSettings(false)} style={styles.closeBtn} activeOpacity={0.7}>
                            <Ionicons name="close" size={16} color="#64748B" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.headerAccent} />
                      <Text style={styles.settingsDesc}>
                        {urlList.length} 个站点，点击切换
                      </Text>
                      
                      {/* 桌面网站模式切换 */}
                      <View style={styles.desktopToggleRow}>
                        <View style={styles.desktopToggleLeft}>
                          <Ionicons name="laptop-outline" size={18} color="#64748B" />
                          <Text style={styles.desktopToggleLabel}>桌面网站模式</Text>
                        </View>
                        <Switch
                          value={desktopMode}
                          onValueChange={toggleDesktopMode}
                          trackColor={{ false: '#334155', true: 'rgba(59, 130, 246, 0.4)' }}
                          thumbColor={desktopMode ? '#3B82F6' : '#64748B'}
                        />
                      </View>
                      <Text style={styles.desktopToggleHint}>
                        {desktopMode ? '已切换为桌面版视图，支持双指缩放' : '以桌面浏览器标识访问，支持双指缩放'}
                      </Text>
                      
                      {/* 站点卡片列表 */}
                      {urlList.map((item, index) => {
                        const isActive = item === targetUrl;
                        const isConfirming = confirmDeleteIndex === index;
                        return (
                          <View
                            key={`${item}-${index}`}
                            style={[
                              styles.siteItem,
                              isActive && styles.siteItemActive,
                            ]}
                          >
                            {/* 选中指示器 */}
                            <View style={styles.siteItemLeft}>
                              {isActive ? (
                                <Ionicons name="checkmark-circle" size={18} color={DaviTheme.colors.accent} />
                              ) : (
                                <View style={styles.siteDot} />
                              )}
                            </View>

                            {/* 网址信息 */}
                            <TouchableOpacity
                              style={styles.siteItemContent}
                              onPress={() => !isConfirming && switchToUrl(item)}
                              activeOpacity={0.7}
                              disabled={isConfirming}
                            >
                              <Text
                                style={[
                                  styles.siteItemUrl,
                                  isActive && styles.siteItemUrlActive,
                                ]}
                                numberOfLines={1}
                                ellipsizeMode="middle"
                              >
                                {item}
                              </Text>
                            </TouchableOpacity>

                            {/* 操作按钮 */}
                            <View style={styles.siteItemActions}>
                              {isConfirming ? (
                                <>
                                  <View style={styles.confirmDeleteWrap}>
                                    <Text style={styles.confirmDeleteTitle}>确认删除？</Text>
                                    <TouchableOpacity
                                      onPress={() => deleteSite(index)}
                                      style={[styles.siteActionBtn, styles.confirmDeleteBtn]}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                      <Text style={styles.confirmDeleteText}>删除</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={cancelDelete}
                                      style={styles.siteActionBtn}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                      <Text style={styles.cancelDeleteText}>取消</Text>
                                    </TouchableOpacity>
                                  </View>
                                </>
                              ) : (
                                <>
                                  <TouchableOpacity
                                    onPress={() => startEdit(index)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={styles.siteActionBtn}
                                  >
                                    <Ionicons name="pencil" size={15} color="#64748B" />
                                  </TouchableOpacity>
                                  {urlList.length > 1 && (
                                    <TouchableOpacity
                                      onPress={() => confirmDelete(index)}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                      style={styles.siteActionBtn}
                                    >
                                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                    </TouchableOpacity>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        );
                      })}
                      {urlList.length === 0 && (
                        <Text style={styles.emptyText}>暂无站点，点击右上角 + 添加</Text>
                      )}
                      
                      {/* 底部信息 */}
                      <View style={styles.settingsFooter}>
                        <Text style={styles.footerVersion}>知行工作台 v{appVersion}</Text>
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
  
  // 持久化数据恢复完成前，先展示加载页，避免先渲染默认页再跳转造成闪烁
  if (!isHydrated) {
    return <LoadingScreen />;
  }
  
  if (Platform.OS === 'web') {
    return (
      <>
        <WebView_Web url={targetUrl} onOpenSettings={openSettings} />
        {renderSettingsModal()}
      </>
    );
  }
  
  return (
    <>
      <WebView_Mobile url={targetUrl} onTripleTap={openSettings} desktopMode={desktopMode} onReloadReady={handleReloadReady} />
      {renderSettingsModal()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: DaviTheme.colors.background,
  },
  iframe: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  webSettingsBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.25)',
  },
  webViewWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: DaviTheme.colors.background,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DaviTheme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    zIndex: 100,
  },
  errorIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.12)',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: DaviTheme.colors.text,
    marginBottom: 12,
    letterSpacing: 2,
  },
  errorMessage: {
    fontSize: 14,
    color: DaviTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: DaviTheme.colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: DaviTheme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  // 设置弹窗 — 优雅版
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCenter: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  settingsPanel: {
    backgroundColor: '#0B1121',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.12)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  settingsTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: 2,
  },
  headerAccent: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
    marginTop: 8,
    marginBottom: 16,
    opacity: 0.8,
  },
  settingsDesc: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 20,
    lineHeight: 18,
    letterSpacing: 0.5,
  },
  desktopToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.2)',
  },
  desktopToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  desktopToggleLabel: {
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  desktopToggleHint: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 18,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
  },
  // 站点列表
  scrollContent: {
    paddingBottom: 4,
  },
  siteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.2)',
    overflow: 'hidden',
  },
  siteItemActive: {
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  siteItemLeft: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.3)',
  },
  siteItemContent: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  siteItemUrl: {
    fontSize: 13,
    color: '#64748B',
    letterSpacing: 0.3,
  },
  siteItemUrlActive: {
    color: '#E2E8F0',
    fontWeight: '500',
  },
  siteItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  siteActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 内联删除确认
  confirmDeleteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmDeleteTitle: {
    fontSize: 11,
    color: '#F87171',
    marginRight: 2,
  },
  confirmDeleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    width: 44,
  },
  confirmDeleteText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  cancelDeleteText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  urlInput: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 14,
    color: '#E2E8F0',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.15)',
    marginBottom: 20,
  },
  settingsButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.1)',
  },
  cancelText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  saveButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: DaviTheme.colors.accent,
    shadowColor: DaviTheme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  saveText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  settingsFooter: {
    marginTop: 12,
    alignItems: 'center',
  },
  footerVersion: {
    fontSize: 10,
    color: 'rgba(148, 163, 184, 0.3)',
    letterSpacing: 2,
    marginTop: 12,
    fontWeight: '400',
  },
});