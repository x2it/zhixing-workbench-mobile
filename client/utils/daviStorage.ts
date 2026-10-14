/**
 * 知行工作台 - 统一持久化存储
 *
 * 背景：在 Web 预览（iframe）环境中，@react-native-async-storage/async-storage
 * 底层使用 localStorage，可能因隐私模式、第三方 cookie 限制或域名变化而失效。
 * 为保证「记住上次访问的网站」功能可靠，这里实现多通道存储：
 *
 *   - 移动端（iOS/Android）：AsyncStorage（原生实现，可靠）
 *   - Web 端：localStorage 优先，AsyncStorage 兜底
 *   - 内存 Map 兜底：即使所有持久化通道都不可用，也保证当前会话内状态一致
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// 会话级内存缓存（final fallback）
const memoryCache = new Map<string, string | null>();

/**
 * 安全读取 Web localStorage（可能被 iframe/隐私模式禁用）
 */
function readLocalStorage(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // localStorage 不可用（隐私模式 / 第三方 cookie 限制），静默降级
  }
  return null;
}

/**
 * 安全写入 Web localStorage
 */
function writeLocalStorage(key: string, value: string): boolean {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    // 写入失败（可能 quota 超限），静默降级
  }
  return false;
}

/**
 * 安全移除 Web localStorage
 */
function removeLocalStorage(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // 忽略
  }
}

/**
 * 读取持久化值：AsyncStorage → localStorage → 内存缓存
 */
export async function daviGetItem(key: string): Promise<string | null> {
  // 1. AsyncStorage（移动端原生 / Web 端异步实现）
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) {
      memoryCache.set(key, value);
      return value;
    }
  } catch {
    // 继续尝试下一通道
  }

  // 2. Web localStorage（直接访问，绕过 AsyncStorage 的兼容层）
  const lsValue = readLocalStorage(key);
  if (lsValue !== null) {
    memoryCache.set(key, lsValue);
    return lsValue;
  }

  // 3. 内存缓存（会话级）
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }

  return null;
}

/**
 * 写入持久化值：AsyncStorage + localStorage + 内存缓存 全部写入
 */
export async function daviSetItem(key: string, value: string): Promise<void> {
  // 始终更新内存缓存（保证会话内一致）
  memoryCache.set(key, value);

  // 1. AsyncStorage
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // 继续
  }

  // 2. Web localStorage 双写（即使 AsyncStorage 失败也有兜底）
  writeLocalStorage(key, value);
}

/**
 * 移除持久化值
 */
export async function daviRemoveItem(key: string): Promise<void> {
  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // 继续
  }
  removeLocalStorage(key);
}
