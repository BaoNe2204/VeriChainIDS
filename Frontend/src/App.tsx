
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Filter, X } from 'lucide-react';
import { cn } from './lib/utils';
import { useDataWorker, useFetchWorker } from './hooks/useDataWorker';

// Types & Data
import { Theme, Language, AuthMode, ApiKey, Agent, ServerKeyModalState, Notification } from './types';
import type { User, Alert, Ticket } from './services/api';
import { translations } from './i18n/translations';

// API Client
import {
  AuthApi,
  ServersApi,
  AlertsApi,
  TicketsApi,
  ReportsApi,
  UsersApi,
  PaymentApi,
  DefenseApi,
  NotificationsApi,
  WhitelistApi,
  type BlockedIP,
  type WhitelistEntry,
  createSignalRConnection,
  type SignalRCallbacks,
  getStoredUser,
  setStoredUser,
  isAuthenticated,
  clearAuth,
} from './services/api';

// Components
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { Agents } from './components/Agents';
import { AIEngine } from './components/AIEngine';
import { Incidents } from './components/Incidents';
import { Reports } from './components/Reports';
import { Billing } from './components/Billing';
import { Settings } from './components/Settings';
import { Modals } from './components/Modals';
import { Account } from './components/Account';
import { UserManagement } from './components/UserManagement';
import { PricingManagement } from './components/PricingManagement';
import { SystemLogs } from './components/SystemLogs';
import { ApiGuide } from './components/ApiGuide';
import { AgentSetupGuide } from './components/AgentSetupGuide';
import { ApiManagement } from './components/ApiManagement';
import { Defense } from './components/Defense';
import { BlockchainVerify } from './components/BlockchainVerify';
import { Whitelist } from './components/Whitelist';
import { CheckoutPage } from './components/CheckoutPage';
import { PaymentResultPage, type DemoPaymentResult } from './components/PaymentResultPage';
import { MySubscription } from './components/MySubscription';
import { ContactPage } from './components/ContactPage';
import { ServerSelector } from './components/ServerSelector';
import ServerAlertEmailsModal from './components/ServerAlertEmailsModal';
import ServerTelegramRecipientsModal from './components/ServerTelegramRecipientsModal';
import { TicketManagement } from './components/TicketManagement';
import { NotificationCenter } from './components/NotificationCenter';
import { ServerSettings } from './components/ServerSettings';

