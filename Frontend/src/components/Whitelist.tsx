import React, { useState } from 'react';
import {
  Shield,
  Plus,
  X,
  Search,
  RefreshCw,
  Globe,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  ShieldAlert,
  Server,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { formatRelativeCompactTruoc } from '../utils/dateUtils';

interface WhitelistEntry {
  id: string;
  tenantId: string | null;
  serverId: string | null;
  ipAddress: string;
  description: string | null;
  serverName: string | null;
  createdAt: string;
}

interface WhitelistProps {
  theme: Theme;
  t: any;
  whitelists: WhitelistEntry[];
  onRefresh: () => void;
  onAdd: (ipAddress: string, description?: string, serverId?: string | null) => Promise<boolean>;
  onRemove: (id: string, ip: string) => Promise<boolean>;
  servers?: Array<{ id: string; name: string }>;
  selectedServerId?: string | null;
  userRole?: string;
}

export const Whitelist = ({
  theme,
  t,
  whitelists,
  onRefresh,
  onAdd,
  onRemove,
  servers = [],
  selectedServerId,
  userRole,
}: WhitelistProps) => {
  const isStaff = userRole === 'Staff';
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addIP, setAddIP] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addServerId, setAddServerId] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const filtered = whitelists.filter(
    (w) =>
      !searchQuery ||
      w.ipAddress.includes(searchQuery) ||
      (w.description && w.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Lọc hiển thị: nếu có selectedServerId, chỉ hiện whitelist của server đó hoặc tenant-wide
  const displayedWhitelists = selectedServerId
    ? filtered.filter((w) => w.serverId === selectedServerId || w.serverId == null)
    : filtered;

  const handleAdd = async () => {
    if (!addIP.trim()) {
      showNotification('error', 'Vui lòng nhập địa chỉ IP!');
      return;
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(addIP.trim())) {
      showNotification('error', 'Địa chỉ IP không hợp lệ! (vd: 192.168.1.100)');
      return;
    }
    setAddLoading(true);
    try {
      const ok = await onAdd(addIP.trim(), addDesc.trim() || undefined, addServerId);
      if (ok) {
        const scope = addServerId
          ? servers.find(s => s.id === addServerId)?.name
          : 'tất cả servers';
        showNotification('success', `Đã thêm ${addIP} vào Whitelist (${scope})!`);
        setShowAddModal(false);
        setAddIP('');
        setAddDesc('');
        setAddServerId(null);
      } else {
        showNotification('error', 'Không thể thêm IP. Có thể IP đã tồn tại!');
      }
    } catch {
      showNotification('error', 'Lỗi khi thêm IP vào Whitelist!');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = async (id: string, ip: string) => {
    if (!confirm(`Bạn có chắc muốn xóa IP ${ip} khỏi Whitelist?`)) return;
    setRemoving(id);
    try {
      const ok = await onRemove(id, ip);
      if (ok) {
        showNotification('success', `Đã xóa ${ip} khỏi Whitelist!`);
      } else {
        showNotification('error', 'Không thể xóa IP. Vui lòng thử lại!');
      }
    } catch {
      showNotification('error', 'Lỗi khi xóa IP khỏi Whitelist!');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-[200] px-6 py-4 rounded-lg shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top-2",
          notification.type === 'success'
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
            : "bg-rose-500/10 border-rose-500/30 text-rose-500"
        )}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>
            ✅ Whitelists - Trusted IPs
          </h1>
          <p className={cn("text-sm mt-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
            IP trong danh sách này sẽ bị bỏ qua khi có alert từ AI Engine
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
              theme === 'dark'
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "bg-slate-200 hover:bg-slate-300 text-slate-700"
            )}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowAddModal(true);
              setAddServerId(selectedServerId || null);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
            title="Thêm IP"
          >
            <Plus size={16} />
            Add IP
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Shield className="text-emerald-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{displayedWhitelists.length}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Tổng IP Whitelisted</p>
            </div>
          </div>
        </div>
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Globe className="text-blue-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{new Set(displayedWhitelists.map(w => w.ipAddress)).size}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>IP duy nhất</p>
            </div>
          </div>
        </div>
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <ShieldAlert className="text-purple-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{displayedWhitelists.filter(w => w.description).length}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Có mô tả</p>
            </div>
          </div>
        </div>
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Server className="text-amber-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                {displayedWhitelists.filter((w) => w.serverId == null).length}
              </p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Tenant-wide</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn("rounded-xl border overflow-hidden", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
        <div className="p-4 border-b border-inherit flex items-center justify-between gap-3">
          <h3 className={cn("text-sm font-semibold", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
            📋 Whitelisted IPs ({displayedWhitelists.length})
            {selectedServerId && (
              <span className="ml-2 text-xs text-blue-400">
                — lọc theo: {servers.find(s => s.id === selectedServerId)?.name || selectedServerId}
              </span>
            )}
          </h3>
          <div className="relative">
            <Search size={14} className={cn("absolute left-3 top-1/2 -translate-y-1/2", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
            <input
              type="text"
              placeholder="Tìm IP, mô tả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none w-48 transition-all",
                theme === 'dark'
                  ? "bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-blue-500"
                  : "bg-slate-50 border-slate-300 text-slate-700 placeholder-slate-400 focus:border-blue-500"
              )}
            />
          </div>
        </div>

        {displayedWhitelists.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className={cn("mx-auto mb-3 h-10 w-10", theme === 'dark' ? 'text-slate-600' : 'text-slate-300')} />
            <p className={cn("text-sm", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
              Không có IP nào trong Whitelist
            </p>
            <p className={cn("text-xs mt-1", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
              Nhấn "Add IP" để thêm IP đáng tin cậy
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn(theme === 'dark' ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-50 text-slate-500')}>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">IP Address</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Server</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Mô tả</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Ngày thêm</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className={cn("divide-y", theme === 'dark' ? 'divide-slate-700' : 'divide-slate-100')}>
                {displayedWhitelists.map((w) => (
                  <tr
                    key={w.id}
                    className={cn(
                      "transition-colors",
                      theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Globe size={14} className="text-emerald-500 shrink-0" />
                        <span className={cn("font-mono font-medium text-emerald-400", theme === 'dark' ? 'text-slate-200' : 'text-slate-800')}>
                          {w.ipAddress}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {w.serverId && w.serverName ? (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                          theme === 'dark' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-blue-100 text-blue-600 border border-blue-200'
                        )}>
                          <Server size={12} />
                          {w.serverName}
                        </span>
                      ) : (
                        <span className={cn("text-xs italic", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                          Tất cả servers
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-sm", theme === 'dark' ? 'text-slate-300' : 'text-slate-600')}>
                        {w.description || <span className={cn("italic", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>Không có mô tả</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className={cn(theme === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
                        <span className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                          {formatRelativeCompactTruoc(w.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(w.id, w.ipAddress)}
                        disabled={removing === w.id}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30 transition-all disabled:opacity-50"
                      >
                        {removing === w.id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                          Xóa
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={cn(
            "w-full max-w-md rounded-2xl border p-6 shadow-2xl",
            theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          )}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("text-lg font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                ✅ Thêm IP vào Whitelist
              </h3>
              <button onClick={() => setShowAddModal(false)} className={cn("p-1 rounded hover:bg-slate-700", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  IP Address *
                </label>
                <input
                  type="text"
                  placeholder="vd: 192.168.1.100"
                  value={addIP}
                  onChange={(e) => setAddIP(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono",
                    theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500"
                  )}
                />
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Áp dụng cho *
                </label>
                <select
                  value={addServerId || ''}
                  onChange={(e) => setAddServerId(e.target.value || null)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-sm outline-none",
                    theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-white"
                      : "bg-white border-slate-300 text-slate-900"
                  )}
                >
                  <option value="">Tất cả servers (tenant-wide)</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {addServerId
                    ? `Whitelist chỉ áp dụng cho server: ${servers.find(s => s.id === addServerId)?.name}`
                    : 'Whitelist áp dụng cho TẤT CẢ servers trong tenant'}
                </p>
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Mô tả (tùy chọn)
                </label>
                <textarea
                  placeholder="vd: IP của công ty — được phép truy cập Internal Dashboard"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  rows={2}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none",
                    theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
                  )}
                />
              </div>
              <div className={cn("p-3 rounded-lg text-xs", theme === 'dark' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600')}>
                💡 IP trong Whitelist sẽ không tạo alert khi AI Engine phát hiện bất thường từ IP này.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg border font-medium text-sm transition-all",
                  theme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                )}
              >
                Hủy
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading || !addIP.trim()}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addLoading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                Thêm Whitelist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
