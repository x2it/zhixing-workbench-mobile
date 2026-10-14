/**
 * 知行工作台 - 文件下载引擎
 *
 * 核心策略：
 * 1. 所有文件优先保存到 App 文档目录（无需权限）
 * 2. 下载完成后弹出系统分享面板，用户可选择保存位置（文件/相册/其他应用）
 * 3. 图片额外提供"保存到相册"快捷选项（需权限，失败不影响）
 * 4. 无法下载的 URL 走系统浏览器（最可靠）
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform, Share, ToastAndroid } from 'react-native';

// ─── 通知 ──────────────────────────────

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('', msg);
  }
}

// ─── 去重：同一文件 5 秒内只下载一次 ──────

const processedDownloads = new Map<string, number>();
const DEDUP_INTERVAL = 5000;

function isRecentlyProcessed(key: string): boolean {
  const now = Date.now();
  const last = processedDownloads.get(key);
  if (last && now - last < DEDUP_INTERVAL) return true;
  processedDownloads.set(key, now);
  // 清理过期条目
  if (processedDownloads.size > 20) {
    const expired: string[] = [];
    processedDownloads.forEach((t, k) => {
      if (now - t >= DEDUP_INTERVAL) expired.push(k);
    });
    expired.forEach((k) => processedDownloads.delete(k));
  }
  return false;
}

// ─── 文件类型判断 ──────────────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.tar', '.gz', '.csv', '.json', '.xml', '.txt'];

function getFileExtension(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx > 0 ? path.slice(idx).toLowerCase() : '';
}

function isImageFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return IMAGE_EXTENSIONS.includes(ext);
}

function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

export function isDownloadableUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return (
      IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext)) ||
      DOC_EXTENSIONS.some((ext) => pathname.endsWith(ext))
    );
  } catch {
    return false;
  }
}

// ─── 文件名提取 ────────────────────────

function extractFileName(url: string, fallback: string): string {
  try {
    const segments = new URL(url).pathname.split('/');
    const last = segments[segments.length - 1];
    return last || fallback;
  } catch {
    return fallback;
  }
}

// ─── 生成唯一文件名 ────────────────────

function uniqueFileName(baseName: string): string {
  const ext = getFileExtension(baseName);
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return ext ? `${nameWithoutExt}_${ts}_${rand}${ext}` : `${nameWithoutExt}_${ts}_${rand}`;
}

// ─── 保存目录 ──────────────────────────

/**
 * 获取下载目录，确保目录存在
 * 路径: documentDirectory/Downloads/
 */
async function getDownloadDir(): Promise<string> {
  const baseDir = (FileSystem as any).documentDirectory;
  if (!baseDir) throw new Error('无法访问应用存储目录');
  const dir = `${baseDir}Downloads/`;
  // 确保目录存在
  const info = await (FileSystem as any).getInfoAsync(dir);
  if (!info.exists) {
    await (FileSystem as any).makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

// ─── 保存 Base64 数据到文件 ────────────

async function saveBase64ToFile(fileName: string, base64Data: string): Promise<string | null> {
  try {
    const dir = await getDownloadDir();
    const name = uniqueFileName(fileName);
    const fileUri = `${dir}${name}`;

    await (FileSystem as any).writeAsStringAsync(fileUri, base64Data, {
      encoding: (FileSystem as any).EncodingType.Base64,
    });

    return fileUri;
  } catch (error) {
    console.warn('saveBase64ToFile error:', error);
    return null;
  }
}

// ─── 保存文件到相册（仅图片）──────────

async function saveToGallery(fileUri: string): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      showToast('需要相册权限才能保存到相册');
      return false;
    }
    await MediaLibrary.saveToLibraryAsync(fileUri);
    return true;
  } catch {
    return false;
  }
}

// ─── 系统分享面板 ──────────────────────

