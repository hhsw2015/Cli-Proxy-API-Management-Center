/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus } from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { useConfigStore } from './useConfigStore';
import { useUsageStatsStore } from './useUsageStatsStore';
import { useModelsStore } from './useModelsStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

// Sub2API SSO: localStorage key used by Sub2API frontend for JWT
const SUB2API_TOKEN_KEY = 'auth_token';

/**
 * Check if the current page is served under a commercial (Sub2API) deployment.
 * Heuristic: the management panel is loaded at /management.html (not standalone).
 */
function isCommercialMode(): boolean {
  return window.location.pathname.includes('/management.html') &&
    localStorage.getItem(SUB2API_TOKEN_KEY) !== null;
}

/**
 * Read the Sub2API JWT from localStorage (if any).
 */
function getSub2ApiToken(): string | null {
  try {
    return localStorage.getItem(SUB2API_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Redirect to Sub2API login page with a redirect back to the management panel.
 */
function redirectToSub2ApiLogin(): void {
  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  window.location.href = '/login?redirect=' + encodeURIComponent(currentPath);
}

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      rememberPassword: false,
      serverVersion: null,
      serverBuildDate: null,
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: () => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          obfuscatedStorage.migratePlaintextKeys(['apiBase', 'apiUrl', 'managementKey']);

          const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const legacyBase =
            obfuscatedStorage.getItem<string>('apiBase') ||
            obfuscatedStorage.getItem<string>('apiUrl', { encrypt: true });
          const legacyKey = obfuscatedStorage.getItem<string>('managementKey');

          const { apiBase, managementKey, rememberPassword } = get();
          const resolvedBase = normalizeApiBase(apiBase || legacyBase || detectApiBaseFromLocation());
          const resolvedKey = managementKey || legacyKey || '';
          const resolvedRememberPassword = rememberPassword || Boolean(managementKey) || Boolean(legacyKey);

          set({
            apiBase: resolvedBase,
            managementKey: resolvedKey,
            rememberPassword: resolvedRememberPassword
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          // SSO: try Sub2API JWT before legacy credential restore
          const ssoToken = getSub2ApiToken();
          if (ssoToken) {
            const ssoBase = normalizeApiBase(resolvedBase || detectApiBaseFromLocation());
            try {
              await get().login({
                apiBase: ssoBase,
                managementKey: ssoToken,
                rememberPassword: false
              });
              return true;
            } catch (error) {
              console.warn('SSO auto-login with Sub2API JWT failed:', error);
              // JWT invalid or expired - in commercial mode, redirect to Sub2API login
              if (isCommercialMode()) {
                redirectToSub2ApiLogin();
                return false;
              }
              // Fall through to legacy login
            }
          }

          if (wasLoggedIn && resolvedBase && resolvedKey) {
            try {
              await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedKey,
                rememberPassword: resolvedRememberPassword
              });
              return true;
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          // No stored credentials and in commercial mode - redirect to Sub2API login
          if (!resolvedKey && isCommercialMode()) {
            redirectToSub2ApiLogin();
            return false;
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        const apiBase = normalizeApiBase(credentials.apiBase);
        const managementKey = credentials.managementKey.trim();
        const rememberPassword = credentials.rememberPassword ?? get().rememberPassword ?? false;

        try {
          set({ connectionStatus: 'connecting' });
          useModelsStore.getState().clearCache();

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey
          });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);

          // 登录成功
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            rememberPassword,
            connectionStatus: 'connected',
            connectionError: null
          });
          if (rememberPassword) {
            localStorage.setItem('isLoggedIn', 'true');
          } else {
            localStorage.removeItem('isLoggedIn');
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message || 'Connection failed'
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        useUsageStatsStore.getState().clearUsageStats();
        useModelsStore.getState().clearCache();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverBuildDate: null,
          connectionStatus: 'disconnected',
          connectionError: null
        });
        localStorage.removeItem('isLoggedIn');
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey, apiBase } = get();

        if (!managementKey || !apiBase) {
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected'
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error'
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error
        });
      }
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = obfuscatedStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        }
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword ? { managementKey: state.managementKey } : {}),
        rememberPassword: state.rememberPassword,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate
      })
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
    // In commercial mode, redirect to Sub2API login instead of showing password prompt
    if (isCommercialMode()) {
      redirectToSub2ApiLogin();
    }
  });

  window.addEventListener(
    'server-version-update',
    ((e: CustomEvent) => {
      const detail = e.detail || {};
      useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
    }) as EventListener
  );
}
