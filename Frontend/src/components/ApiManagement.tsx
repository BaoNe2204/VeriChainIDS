import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Key, Copy, Eye, EyeOff, RefreshCw, ExternalLink, Shield, Clock, Server, AlertCircle, CheckCircle, Terminal, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { ServersApi } from '../services/api';
import { formatDateOnlyVi } from '../utils/dateUtils';

interface ApiManagementProps {
  theme: Theme;
  t: any;
  guide: any;
  setGuide: (guide: any) => void;
}

export const ApiManagement = ({ theme, t, guide, setGuide }: ApiManagementProps) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'servers' | 'docs' | 'guide'>('overview');
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    setLoading(true);
    const res = await ServersApi.getAll(1, 50);
    if (res.success && res.data) {
      setServers(res.data.items);
    }
    setLoading(false);
  };

  const toggleKeyVisibility = (serverId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
      } else {
        newSet.add(serverId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, keyId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRegenerateKey = async (serverId: string) => {
    setRefreshingId(serverId);
    const res = await ServersApi.regenerateKey(serverId);
    if (res.success) {
      await fetchServers();
      setRevealedKeys(prev => ({ ...prev, [serverId]: res.data?.plainApiKey || '' }));
    }
    setRefreshingId(null);
  };

  const handleRevealKey = async (serverId: string) => {
    if (revealedKeys[serverId]) {
      setRevealedKeys(prev => {
        const newKeys = { ...prev };
        delete newKeys[serverId];
        return newKeys;
      });
      return;
    }
    const res = await ServersApi.revealKey(serverId);
    if (res.success) {
      // KEY_CHUA_MA_HOA = key cũ chưa mã hóa, không thể khôi phục
      if (res.message === 'KEY_CHUA_MA_HOA') {
        alert('API Key này chưa được mã hóa. Vui lòng nhấn nút Regenerate (mũi tên xoay) để tạo key mới.');
        return;
      }
      if (res.data?.plainApiKey) {
        setRevealedKeys(prev => ({ ...prev, [serverId]: res.data!.plainApiKey }));
      }
    }
  };

  const handleSaveGuide = async () => {
    // Save guide locally for now
    localStorage.setItem('cm_api_guide', JSON.stringify(guide));
    alert('Đã lưu hướng dẫn API!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className={cn("text-2xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Quản lý API
          </h2>
          <p className="text-slate-400">Quản lý API Keys, xem tài liệu và hướng dẫn tích hợp</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={cn(
        "flex gap-1 p-1 rounded-xl",
        theme === 'dark' ? "bg-slate-900/50" : "bg-white border border-slate-200"
      )}>
        {[
          { id: 'overview', label: 'Tổng quan', icon: Key },
          { id: 'servers', label: 'API Keys', icon: Server },
          { id: 'docs', label: 'Tài liệu API', icon: BookOpen },
          { id: 'guide', label: 'Hướng dẫn', icon: Terminal },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all",
              activeSection === tab.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-800"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === 'overview' && (
        <OverviewSection theme={theme} />
      )}

      {activeSection === 'servers' && (
        <ServersApiKeysSection
          theme={theme}
          servers={servers}
          loading={loading}
          visibleKeys={visibleKeys}
          revealedKeys={revealedKeys}
          copiedKey={copiedKey}
          refreshingId={refreshingId}
          onRefresh={fetchServers}
          onToggleVisibility={toggleKeyVisibility}
          onCopy={copyToClipboard}
          onRegenerate={handleRegenerateKey}
          onReveal={handleRevealKey}
        />
      )}

      {activeSection === 'docs' && (
        <ApiDocsSection theme={theme} />
      )}

      {activeSection === 'guide' && (
        <GuideSection
          theme={theme}
          guide={guide}
          setGuide={setGuide}
          onSave={handleSaveGuide}
        />
      )}
    </div>
  );
};

// Overview Section
const OverviewSection = ({ theme }: { theme: Theme }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {/* Authentication */}
    <div className={cn(
      "p-6 rounded-2xl border",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "p-3 rounded-xl",
          theme === 'dark' ? "bg-blue-600/20" : "bg-blue-100"
        )}>
          <Shield size={24} className="text-blue-500" />
        </div>
        <div>
          <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Authentication</h3>
          <p className="text-xs text-slate-400">Bearer Token JWT</p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <code className={cn(
          "block p-3 rounded-lg text-xs font-mono",
          theme === 'dark' ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"
        )}>
          Authorization: Bearer {'{token}'}
        </code>
      </div>
    </div>

    {/* Rate Limits */}
    <div className={cn(
      "p-6 rounded-2xl border",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "p-3 rounded-xl",
          theme === 'dark' ? "bg-amber-600/20" : "bg-amber-100"
        )}>
          <Clock size={24} className="text-amber-500" />
        </div>
        <div>
          <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Rate Limits</h3>
          <p className="text-xs text-slate-400">Giới hạn request</p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Ingest Logs</span>
          <span className="font-bold text-blue-400">5,000 req/phút</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Block IP</span>
          <span className="font-bold text-amber-400">10 req/phút</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">API Reads</span>
          <span className="font-bold text-green-400">1,000 req/phút</span>
        </div>
      </div>
    </div>

    {/* Quick Stats */}
    <div className={cn(
      "p-6 rounded-2xl border",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "p-3 rounded-xl",
          theme === 'dark' ? "bg-green-600/20" : "bg-green-100"
        )}>
          <CheckCircle size={24} className="text-green-500" />
        </div>
        <div>
          <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Base URL</h3>
          <p className="text-xs text-slate-400">Development</p>
        </div>
      </div>
      <code className={cn(
        "block p-3 rounded-lg text-xs font-mono",
        theme === 'dark' ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700"
      )}>
        http://localhost:5000/api
      </code>
    </div>

    {/* Endpoints Overview */}
    <div className={cn(
      "p-6 rounded-2xl border md:col-span-2",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <h3 className={cn("font-bold mb-4", theme === 'dark' ? "text-white" : "text-slate-900")}>
        Quick Reference
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { method: 'POST', path: '/logs/ingest', desc: 'Gửi logs' },
          { method: 'POST', path: '/alerts/trigger', desc: 'Trigger alert' },
          { method: 'POST', path: '/defense/block-ip', desc: 'Block IP' },
          { method: 'GET', path: '/defense/firewall-rules', desc: 'Lấy rules' },
        ].map((ep, i) => (
          <div key={i} className={cn(
            "p-3 rounded-xl",
            theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-black",
                ep.method === 'POST'
                  ? "bg-green-600/20 text-green-400"
                  : "bg-blue-600/20 text-blue-400"
              )}>
                {ep.method}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-300">{ep.path}</p>
            <p className="text-[10px] text-slate-500 mt-1">{ep.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Servers API Keys Section
const ServersApiKeysSection = ({
  theme,
  servers,
  loading,
  visibleKeys,
  revealedKeys,
  copiedKey,
  refreshingId,
  onRefresh,
  onToggleVisibility,
  onCopy,
  onRegenerate,
  onReveal,
}: {
  theme: Theme;
  servers: any[];
  loading: boolean;
  visibleKeys: Set<string>;
  revealedKeys: Record<string, string>;
  copiedKey: string | null;
  refreshingId: string | null;
  onRefresh: () => void;
  onToggleVisibility: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  onRegenerate: (id: string) => void;
  onReveal: (id: string) => void;
}) => (
  <div className={cn(
    "rounded-2xl border overflow-hidden",
    theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
  )}>
    <div className="flex justify-between items-center p-4 border-b border-slate-800">
      <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
        API Keys theo Server
      </h3>
      <button
        onClick={onRefresh}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
          theme === 'dark'
            ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
        )}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        Làm mới
      </button>
    </div>

    <div className="divide-y divide-slate-800">
      {loading ? (
        <div className="p-8 text-center text-slate-400">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
          Đang tải...
        </div>
      ) : servers.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <Server size={24} className="mx-auto mb-2 opacity-50" />
          Chưa có server nào. Thêm server để nhận API Key.
        </div>
      ) : (
        servers.map(server => {
          const apiKey = server.apiKeys?.find((k: any) => k.isActive);
          const serverKeyId = `${server.id}-${apiKey?.id || 'none'}`;

          return (
            <div key={server.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    server.status === 'Online'
                      ? "bg-green-600/20"
                      : server.status === 'Warning'
                        ? "bg-amber-600/20"
                        : "bg-slate-700/50"
                  )}>
                    <Server
                      size={18}
                      className={
                        server.status === 'Online'
                          ? "text-green-400"
                          : server.status === 'Warning'
                            ? "text-amber-400"
                            : "text-slate-500"
                      }
                    />
                  </div>
                  <div>
                    <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {server.name}
                    </h4>
                    <p className="text-xs text-slate-400">{server.ipAddress}</p>
                  </div>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold",
                  server.status === 'Online'
                    ? "bg-green-600/20 text-green-400"
                    : server.status === 'Warning'
                      ? "bg-amber-600/20 text-amber-400"
                      : "bg-slate-700/50 text-slate-400"
                )}>
                  {server.status}
                </span>
              </div>

              {apiKey ? (
                <div className={cn(
                  "p-4 rounded-xl",
                  theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">API Key</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onReveal(server.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1",
                          revealedKeys[server.id]
                            ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                            : theme === 'dark'
                              ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        )}
                      >
                        <Key size={12} />
                        {revealedKeys[server.id] ? "Ẩn Key" : "Hiện Key"}
                      </button>
                      {revealedKeys[server.id] && (
                        <button
                          onClick={() => onCopy(revealedKeys[server.id], `full-${server.id}`)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-200"
                          )}
                        >
                          <Copy size={14} className={copiedKey === `full-${server.id}` ? "text-green-400" : "text-slate-400"} />
                        </button>
                      )}
                      <button
                        onClick={() => onRegenerate(server.id)}
                        disabled={refreshingId === server.id}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-200"
                        )}
                      >
                        <RefreshCw
                          size={14}
                          className={refreshingId === server.id ? "animate-spin text-blue-400" : "text-slate-400"}
                        />
                      </button>
                    </div>
                  </div>
                  <code className={cn(
                    "block text-sm font-mono break-all",
                    theme === 'dark' ? "text-slate-300" : "text-slate-700"
                  )}>
                    {revealedKeys[server.id] ? (
                      <span className="text-blue-400">{revealedKeys[server.id]}</span>
                    ) : (
                      <span className="text-slate-500 italic">Nhấn "Hiện Key" để xem API Key đầy đủ</span>
                    )}
                  </code>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span>Prefix: <code className="font-mono text-slate-400">{apiKey.keyPrefix || 'N/A'}</code></span>
                    <span>Created: {formatDateOnlyVi(apiKey.createdAt)}</span>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "p-4 rounded-xl text-center text-sm text-slate-400",
                  theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50"
                )}>
                  Chưa có API Key active
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  </div>
);

// API Docs Section
const ApiDocsSection = ({ theme }: { theme: Theme }) => (
  <div className="space-y-4">
    <div className={cn(
      "rounded-2xl border overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="p-4 border-b border-slate-800">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Authentication
        </h3>
      </div>
      <div className="p-4">
        <p className="text-sm text-slate-400 mb-4">
          Tất cả API requests cần include JWT token trong header:
        </p>
        <pre className={cn(
          "p-4 rounded-xl text-sm font-mono overflow-x-auto",
          theme === 'dark' ? "bg-slate-950" : "bg-slate-50"
        )}>{`Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`}</pre>
      </div>
    </div>

    <div className={cn(
      "rounded-2xl border overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="p-4 border-b border-slate-800">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Log Ingest Endpoint
        </h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded bg-green-600/20 text-green-400 text-xs font-black">POST</span>
            <code className="text-sm font-mono">/api/logs/ingest</code>
          </div>
          <p className="text-sm text-slate-400">Gửi traffic logs từ agent lên server</p>
        </div>
        <pre className={cn(
          "p-4 rounded-xl text-xs font-mono overflow-x-auto",
          theme === 'dark' ? "bg-slate-950" : "bg-slate-50"
        )}>{`{
  "logs": [
    {
      "sourceIp": "192.168.1.100",
      "destinationIp": "10.0.0.1",
      "sourcePort": 54321,
      "destinationPort": 443,
      "protocol": "TCP",
      "bytesIn": 1024,
      "bytesOut": 2048,
      "requestCount": 1
    }
  ],
  "cpuPercent": 45.5,
  "ramPercent": 62.3,
  "diskPercent": 55.0
}`}</pre>
      </div>
    </div>

    <div className={cn(
      "rounded-2xl border overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="p-4 border-b border-slate-800">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Trigger Alert Endpoint
        </h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded bg-green-600/20 text-green-400 text-xs font-black">POST</span>
            <code className="text-sm font-mono">/api/alerts/trigger</code>
          </div>
          <p className="text-sm text-slate-400">AI Engine trigger alert khi phát hiện tấn công</p>
        </div>
        <pre className={cn(
          "p-4 rounded-xl text-xs font-mono overflow-x-auto",
          theme === 'dark' ? "bg-slate-950" : "bg-slate-50"
        )}>{`{
  "severity": "High",
  "alertType": "BruteForce",
  "title": "SSH Brute Force Attack Detected",
  "description": "Multiple failed SSH login attempts",
  "sourceIp": "192.168.1.100",
  "mitreTechnique": "T1110",
  "anomalyScore": 0.85
}`}</pre>
      </div>
    </div>

    <div className={cn(
      "rounded-2xl border overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="p-4 border-b border-slate-800">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Block IP Endpoint
        </h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded bg-green-600/20 text-green-400 text-xs font-black">POST</span>
            <code className="text-sm font-mono">/api/defense/block-ip</code>
          </div>
          <p className="text-sm text-slate-400">Block IP tự động hoặc thủ công</p>
        </div>
        <pre className={cn(
          "p-4 rounded-xl text-xs font-mono overflow-x-auto",
          theme === 'dark' ? "bg-slate-950" : "bg-slate-50"
        )}>{`{
  "ip": "192.168.1.100",
  "attackType": "BruteForce",
  "severity": "High",
  "reason": "Multiple failed SSH login attempts",
  "blockedBy": "AI-Engine",
  "blockDurationMinutes": 60
}`}</pre>
      </div>
    </div>
  </div>
);

// Guide Section
const GuideSection = ({
  theme,
  guide,
  setGuide,
  onSave,
}: {
  theme: Theme;
  guide: any;
  setGuide: (g: any) => void;
  onSave: () => void;
}) => {
  const [editingGuide, setEditingGuide] = useState(guide || {
    title: 'Hướng dẫn tích hợp VeriChainIDS Agent',
    description: 'Tài liệu hướng dẫn cách cài đặt và sử dụng VeriChainIDS Agent',
    steps: [
      { id: '1', title: 'Cài đặt Agent', content: 'Tải và cài đặt VeriChainIDS Agent trên server của bạn.' },
      { id: '2', title: 'Cấu hình API Key', content: 'Sao chép API Key từ trang Quản lý API và dán vào file cấu hình.' },
      { id: '3', title: 'Khởi động Agent', content: 'Chạy agent và xác minh kết nối thành công.' },
    ]
  });

  const addStep = () => {
    setEditingGuide({
      ...editingGuide,
      steps: [...editingGuide.steps, { id: `${Date.now()}`, title: 'Bước mới', content: 'Mô tả...' }]
    });
  };

  const updateStep = (id: string, field: string, value: string) => {
    setEditingGuide({
      ...editingGuide,
      steps: editingGuide.steps.map((s: any) => s.id === id ? { ...s, [field]: value } : s)
    });
  };

  const deleteStep = (id: string) => {
    setEditingGuide({
      ...editingGuide,
      steps: editingGuide.steps.filter((s: any) => s.id !== id)
    });
  };

  return (
    <div className={cn(
      "rounded-2xl border overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="flex justify-between items-center p-4 border-b border-slate-800">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Hướng dẫn tích hợp
        </h3>
        <div className="flex gap-2">
          <button
            onClick={addStep}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Plus size={14} />
            Thêm bước
          </button>
          <button
            onClick={() => { setGuide(editingGuide); onSave(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-green-600 hover:bg-green-500 text-white"
          >
            <Save size={14} />
            Lưu
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Tiêu đề</label>
          <input
            type="text"
            value={editingGuide.title}
            onChange={(e) => setEditingGuide({ ...editingGuide, title: e.target.value })}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50",
              theme === 'dark' ? "bg-slate-950 border border-slate-800 text-white" : "bg-slate-50 border border-slate-200"
            )}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Mô tả</label>
          <textarea
            value={editingGuide.description}
            onChange={(e) => setEditingGuide({ ...editingGuide, description: e.target.value })}
            rows={2}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50",
              theme === 'dark' ? "bg-slate-950 border border-slate-800 text-white" : "bg-slate-50 border border-slate-200"
            )}
          />
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-800">
          <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Các bước tích hợp
          </h4>
          {editingGuide.steps?.map((step: any, index: number) => (
            <div
              key={step.id}
              className={cn(
                "p-4 rounded-xl relative group",
                theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50"
              )}
            >
              <button
                onClick={() => deleteStep(step.id)}
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500"
              >
                <Trash2 size={14} />
              </button>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold text-sm flex items-center justify-center">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateStep(step.id, 'title', e.target.value)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                    theme === 'dark' ? "bg-slate-900 border border-slate-800 text-white" : "bg-white border border-slate-200"
                  )}
                />
              </div>
              <textarea
                value={step.content}
                onChange={(e) => updateStep(step.id, 'content', e.target.value)}
                rows={3}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                  theme === 'dark' ? "bg-slate-900 border border-slate-800 text-slate-300" : "bg-white border border-slate-200"
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