function mimeTypeOf(fileName: string): string {
  const ext = getFileExtension(fileName);
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed', '.txt': 'text/plain',
    '.csv': 'text/csv', '.json': 'application/json', '.xml': 'application/xml',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * 弹出系统分享面板，让用户选择保存位置
 * iOS: 可保存到"文件"App / 相册 / 其他应用
 * Android: 可保存到"下载" / 相册 / 其他应用
 */
async function shareFile(fileUri: string, fileName: string): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeTypeOf(fileName),
        dialogTitle: fileName,
      });
    } else {
      showToast('已保存到应用文档目录');
    }
  } catch {
    // 用户取消分享，文件已保存在文档目录
  }
}

/**
 * 下载完成后弹出保存方式选择菜单
 * 图片: 保存到相册 / 系统分享 / 取消
 * 非图片: 系统分享 / 取消
 */
async function presentSaveOptions(fileUri: string, fileName: string, isImage: boolean): Promise<void> {
  const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];

  if (isImage) {
    buttons.push({
      text: '保存到相册',
      onPress: async () => {
        const saved = await saveToGallery(fileUri);
        showToast(saved ? '已保存到相册' : '保存失败，请在设置中允许相册权限');
      },
    });
  }

  buttons.push({
    text: '系统分享',
    onPress: () => shareFile(fileUri, fileName),
  });

  buttons.push({ text: '取消', style: 'cancel' });

  Alert.alert('保存文件', fileName, buttons);
}

// ─── 处理 WebView onMessage ────────────

export async function handleDownloadMessage(eventData: string): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(eventData);
  } catch {
    return;
  }
  if (!msg || !msg.type) return;

  if (msg.type === 'BLOB_DOWNLOAD' && msg.data && msg.fileName) {
    if (isRecentlyProcessed('blob:' + msg.fileName)) return;
    showToast('正在保存...');

    if (isImageFile(msg.fileName)) {
      // 图片：写入临时文件 → 弹出保存方式选择
      try {
        const tempDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
        const tempName = '_temp_' + msg.fileName;
        const tempUri = `${tempDir}${tempName}`;
        await (FileSystem as any).writeAsStringAsync(tempUri, msg.data, {
          encoding: (FileSystem as any).EncodingType.Base64,
        });
        presentSaveOptions(tempUri, msg.fileName, true);
      } catch {
        showToast('保存失败，请重试');
      }
    } else {
      // 非图片：先保存到文档目录，再弹出系统分享供选择位置
      const savedUri = await saveBase64ToFile(msg.fileName, msg.data);
      if (savedUri) {
        showToast('已保存到应用文档目录');
        presentSaveOptions(savedUri, msg.fileName, false);
      } else {
        showToast('保存失败，请重试');
      }
    }
    return;
  }

  if (msg.type === 'URL_DOWNLOAD' && msg.url) {
    await handleDownload(msg.url, msg.fileName);
  }

  if (msg.type === 'SHARE') {
    try {
      await Share.share({
        title: msg.title || '',
        message: [msg.text, msg.url].filter(Boolean).join('\n'),
      });
    } catch {
      // user cancelled
    }
  }
}

// ─── URL 下载处理 ──────────────────────

export async function handleDownload(url: string, fileName?: string): Promise<void> {
  if (isRecentlyProcessed(url)) return;

  if (isImageUrl(url)) {
    // 图片：下载到缓存 → 弹出保存方式选择
    try {
      showToast('正在下载...');
      const tempDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
      const name = uniqueFileName(fileName || extractFileName(url, 'image'));
      const tempUri = `${tempDir}${name}`;
      const result = await (FileSystem as any).downloadAsync(url, tempUri);
      if (result && result.uri) {
        presentSaveOptions(result.uri, name, true);
      }
    } catch {
      // 下载失败 → 系统浏览器打开
      await openInBrowser(url);
    }
    return;
  }

  // 非图片 → 系统浏览器打开
  await openInBrowser(url);
}

// ─── 系统浏览器打开 ────────────────────

async function openInBrowser(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      showToast('正在通过浏览器下载...');
    } else {
      showToast('无法打开此下载链接');
    }
  } catch {
    showToast('打开下载链接失败');
  }
}