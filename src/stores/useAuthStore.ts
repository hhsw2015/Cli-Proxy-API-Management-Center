/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus, ServerRuntimeKind } from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { versionApi } from '@/services/api/version';
import { useConfigStore } from './useConfigStore';
import { useModelsStore } from './useModelsStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

// Sub2API SSO: localStorage key used by Sub2API frontend for JWT
const SUB2API_TOKEN_KEY = 'auth_token';

/**
 * Check if the current page is served under a commercial (Sub2API) deployment.
 * Heuristic: the management panel is loaded at /management.html (not standalone).
 */
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

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (
    version: string | null,
    buildDate?: string | null,
    runtimeKind?: ServerRuntimeKind | null
  ) => void;
  updateServerRuntimeKind: (runtimeKind: ServerRuntimeKind) => void;
  updateServerPluginSupport: (supportsPlugin: boolean) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;
let suppressUnauthorized = false;

const detectRuntimeKind = async (): Promise<ServerRuntimeKind> => {
  try {
    return await versionApi.detectRuntimeKind();
  } catch (error) {
    console.warn('Runtime kind detection failed:', error);
    return 'unknown';
  }
};

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
      serverRuntimeKind: 'unknown',
      supportsPlugin: false,
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
          const resolvedBase = normalizeApiBase(
            apiBase || legacyBase || detectApiBaseFromLocation()
          );
          const resolvedKey = managementKey || legacyKey || '';
          const resolvedRememberPassword =
            rememberPassword || Boolean(managementKey) || Boolean(legacyKey);

          set({
            apiBase: resolvedBase,
            managementKey: resolvedKey,
            rememberPassword: resolvedRememberPassword,
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          // SSO: try Sub2API JWT ONLY if no saved credentials exist
          // (avoid interfering with "remember password" flow)
          if (!resolvedKey) {
            const ssoToken = getSub2ApiToken();
            if (ssoToken) {
              const ssoBase = normalizeApiBase(resolvedBase || detectApiBaseFromLocation());
              suppressUnauthorized = true;
              try {
                await get().login({
                  apiBase: ssoBase,
                  managementKey: ssoToken,
                  rememberPassword: false
                });
                suppressUnauthorized = false;
                return true;
              } catch (error) {
                suppressUnauthorized = false;
                console.warn('SSO auto-login with Sub2API JWT failed:', error);
                set({ connectionStatus: 'disconnected', connectionError: null });
              }
            }
          }

          if (wasLoggedIn && resolvedBase && resolvedKey) {
            try {
              await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedKey,
                rememberPassword: resolvedRememberPassword,
              });
              return true;
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          // No stored credentials - show normal password prompt (avoid redirect loop)

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
          set({
            connectionStatus: 'connecting',
            serverVersion: null,
            serverBuildDate: null,
            serverRuntimeKind: 'unknown',
            supportsPlugin: false,
          });
          useModelsStore.getState().clearCache();

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey,
          });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);
          const runtimeKind = await detectRuntimeKind();

          // 登录成功
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            rememberPassword,
            connectionStatus: 'connected',
            connectionError: null,
            ...(runtimeKind !== 'unknown' ? { serverRuntimeKind: runtimeKind } : {}),
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
            connectionError: message || 'Connection failed',
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        useModelsStore.getState().clearCache();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverBuildDate: null,
          serverRuntimeKind: 'unknown',
          supportsPlugin: false,
          connectionStatus: 'disconnected',
          connectionError: null,
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
          set({ supportsPlugin: false });

          // 验证连接
          await useConfigStore.getState().fetchConfig();
          const runtimeKind = await detectRuntimeKind();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected',
            ...(runtimeKind !== 'unknown' ? { serverRuntimeKind: runtimeKind } : {}),
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error',
            supportsPlugin: false,
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate, runtimeKind) => {
        set((state) => ({
          serverVersion: version || null,
          serverBuildDate: buildDate || null,
          serverRuntimeKind: runtimeKind || state.serverRuntimeKind,
        }));
      },

      updateServerRuntimeKind: (runtimeKind) => {
        set({ serverRuntimeKind: runtimeKind });
      },

      updateServerPluginSupport: (supportsPlugin) => {
        set({ supportsPlugin });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error,
        });
      },
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
        },
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword ? { managementKey: state.managementKey } : {}),
        rememberPassword: state.rememberPassword,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
        serverRuntimeKind: state.serverRuntimeKind,
      }),
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    if (suppressUnauthorized) return;
    useAuthStore.getState().logout();
  });

  window.addEventListener('server-version-update', ((e: CustomEvent) => {
    const detail = e.detail || {};
    const runtimeKind =
      detail.runtimeKind === 'cpa' || detail.runtimeKind === 'home' ? detail.runtimeKind : null;
    useAuthStore
      .getState()
      .updateServerVersion(detail.version || null, detail.buildDate || null, runtimeKind);
  }) as EventListener);

  window.addEventListener('server-plugin-support-update', ((e: CustomEvent) => {
    useAuthStore.getState().updateServerPluginSupport(e.detail?.supportsPlugin === true);
  }) as EventListener);
}