export default function App() {
  const { processDashboardData } = useDataWorker();
  const { fetchDashboard, fetchMultiple, isReady: workerReady } = useFetchWorker();

  // --- Loading State ---
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // --- State ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => isAuthenticated());
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [language, setLanguage] = useState<Language>('vi');
  const [theme, setTheme] = useState<Theme>('dark');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showAPIKeyModal, setShowAPIKeyModal] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  // 2FA login flow
  const [pending2FA, setPending2FA] = useState<{ email: string; password: string; tempToken: string } | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<{ type: string; data: any } | null>(null);
  const [pricingPlans, setPricingPlans] = useState<any[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<any | null>(null);
  const [demoResult, setDemoResult]     = useState<{ orderId: string; planName: string; amount: number } | null>(null);
  const [subscriptionRefreshKey, setSubscriptionRefreshKey] = useState(0);
  const [apiGuide, setApiGuide] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Server API key vừa xem (dùng cho modal hiện key)
  const [serverKeyToView, setServerKeyToView] = useState<ServerKeyModalState | null>(null);
  // Server email management modal
  const [serverEmailModal, setServerEmailModal] = useState<{ serverId: string; serverName: string } | null>(null);
  const [serverTelegramModal, setServerTelegramModal] = useState<{ serverId: string; serverName: string } | null>(null);

  // Real data from API
  const [servers, setServers] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  
  // Server filter - for multi-server management
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  
  // Traffic & attack data from API
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [attackTypes, setAttackTypes] = useState<any[]>([]);
  const [mitreData, setMitreData] = useState<any[]>([]);
  // Blocked IPs (Defense)
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  // Whitelists
  const [whitelists, setWhitelists] = useState<WhitelistEntry[]>([]);
  // Tickets (real-time)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // Loading states
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  // Ref to hold fetchDashboardStats so SignalR callbacks can call latest version without deps
  const fetchDashboardStatsRef = useRef<() => void>(() => {});
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = translations[language];

  useEffect(() => {
    setIs2FAEnabled(user?.twoFactorEnabled ?? false);
  }, [user?.twoFactorEnabled]);

  // --- SignalR Connection - Real-time Updates ---
  useEffect(() => {
    if (!isLoggedIn) return;

    const callbacks: SignalRCallbacks = {
      onAlert: (alert) => {
        setIsAlertVisible(true);
        setAlerts(prev => {
          const exists = prev.find(a => a.id === alert.id);
          if (exists) return prev.map(a => a.id === alert.id ? alert : a);
          return [alert, ...prev].slice(0, 50);
        });
        fetchDashboardStatsRef.current();
        if (alert.severity === 'Critical' || alert.severity === 'High') {
          try {
            const audio = new Audio('/alert-sound.mp3');
            audio.volume = 0.6;
            audio.play().catch(() => {});
          } catch {}
        }
      },
      onAlertStatusChanged: (alert) => {
        setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
      },
      onTicketCreated: (ticket) => {
        setTickets(prev => {
          const exists = prev.find(t => t.id === ticket.id);
          if (exists) return prev.map(t => t.id === ticket.id ? ticket : t);
          return [ticket, ...prev].slice(0, 100);
        });
        fetchDashboardStatsRef.current();
        setNotifications(prev => [{
          id: ticket.id,
          tenantId: ticket.tenantId,
          userId: user?.id || '',
          title: `Ticket: ${ticket.ticketNumber}`,
          message: ticket.title,
          type: 'Ticket' as const,
          isRead: false,
          link: `/incidents?ticket=${ticket.id}`,
          createdAt: ticket.createdAt,
        }, ...prev].slice(0, 50));
      },
      onTicketUpdated: (ticket) => {
        setTickets(prev => prev.map(t => t.id === ticket.id ? ticket : t));
        fetchDashboardStatsRef.current();
      },
      onNotification: (notification) => {
        setNotifications(prev => [notification, ...prev].slice(0, 50));
        setUnreadCount(prev => prev + 1);
      },
      onServerStatusChanged: (serverId: string, status: string, cpu?: number, ram?: number, disk?: number) => {
        const normalizedStatus = (status || 'offline').toLowerCase() as 'online' | 'offline' | 'warning';
        console.log('[SignalR] ServerStatusChanged:', serverId, status, '→', normalizedStatus, cpu, ram);
        setServers(prev => prev.map(s => {
          if (s.id !== serverId) return s;
          return {
            ...s,
            status: normalizedStatus,
            cpu: cpu ?? s.cpu,
            ram: ram ?? s.ram,
            diskUsage: disk ?? s.diskUsage,
          };
        }));
      },
    };

    const { connect, disconnect } = createSignalRConnection(callbacks);
    connect();

    return () => disconnect();
  }, [isLoggedIn]);

  // --- Auto-fetch servers list on login + poll CPU/RAM every 30s ---
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchServers = async () => {
      try {
        const res = await ServersApi.getAll(1, 50);
        if (res.success && res.data) {
          const newServers = res.data.items.map((s: any) => ({
            id: s.id,
            name: s.name,
            ip: s.ipAddress,
            status: s.status?.toLowerCase() || 'offline',
            cpu: s.cpuUsage ?? 0,
            ram: s.ramUsage ?? 0,
            lastSeen: s.lastSeenAt || '',
            os: s.os || '',
            diskUsage: s.diskUsage ?? 0,
          }));
          
          // MERGE instead of replace to avoid race condition
          setServers(prev => {
            if (prev.length === 0) {
              console.log('[SERVERS] Initial load:', newServers.length);
              return newServers; // First load
            }
            
            // Merge: update existing or add new
            const merged = [...prev];
            for (const newServer of newServers) {
              const idx = merged.findIndex(m => m.id === newServer.id);
              if (idx >= 0) {
                merged[idx] = newServer; // Update
              } else {
                merged.push(newServer); // Add new
              }
            }
            // console.log('[SERVERS] Updated:', merged.length);
            return merged;
          });
        }
      } catch (error) {
        console.error('[SERVERS] Fetch failed:', error);
      }
    };

    // Immediate fetch on login
    fetchServers();
    
    // Poll every 10s — faster CPU/RAM updates
    const pollInterval = setInterval(fetchServers, 10_000);
    return () => clearInterval(pollInterval);
  }, [isLoggedIn]);

  // --- Fetch Dashboard Stats với Parallel Fetch ---
  const fetchDashboardStats = useCallback(async () => {
    setIsLoadingDashboard(true);
    try {
      if (workerReady) {
        const token = localStorage.getItem('cm_token') || undefined;
        const result = await fetchDashboard(
          import.meta.env.VITE_API_URL || 'http://localhost:5000',
          token
        );

        if (result.data) {
          const processed = await processDashboardData(result.data);

          setDashboardData(processed);
          setTrafficData(processed.trafficData);
          setAttackTypes(processed.attackTypes);
          setMitreData(processed.mitreData || []);

          setAlerts(prev => {
            const merged = [...prev];
            for (const a of (processed.recentAlerts || [])) {
              const idx = merged.findIndex(m => m.id === a.id);
              if (idx >= 0) merged[idx] = a; else merged.unshift(a);
            }
            return merged.slice(0, 50);
          });

          setServers(prev => {
            const newServers = processed.serverHealth || [];
            if (newServers.length === 0) return prev;

            const merged = [...prev];
            for (const newServer of newServers) {
              const s = {
                id: newServer.id,
                name: newServer.name,
                ip: newServer.ipAddress || newServer.ip,
                status: newServer.status?.toLowerCase() || 'offline',
                cpu: newServer.cpuUsage ?? newServer.cpu ?? 0,
                ram: newServer.ramUsage ?? newServer.ram ?? 0,
                lastSeen: newServer.lastSeenAt || newServer.lastSeen || '',
                os: newServer.os || '',
                diskUsage: newServer.diskUsage ?? 0,
              };

              const idx = merged.findIndex(m => m.id === s.id);
              if (idx >= 0) merged[idx] = s; else merged.push(s);
            }
            return merged;
          });

          if (Object.keys(result.errors || {}).length > 0) {
            console.warn('[Dashboard] Some fetches failed:', result.errors);
          }
        }
      } else {
        const dashRes = await ReportsApi.getDashboard();
        if (dashRes.success && dashRes.data) {
          const processed = await processDashboardData(dashRes.data);

          setDashboardData(processed);
          setTrafficData(processed.trafficData);
          setAttackTypes(processed.attackTypes);
          setMitreData(processed.mitreData || []);

          setAlerts(prev => {
            const merged = [...prev];
            for (const a of (processed.recentAlerts || [])) {
              const idx = merged.findIndex(m => m.id === a.id);
              if (idx >= 0) merged[idx] = a; else merged.unshift(a);
            }
            return merged.slice(0, 50);
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [processDashboardData, fetchDashboard, workerReady]);

  // Keep ref in sync with latest fetchDashboardStats
  useEffect(() => {
    fetchDashboardStatsRef.current = fetchDashboardStats;
  }, [fetchDashboardStats]);

  // --- Fetch Blocked IPs ---
  const fetchBlockedIPs = useCallback(async () => {
    const res = await DefenseApi.getBlockedIPs(1, 50, true);
    if (res.success && res.data) {
      setBlockedIPs(res.data.items);
    }
  }, []);

  // --- Fetch Whitelists ---
  const fetchWhitelists = useCallback(async () => {
    const page = await WhitelistApi.getWhitelists(1, 200);
    if (page?.items) {
      setWhitelists(page.items);
    }
  }, []);

  // --- Fetch Tickets ---
  const fetchTickets = useCallback(async () => {
    const res = await TicketsApi.getAll(1, 30);
    if (res.success && res.data) {
      setTickets(res.data.items);
    }
  }, []);

  // --- Initial Data Fetch - PARALLEL LOADING ---
  useEffect(() => {
    if (!isLoggedIn) return;

    const fetchInitialData = async () => {
      setIsInitialLoading(true);
      setLoadingProgress(10);

      // Track loading progress for each parallel fetch
      let progress = 10;
      const updateProgress = (increment: number) => {
        progress = Math.min(progress + increment, 90);
        setLoadingProgress(progress);
      };

      try {
        // 1. Fetch dashboard + servers + alerts in PARALLEL using Worker
        if (workerReady) {
          const token = localStorage.getItem('cm_token') || undefined;
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

          // Fetch all in one worker call (parallel internally)
          const result = await fetchDashboard(apiUrl, token);
          updateProgress(50);

          if (result.data) {
            const processed = await processDashboardData(result.data);
            
            setDashboardData(processed);
            setTrafficData(processed.trafficData);
            setAttackTypes(processed.attackTypes);
            setMitreData(processed.mitreData || []);
            setAlerts(processed.recentAlerts || []);

            setServers((processed.serverHealth || result.raw?.servers || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              ip: s.ipAddress || s.ip,
              status: s.status?.toLowerCase() || 'offline',
              cpu: s.cpuUsage ?? s.cpu ?? 0,
              ram: s.ramUsage ?? s.ram ?? 0,
              lastSeen: s.lastSeenAt || s.lastSeen || '',
              os: s.os || '',
              diskUsage: s.diskUsage ?? 0,
            })));
            
            console.log('[INIT] Loaded servers from worker:', (processed.serverHealth || result.raw?.servers || []).length);
          }

          // Blocked IPs
          if (result.raw?.blockedIPs) {
            setBlockedIPs(result.raw.blockedIPs);
          }
          updateProgress(20);
        } else {
          // Fallback: sequential fetch
          const [dashRes, serversRes, alertsRes, blockedRes] = await Promise.all([
            ReportsApi.getDashboard(),
            ServersApi.getAll(1, 50),
            AlertsApi.getAll(1, 20),
            DefenseApi.getBlockedIPs(1, 20, true),
          ]);
          updateProgress(50);

          if (dashRes.success && dashRes.data) {
            const processed = await processDashboardData(dashRes.data);
            setDashboardData(processed);
            setTrafficData(processed.trafficData);
            setAttackTypes(processed.attackTypes);
            setMitreData(processed.mitreData || []);
          }

          if (serversRes.success && serversRes.data) {
            setServers(serversRes.data.items.map((s: any) => ({
              id: s.id,
              name: s.name,
              ip: s.ipAddress,
              status: s.status?.toLowerCase() || 'offline',
              cpu: s.cpuUsage ?? 0,
              ram: s.ramUsage ?? 0,
              lastSeen: s.lastSeenAt || '',
              os: s.os || '',
              diskUsage: s.diskUsage ?? 0,
            })));
          }

          if (alertsRes.success && alertsRes.data) {
            setAlerts(alertsRes.data.items);
          }

          if (blockedRes.success && blockedRes.data) {
            setBlockedIPs(blockedRes.data.items);
          }

          // Whitelists
          WhitelistApi.getWhitelists(1, 200).then((wlPage) => {
            if (wlPage?.items) {
              setWhitelists(wlPage.items);
            }
          });
          updateProgress(20);
        }

        TicketsApi.getAll(1, 30).then(ticketRes => {
          if (ticketRes.success && ticketRes.data) {
            setTickets(ticketRes.data.items);
          }
        });
        updateProgress(10);

        NotificationsApi.getNotifications(1, 20).then(notifRes => {
          if (notifRes) {
            setNotifications(notifRes.items.map((n: any) => ({
              id: n.id,
              title: n.title,
              message: n.message,
              createdAt: n.createdAt,
              isRead: n.isRead,
              type: n.type,
              link: n.link,
              tenantId: n.tenantId,
              userId: n.userId,
            })));
            setUnreadCount(notifRes.items.filter((n: any) => !n.isRead).length);
          }
        });

        updateProgress(10);
      } catch (error) {
        console.error('Initial data fetch error:', error);
      } finally {
        setIsInitialLoading(false);
        setLoadingProgress(100);
      }
    };

    fetchInitialData();

    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchDashboardStats, fetchDashboard, processDashboardData, workerReady]);

  // --- Polling Blocked IPs (every 5s for real-time Defense) ---
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchBlockedIPs();
    const interval = setInterval(fetchBlockedIPs, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchBlockedIPs]);

  // --- Polling Tickets (every 10s) ---
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchTickets();
    const interval = setInterval(fetchTickets, 10000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchTickets]);

  // --- Handlers ---
  const handleLogin = useCallback(async (email: string, password: string, twoFactorCode?: string): Promise<{ success: boolean; message: string; requiresTwoFactor?: boolean }> => {
    const res = await AuthApi.login(email, password, twoFactorCode);

    // 1) Backend yêu cầu 2FA → chỉ set pending2FA, KHÔNG setIsLoggedIn
    const data = (res as any).data;
    if (res.success && data?.requiresTwoFactor) {
      setPending2FA({ email, password, tempToken: data.tempToken });
      return { success: false, message: res.message || 'Vui lòng nhập mã 2FA.', requiresTwoFactor: true };
    }

    // 2) Đăng nhập thành công (không có 2FA)
    if (res.success && res.data && res.data.token) {
      setUser(res.data.user);
      setIsLoggedIn(true);
      setPending2FA(null);
      return { success: true, message: 'Đăng nhập thành công!' };
    }

    // 3) Lỗi đăng nhập
    return { success: false, message: res.message || 'Đăng nhập thất bại' };
  }, []);

  const handleLoginWith2FA = useCallback(async (code: string): Promise<{ success: boolean; message: string }> => {
    if (!pending2FA) return { success: false, message: 'Không có phiên đăng nhập 2FA.' };

    // AuthApi.loginWith2FA đã setToken + setStoredUser bên trong rồi
    // → chỉ cần sync React state + đóng 2FA flow
    // Quan trọng: clear pending2FA TRƯỚC setIsLoggedIn để AuthForm không hiển thị màn hình OTP che dashboard
    const res = await AuthApi.loginWith2FA(code, pending2FA.tempToken);
    if (res.success && res.data) {
      // Token + user đã được lưu bởi AuthApi.loginWith2FA
      setPending2FA(null);
      setUser(res.data.user);
      setIsLoggedIn(true);
      return { success: true, message: 'Đăng nhập thành công!' };
    }
    return { success: false, message: res.message || 'Mã 2FA không đúng.' };
  }, [pending2FA]);

  const handleRegister = useCallback(async (companyName: string, email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const res = await AuthApi.register(companyName, email, password);
    if (res.success && res.data) {
      setUser(res.data.user);
      setIsLoggedIn(true);
      return { success: true, message: 'Đăng ký thành công! Workspace đã được tạo.' };
    }
    return { success: false, message: res.message || 'Đăng ký thất bại' };
  }, []);

  const syncUserProfileFromServer = useCallback(async () => {
    const res = await AuthApi.getMe();
    if (res.success && res.data) {
      setUser(res.data as User);
      setStoredUser(res.data as User);
      setIs2FAEnabled(!!res.data.twoFactorEnabled);
    }
  }, []);

  const handleLogout = useCallback(() => {
    AuthApi.logout();
    setIsLoggedIn(false);
    setUser(null);
    setShowAuth(false);
    setActiveTab('dashboard');
    setDashboardData(null);
    setServers([]);
    setAlerts([]);
    setPricingPlans([]);
  }, []);

  const logoutOnExpireRef = useRef<() => void>(() => {});
  useEffect(() => {
    logoutOnExpireRef.current = handleLogout;
  }, [handleLogout]);

  useEffect(() => {
    const onExpired = () => {
      console.warn('[Auth] Token expired (401), auto-logging out');
      logoutOnExpireRef.current();
    };
    window.addEventListener('cm:auth:expired', onExpired);
    return () => window.removeEventListener('cm:auth:expired', onExpired);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!(user?.sessionTimeoutEnabled ?? false)) {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
      return;
    }

    const timeoutMinutes = user?.sessionTimeoutMinutes ?? 30;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    const resetTimer = () => {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
      sessionTimeoutRef.current = setTimeout(() => {
        alert(`Phiên làm việc đã hết hạn sau ${timeoutMinutes} phút không hoạt động.`);
        handleLogout();
      }, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    resetTimer();

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
    };
  }, [isLoggedIn, user?.sessionTimeoutEnabled, user?.sessionTimeoutMinutes, handleLogout]);

  const handleExport = useCallback(async (startDate?: string, endDate?: string) => {
    const token = localStorage.getItem('cm_token');
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const url = `${apiUrl}/api/reports/export-excel?${params}`;

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `VeriChainIDS_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      } else {
        alert('Không thể tải báo cáo. Vui lòng thử lại.');
      }
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Please try again.');
    }
  }, []);

  const generateApiKey = useCallback(async (serverId: string) => {
    const res = await ServersApi.regenerateKey(serverId);
    if (res.success && res.data) {
      setApiKeys(prev => [...prev, {
        id: res.data!.id,
        name: res.data!.name,
        key: res.data!.plainApiKey,
        created: res.data!.createdAt,
        plainApiKey: res.data!.plainApiKey,
      }]);
      return res.data.plainApiKey;
    }
    return null;
  }, []);

  const deleteApiKey = useCallback((id: string) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
  }, []);

  const refreshServersList = useCallback(async () => {
    const serversRes = await ServersApi.getAll(1, 50);
    if (serversRes.success && serversRes.data) {
      setServers(serversRes.data.items.map((s: any) => ({
        id: s.id,
        name: s.name,
        ip: s.ipAddress,
        status: s.status?.toLowerCase() || 'offline',
        cpu: s.cpuUsage || 0,
        ram: s.ramUsage || 0,
        lastSeen: s.lastSeenAt || '',
        os: s.os || '',
        diskUsage: s.diskUsage || 0,
      })));
    }
  }, []);

  const handleAddServer = useCallback(
    async (
      name: string,
      ip: string
    ): Promise<{ success: boolean; plainApiKey?: string; serverName?: string; serverId?: string; message?: string }> => {
      const res = await ServersApi.add(name, ip, user?.tenantId ?? undefined, user?.id || '');
      if (res.success && res.data?.plainApiKey) {
        await refreshServersList();
        return {
          success: true,
          plainApiKey: res.data.plainApiKey,
          serverName: name,
          serverId: res.data.id,
        };
      }
      if (res.success) {
        await refreshServersList();
        return { success: true };
      }
      return { success: false, message: res.message || 'Thêm server thất bại.' };
    },
    [user, refreshServersList]
  );

  const handleDeleteServer = useCallback(
    async (id: string) => {
      const res = await ServersApi.delete(id);
      if (res.success) await refreshServersList();
      else alert(res.message || 'Xóa máy chủ thất bại.');
    },
    [refreshServersList]
  );

  // ── Blocked IPs Handlers ──────────────────────────────
  const handleUnblockIP = useCallback(
    async (ip: string): Promise<boolean> => {
      const res = await DefenseApi.unblockIP(ip);
      if (res.success) {
        setBlockedIPs(prev => prev.filter(b => b.ipAddress !== ip));
        return true;
      }
      alert(res.message || 'Unblock thất bại.');
      return false;
    },
    []
  );

  const handleManualBlock = useCallback(
    async (ip: string, reason?: string, severity = 'Medium', durationMinutes?: number, serverId?: string | null): Promise<boolean> => {
      const res = await DefenseApi.manualBlock({ ip, reason, severity, durationMinutes, serverId });
      if (res.success) {
        await fetchBlockedIPs();
        return true;
      }
      alert(res.message || 'Block thất bại.');
      return false;
    },
    [fetchBlockedIPs]
  );

  // --- Whitelist Handlers ---
  const handleAddWhitelist = useCallback(
    async (ipAddress: string, description?: string, serverId?: string | null): Promise<boolean> => {
      const res = await WhitelistApi.addWhitelist(ipAddress, description, serverId);
      if (res.success) {
        await fetchWhitelists();
        return true;
      }
      alert(res.message || 'Thêm Whitelist thất bại.');
      return false;
    },
    [fetchWhitelists]
  );

  const handleRemoveWhitelist = useCallback(
    async (id: string, ip: string): Promise<boolean> => {
      const res = await WhitelistApi.removeWhitelist(id);
      if (res.success) {
        setWhitelists(prev => prev.filter(w => w.id !== id));
        return true;
      }
      alert(res.message || 'Xóa Whitelist thất bại.');
      return false;
    },
    []
  );

  const handleViewServerKey = useCallback(async (serverId: string, serverName: string) => {
    try {
      const res = await ServersApi.getServerKey(serverId);
      if (res.success && res.data) {
        const d = res.data;
        setServerKeyToView({
          serverId: d.serverId || serverId,
          serverName: d.serverName || serverName,
          plainApiKey: d.plainApiKey ?? null,
          keyPrefix: d.keyPrefix,
        });
      } else {
        alert(res.message || 'Không lấy được thông tin key. Có thể chưa có key active.');
      }
    } catch {
      alert('Lỗi kết nối khi lấy API Key.');
    }
  }, []);

  const handleManageEmails = useCallback((serverId: string, serverName: string) => {
    setServerEmailModal({ serverId, serverName });
  }, []);

  const handleManageTelegram = useCallback((serverId: string, serverName: string) => {
    setServerTelegramModal({ serverId, serverName });
  }, []);

  const handleRegenerateServerKey = useCallback(
    async (serverId: string) => {
      const res = await ServersApi.regenerateKey(serverId);
      if (res.success && res.data?.plainApiKey) {
        setServerKeyToView((prev) =>
          prev && prev.serverId === serverId
            ? { ...prev, plainApiKey: res.data!.plainApiKey }
            : {
                serverId,
                serverName: res.data!.name || 'Server',
                plainApiKey: res.data!.plainApiKey,
              }
        );
        await refreshServersList();
        return true;
      }
      alert(res.message || 'Tái tạo API Key thất bại.');
      return false;
    },
    [refreshServersList]
  );

  // --- Rendering ---

  if (demoResult !== null || window.location.pathname === '/payment-result') {
    return (
      <PaymentResultPage
        theme={theme}
        demoResult={demoResult ?? undefined}
        onGoToDashboard={() => {
          window.history.pushState({}, '', '/');
          setDemoResult(null);
          setSubscriptionRefreshKey(k => k + 1); // force refresh history
          setActiveTab('my-subscription');
        }}
        onRetry={() => {
          window.history.pushState({}, '', '/');
          setDemoResult(null);
          setCheckoutPlan(null);
          setActiveTab('billing');
        }}
      />
    );
  }

  if (!isLoggedIn) {
    if (showAuth) {
      return (
        <AuthForm
          theme={theme}
          language={language}
          setLanguage={setLanguage}
          setShowAuth={setShowAuth}
          authMode={authMode}
        setAuthMode={setAuthMode}
        handleLogin={handleLogin}
        handleRegister={handleRegister}
        pending2FA={pending2FA}
        setPending2FA={setPending2FA}
        handleLoginWith2FA={handleLoginWith2FA}
        t={t}
        />
      );
    }

    return (
      <LandingPage
        theme={theme}
        language={language}
        setLanguage={setLanguage}
        setShowAuth={setShowAuth}
        setAuthMode={setAuthMode}
        t={t}
        plans={pricingPlans}
      />
    );
  }

  return (
    <div className={cn("min-h-screen transition-colors duration-300", theme === 'dark' ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-800", "font-sans selection:bg-blue-500/30")}>
      <Modals
        theme={theme}
        t={t}
        showAddServerModal={showAddServerModal}
        setShowAddServerModal={setShowAddServerModal}
        show2FAModal={show2FAModal}
        setShow2FAModal={setShow2FAModal}
        showAPIKeyModal={showAPIKeyModal}
        setShowAPIKeyModal={setShowAPIKeyModal}
        apiKeys={apiKeys}
        generateApiKey={generateApiKey}
        deleteApiKey={deleteApiKey}
        is2FAEnabled={is2FAEnabled}
        setIs2FAEnabled={setIs2FAEnabled}
        onTwoFAProfileSynced={syncUserProfileFromServer}
        selectedDetail={selectedDetail}
        setSelectedDetail={setSelectedDetail}
        onAddServer={handleAddServer}
        onRegenerateServerKey={handleRegenerateServerKey}
        serverKeyToView={serverKeyToView}
        setServerKeyToView={setServerKeyToView}
      />

      {/* Server Alert Emails Modal */}
      {serverEmailModal && (
        <ServerAlertEmailsModal
          serverId={serverEmailModal.serverId}
          serverName={serverEmailModal.serverName}
          onClose={() => setServerEmailModal(null)}
        />
      )}

      {serverTelegramModal && (
        <ServerTelegramRecipientsModal
          serverId={serverTelegramModal.serverId}
          serverName={serverTelegramModal.serverName}
          onClose={() => setServerTelegramModal(null)}
        />
      )}

      <div className="flex h-screen overflow-hidden">
        <Sidebar
          theme={theme}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          handleLogout={handleLogout}
          user={user}
          t={t}
        />

        <main className="flex-1 min-w-0 overflow-y-auto transition-all duration-300">
          <Header
            theme={theme}
            setTheme={setTheme}
            language={language}
            setLanguage={setLanguage}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
            notifications={notifications}
            setNotifications={setNotifications}
            unreadCount={unreadCount}
            setUnreadCount={setUnreadCount}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            searchPlaceholder={t.searchPlaceholder}
            t={t}
          />

          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && (
                  <Dashboard
                    theme={theme}
                    t={t}
                    isAlertVisible={isAlertVisible}
                    setIsAlertVisible={setIsAlertVisible}
                    trafficData={trafficData}
                    attackTypes={attackTypes}
                    recentAlerts={alerts}
                    agents={servers}
                    dashboardData={dashboardData}
                    setSelectedDetail={setSelectedDetail}
                    setShowAddServerModal={setShowAddServerModal}
                    setActiveTab={setActiveTab}
                    isLoading={isLoadingDashboard}
                  />
                )}

                {activeTab === 'agents' && (
                  <Agents
                    theme={theme}
                    t={t}
                    agents={servers}
                    setShowAddServerModal={setShowAddServerModal}
                    canManageServers={user?.role === 'SuperAdmin' || user?.role === 'Admin'}
                    onDeleteServer={handleDeleteServer}
                    onViewServerKey={handleViewServerKey}
                    onManageEmails={handleManageEmails}
                    onManageTelegram={handleManageTelegram}
                  />
                )}

                {activeTab === 'incidents' && (
                  <div className="space-y-4">
                    {/* Server Selector - Always show */}
                    <div className={cn(
                      "flex items-center justify-between p-4 rounded-lg border",
                      theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          theme === 'dark' ? 'bg-blue-600/20' : 'bg-blue-100'
                        )}>
                          <Server size={20} className="text-blue-500" />
                        </div>
                        <div>
                          <h3 className={cn("text-sm font-semibold", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                            Lọc theo máy chủ
                          </h3>
                          <p className={cn("text-xs mt-0.5", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                            {servers.length === 0 ? 'Chưa có máy chủ nào' :
                             servers.length === 1 ? `1 máy chủ: ${servers[0]?.name}` :
                             `${servers.length} máy chủ - Chọn để xem riêng`}
                          </p>
                        </div>
                      </div>
                      {servers.length > 0 && (
                        <ServerSelector
                          theme={theme}
                          servers={servers}
                          selectedServerId={selectedServerId}
                          onSelectServer={setSelectedServerId}
                          showAllOption={servers.length > 1}
                        />
                      )}
                    </div>
                    
                    {/* Filter indicator */}
                    {selectedServerId && (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        theme === 'dark' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200'
                      )}>
                        <Filter size={14} />
                        <span>Đang lọc: <strong>{servers.find(s => s.id === selectedServerId)?.name}</strong></span>
                        <span className={cn(
                          "ml-2 px-2 py-0.5 rounded text-xs font-bold",
                          theme === 'dark' ? 'bg-blue-600/20' : 'bg-blue-100'
                        )}>
                          {alerts.filter(alert => {
                            const server = servers.find(s => s.id === selectedServerId);
                            return !server || alert.serverName === server.name;
                          }).length} / {alerts.length} alerts
                        </span>
                        <button
                          onClick={() => setSelectedServerId(null)}
                          className={cn(
                            "ml-auto p-1 rounded hover:bg-blue-600/20 transition-colors",
                            theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                          )}
                          title="Xóa bộ lọc"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    
                    <Incidents
                      theme={theme}
                      t={t}
                      recentAlerts={selectedServerId 
                        ? alerts.filter(alert => {
                            // Filter alerts by selected server
                            const server = servers.find(s => s.id === selectedServerId);
                            return !server || alert.serverName === server.name;
                          })
                        : alerts
                      }
                      setSelectedDetail={setSelectedDetail}
                    />
                  </div>
                )}

                {activeTab === 'ai' && (
                  <AIEngine theme={theme} t={t} mitreData={mitreData} dashboardData={dashboardData} />
                )}

                {activeTab === 'defense' && (
                  <div className="space-y-4">
                    {/* Server Selector */}
                    <div className={cn(
                      "flex items-center justify-between p-4 rounded-lg border",
                      theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          theme === 'dark' ? 'bg-red-600/20' : 'bg-red-100'
                        )}>
                          <Server size={20} className="text-red-500" />
                        </div>
                        <div>
                          <h3 className={cn("text-sm font-semibold", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                            Lọc theo máy chủ
                          </h3>
                          <p className={cn("text-xs mt-0.5", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                            {servers.length === 0 ? 'Chưa có máy chủ nào' :
                             servers.length === 1 ? `1 máy chủ: ${servers[0]?.name}` :
                             `${servers.length} máy chủ - Chọn để xem IP bị chặn riêng`}
                          </p>
                        </div>
                      </div>
                      {servers.length > 0 && (
                        <ServerSelector
                          theme={theme}
                          servers={servers}
                          selectedServerId={selectedServerId}
                          onSelectServer={setSelectedServerId}
                          showAllOption={true}
                        />
                      )}
                    </div>
                    
                    {/* Filter indicator */}
                    {selectedServerId && (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        theme === 'dark' ? 'bg-red-600/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200'
                      )}>
                        <Filter size={14} />
                        <span>Đang lọc: <strong>{servers.find(s => s.id === selectedServerId)?.name}</strong></span>
                        <span className={cn(
                          "ml-2 px-2 py-0.5 rounded text-xs font-bold",
                          theme === 'dark' ? 'bg-red-600/20' : 'bg-red-100'
                        )}>
                          {blockedIPs.filter(ip => {
                            const server = servers.find(s => s.id === selectedServerId);
                            if (!server) return true;
                            // Chỉ hiển thị IPs của server này (không bao gồm tenant-wide)
                            return ip.serverId === server.id;
                          }).length} / {blockedIPs.length} IPs
                        </span>
                        <button
                          onClick={() => setSelectedServerId(null)}
                          className={cn(
                            "ml-auto p-1 rounded hover:bg-red-600/20 transition-colors",
                            theme === 'dark' ? 'text-red-400' : 'text-red-600'
                          )}
                          title="Xem tất cả"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    
                    {/* Info note */}
                    {!selectedServerId && servers.length > 1 && (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                        theme === 'dark' ? 'bg-slate-800/50 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      )}>
                        <span>💡 Hiển thị tất cả IPs bị chặn trên {servers.length} servers</span>
                      </div>
                    )}
                    
                    <Defense
                      theme={theme}
                      t={t}
                      blockedIPs={selectedServerId 
                        ? blockedIPs.filter(ip => {
                            const server = servers.find(s => s.id === selectedServerId);
                            if (!server) return true;
                            // Chỉ hiển thị IPs bị chặn trên server này
                            // Không bao gồm tenant-wide blocks (serverId = null)
                            return ip.serverId === server.id;
                          })
                        : blockedIPs
                      }
                      onRefresh={fetchBlockedIPs}
                      onUnblock={handleUnblockIP}
                      onManualBlock={handleManualBlock}
                      onCheckIP={async (ip) => {
                        const res = await DefenseApi.checkIP(ip);
                        return res.data || null;
                      }}
                      userRole={user?.role}
                      selectedServerId={selectedServerId}
                      servers={servers}
                    />
                  </div>
                )}

                {activeTab === 'blockchain' && (
                  <BlockchainVerify theme={theme} />
                )}

                {activeTab === 'whitelist' && (
                  <div className="space-y-4">
                    {/* Server Selector */}
                    <div className={cn(
                      "flex items-center justify-between p-4 rounded-lg border",
                      theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          theme === 'dark' ? 'bg-emerald-600/20' : 'bg-emerald-100'
                        )}>
                          <Server size={20} className="text-emerald-500" />
                        </div>
                        <div>
                          <h3 className={cn("text-sm font-semibold", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                            Lọc theo máy chủ
                          </h3>
                          <p className={cn("text-xs mt-0.5", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                            {servers.length === 0 ? 'Chưa có máy chủ nào' :
                             servers.length === 1 ? `1 máy chủ: ${servers[0]?.name}` :
                             `${servers.length} máy chủ - Chọn để xem whitelist riêng`}
                          </p>
                        </div>
                      </div>
                      {servers.length > 0 && (
                        <ServerSelector
                          theme={theme}
                          servers={servers}
                          selectedServerId={selectedServerId}
                          onSelectServer={setSelectedServerId}
                          showAllOption={true}
                        />
                      )}
                    </div>

                    {/* Filter indicator */}
                    {selectedServerId && (
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        theme === 'dark' ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      )}>
                        <Filter size={14} />
                        <span>Đang lọc: <strong>{servers.find(s => s.id === selectedServerId)?.name}</strong></span>
                        <button
                          onClick={() => setSelectedServerId(null)}
                          className={cn(
                            "ml-auto p-1 rounded hover:bg-emerald-600/20 transition-colors",
                            theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                          )}
                          title="Xóa bộ lọc"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    <Whitelist
                      theme={theme}
                      t={t}
                      whitelists={whitelists}
                      onRefresh={fetchWhitelists}
                      onAdd={handleAddWhitelist}
                      onRemove={handleRemoveWhitelist}
                      servers={servers}
                      selectedServerId={selectedServerId}
                      userRole={user?.role}
                    />
                  </div>
                )}

                {activeTab === 'reports' && (
                  <Reports
                    theme={theme}
                    t={t}
                    handleExport={handleExport}
                  />
                )}

                {activeTab === 'billing' && !checkoutPlan && (
                  <Billing
                    theme={theme}
                    t={t}
                    plans={pricingPlans}
                    setPlans={setPricingPlans}
                    onSelectPlan={(plan) => setCheckoutPlan(plan)}
                  />
                )}

                {activeTab === 'billing' && checkoutPlan && (
                  <CheckoutPage
                    theme={theme}
                    plan={checkoutPlan}
                    onBack={() => setCheckoutPlan(null)}
                    onPaymentSuccess={(orderId, planName, amount) => {
                      setDemoResult({ orderId, planName, amount });
                      setCheckoutPlan(null);
                    }}
                  />
                )}

                {activeTab === 'my-subscription' && (
                  <MySubscription
                    theme={theme}
                    onUpgrade={() => { setCheckoutPlan(null); setActiveTab('billing'); }}
                    refreshKey={subscriptionRefreshKey}
                  />
                )}

                {activeTab === 'contact' && (
                  <ContactPage theme={theme} userRole={user?.role} />
                )}

                {activeTab === 'apiGuide' && (
                  <AgentSetupGuide theme={theme} t={t} />
                )}

                {activeTab === 'tickets' && (
                  <TicketManagement theme={theme} userRole={user?.role} />
                )}

                {activeTab === 'notifications' && (
                  <NotificationCenter theme={theme} />
                )}

                {activeTab === 'settings' && (
                  <Settings
                    theme={theme}
                    setTheme={setTheme}
                    language={language}
                    setLanguage={setLanguage}
                    t={t}
                    is2FAEnabled={is2FAEnabled}
                    setIs2FAEnabled={setIs2FAEnabled}
                    setShow2FAModal={setShow2FAModal}
                    user={user}
                    setUser={setUser}
                    setActiveTab={setActiveTab}
                    serverCount={servers.length}
                    setShowAddServerModal={setShowAddServerModal}
                  />
                )}

                {activeTab === 'account' && (
                  <Account
                    theme={theme}
                    t={t}
                    show2FAModal={show2FAModal}
                    setShow2FAModal={setShow2FAModal}
                    is2FAEnabled={is2FAEnabled}
                    setIs2FAEnabled={setIs2FAEnabled}
                    user={user}
                    onUserUpdate={setUser}
                  />
                )}

                {activeTab === 'userManagement' && (
                  <UserManagement
                    theme={theme}
                    t={t}
                    userRole={user?.role}
                  />
                )}

                {activeTab === 'pricingManagement' && (
                  <PricingManagement
                    theme={theme}
                    t={t}
                    plans={pricingPlans}
                    setPlans={setPricingPlans}
                  />
                )}

                {activeTab === 'apiManagement' && (
                  <ApiManagement
                    theme={theme}
                    t={t}
                    guide={apiGuide}
                    setGuide={setApiGuide}
                  />
                )}

                {activeTab === 'systemLogs' && (
                  <SystemLogs theme={theme} t={t} />
                )}

                {activeTab === 'serverSettings' && (
                  <ServerSettings theme={theme} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
