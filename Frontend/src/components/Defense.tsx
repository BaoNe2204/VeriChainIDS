import React, { useState } from 'react';
import {
  Shield,
  Ban,
  Unlock,
  Globe,
  Clock,
  AlertTriangle,
  Search,
  RefreshCw,
  Plus,
  X,
  Server,
  CheckCircle,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import type { BlockedIP } from '../services/api';
import { formatDateTime, formatRelativeCompactTruoc, formatTimeUntilVi } from '../utils/dateUtils';

interface DefenseProps {
  theme: Theme;
  t: any;
  blockedIPs: BlockedIP[];
  onRefresh: () => void;
  onUnblock: (ip: string) => Promise<boolean>;
  onManualBlock: (ip: string, reason?: string, severity?: string, durationMinutes?: number, serverId?: string | null) => Promise<boolean>;
  onCheckIP: (ip: string) => Promise<any>;
  userRole?: string;
  selectedServerId?: string | null;  // Current selected server for context
  servers?: Array<{ id: string; name: string }>;  // Available servers for selection
}

const severityColors: Record<string, string> = {
  Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  High: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export const Defense = ({
  theme,
  t,
  blockedIPs,
  onRefresh,
  onUnblock,
  onManualBlock,
  onCheckIP,
  userRole,
  selectedServerId,
  servers = [],
}: DefenseProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockIP, setBlockIP] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockSeverity, setBlockSeverity] = useState('High');
  const [blockDuration, setBlockDuration] = useState('');
  const [blockServerId, setBlockServerId] = useState<string | null>(null);  // Server to block on
  const [blockLoading, setBlockLoading] = useState(false);
  const [checkIPInput, setCheckIPInput] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isStaff = userRole === 'Staff';

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const filteredIPs = blockedIPs.filter(
    (ip) =>
      !searchQuery ||
      ip.ipAddress.includes(searchQuery) ||
      ip.attackType?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: blockedIPs.length,
    critical: blockedIPs.filter((i) => i.severity === 'Critical').length,
    active: blockedIPs.filter((i) => i.isActive).length,
  };

  const handleBlock = async () => {
    if (!blockIP.trim()) {
      showNotification('error', 'Vui lòng nhập địa chỉ IP!');
      return;
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(blockIP.trim())) {
      showNotification('error', 'Địa chỉ IP không hợp lệ! (vd: 192.168.1.100)');
      return;
    }

    setBlockLoading(true);
    try {
      const duration = blockDuration ? parseInt(blockDuration) : undefined;
      const success = await onManualBlock(blockIP.trim(), blockReason || undefined, blockSeverity, duration, blockServerId);
      
      if (success) {
        const scope = blockServerId ? servers.find(s => s.id === blockServerId)?.name : 'tất cả servers';
        showNotification('success', `✅ Đã chặn IP ${blockIP} trên ${scope}!`);
        setShowBlockModal(false);
        setBlockIP('');
        setBlockReason('');
        setBlockDuration('');
        setBlockSeverity('High');
        setBlockServerId(null);
      } else {
        showNotification('error', 'Không thể chặn IP. Vui lòng thử lại!');
      }
    } catch (error) {
      showNotification('error', 'Lỗi khi chặn IP. Vui lòng kiểm tra lại!');
    } finally {
      setBlockLoading(false);
    }
  };

  const handleCheckIP = async () => {
    if (!checkIPInput.trim()) return;
    setCheckLoading(true);
    const result = await onCheckIP(checkIPInput);
    setCheckResult(result);
    setCheckLoading(false);
  };

  const handleUnblock = async (ip: string) => {
    if (!confirm(`Bạn có chắc muốn bỏ chặn IP ${ip}?`)) return;
    
    setUnblocking(ip);
    try {
      const success = await onUnblock(ip);
      if (success) {
        showNotification('success', `✅ Đã bỏ chặn IP ${ip} thành công!`);
      } else {
        showNotification('error', 'Không thể bỏ chặn IP. Vui lòng thử lại!');
      }
    } catch (error) {
      showNotification('error', 'Lỗi khi bỏ chặn IP!');
    } finally {
      setUnblocking(null);
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
            🛡️ Defense - IP Blocking
          </h1>
          <p className={cn("text-sm mt-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
            Real-time IP blocking management • Auto-block từ AI Engine
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
              setShowBlockModal(true);
              setBlockServerId(selectedServerId || null);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-all"
            title="Manual Block"
          >
            <Plus size={16} />
            Manual Block
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Ban className="text-red-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{stats.total}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Tổng IP đã block</p>
            </div>
          </div>
        </div>
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <AlertTriangle className="text-orange-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{stats.critical}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Critical threats</p>
            </div>
          </div>
        </div>
        <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Shield className="text-green-400" size={20} />
            </div>
            <div>
              <p className={cn("text-2xl font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>{stats.active}</p>
              <p className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Đang active</p>
            </div>
          </div>
        </div>
      </div>

      {/* IP Checker */}
      <div className={cn("p-4 rounded-xl border", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
        <h3 className={cn("text-sm font-semibold mb-3 flex items-center gap-2", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
          <Search size={16} /> Kiểm tra IP
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nhập IP cần kiểm tra..."
            value={checkIPInput}
            onChange={(e) => setCheckIPInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheckIP()}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg border text-sm outline-none transition-all",
              theme === 'dark'
                ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500"
            )}
          />
          <button
            onClick={handleCheckIP}
            disabled={checkLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all disabled:opacity-50"
          >
            {checkLoading ? <RefreshCw size={16} className="animate-spin" /> : 'Check'}
          </button>
        </div>
        {checkResult && (
          <div className={cn(
            "mt-3 p-3 rounded-lg border flex items-center gap-3",
            checkResult.isBlocked
              ? "bg-red-500/10 border-red-500/30"
              : "bg-green-500/10 border-green-500/30"
          )}>
            {checkResult.isBlocked ? (
              <XCircle className="text-red-400 shrink-0" size={20} />
            ) : (
              <CheckCircle className="text-green-400 shrink-0" size={20} />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", checkResult.isBlocked ? "text-red-400" : "text-green-400")}>
                {checkResult.isBlocked ? '❌ IP ĐANG BỊ CHẶN' : '✅ IP AN TOÀN'}
              </p>
              {checkResult.isBlocked && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  {checkResult.attackType && <span>Attack: {checkResult.attackType}</span>}
                  {checkResult.reason && <span>Reason: {checkResult.reason}</span>}
                  {checkResult.blockedAt && <span>Blocked: {formatDateTime(checkResult.blockedAt)}</span>}
                  {checkResult.expiresAt && <span>Expires: {formatTimeUntilVi(checkResult.expiresAt)}</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Blocked IPs Table */}
      <div className={cn("rounded-xl border overflow-hidden", theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')}>
        <div className="p-4 border-b border-inherit flex items-center justify-between gap-3">
          <h3 className={cn("text-sm font-semibold", theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
            📋 Blocked IPs ({filteredIPs.length})
          </h3>
          <div className="relative">
            <Search size={14} className={cn("absolute left-3 top-1/2 -translate-y-1/2", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
            <input
              type="text"
              placeholder="Tìm IP, attack type..."
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

        {filteredIPs.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className={cn("mx-auto mb-3 h-10 w-10", theme === 'dark' ? 'text-slate-600' : 'text-slate-300')} />
            <p className={cn("text-sm", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
              Không có IP nào bị block
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn(theme === 'dark' ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-50 text-slate-500')}>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">IP Address</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Server</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Attack Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Blocked By</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Thời gian</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Expires</th>
                  <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className={cn("divide-y", theme === 'dark' ? 'divide-slate-700' : 'divide-slate-100')}>
                {filteredIPs.map((ip) => (
                  <tr
                    key={ip.id}
                    className={cn(
                      "transition-colors",
                      theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Globe size={14} className="text-slate-500 shrink-0" />
                        <span className={cn("font-mono font-medium", theme === 'dark' ? 'text-slate-200' : 'text-slate-800')}>
                          {ip.ipAddress}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ip.serverName ? (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                          theme === 'dark' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-blue-100 text-blue-600 border border-blue-200'
                        )}>
                          <Server size={12} />
                          {ip.serverName}
                        </span>
                      ) : (
                        <span className={cn("text-xs italic", theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                          Tất cả servers
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                        theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                      )}>
                        <ShieldAlert size={12} />
                        {ip.attackType || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border", severityColors[ip.severity] || severityColors.Low)}>
                        {ip.severity || 'Low'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                        {ip.blockedBy || 'AI Engine'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className={cn(theme === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
                        <span className={cn("text-xs", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                          {formatRelativeCompactTruoc(ip.blockedAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs", ip.expiresAt ? (theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600') : (theme === 'dark' ? 'text-slate-400' : 'text-slate-500'))}>
                        {formatTimeUntilVi(ip.expiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUnblock(ip.ipAddress)}
                        disabled={unblocking === ip.ipAddress}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 transition-all disabled:opacity-50"
                      >
                        {unblocking === ip.ipAddress ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Unlock size={12} />
                        )}
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={cn(
            "w-full max-w-md rounded-2xl border p-6 shadow-2xl",
            theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          )}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("text-lg font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                🚫 Manual Block IP
              </h3>
              <button onClick={() => setShowBlockModal(false)} className={cn("p-1 rounded hover:bg-slate-700", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
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
                  placeholder="vd: 192.168.1.100 hoặc 203.0.113.45"
                  value={blockIP}
                  onChange={(e) => setBlockIP(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono",
                    theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-red-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-500"
                  )}
                />
                <p className="text-xs text-slate-500 mt-1">Nhập địa chỉ IPv4 cần chặn</p>
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Áp dụng cho *
                </label>
                <select
                  value={blockServerId || ''}
                  onChange={(e) => setBlockServerId(e.target.value || null)}
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
                  {blockServerId 
                    ? `Chặn chỉ trên server: ${servers.find(s => s.id === blockServerId)?.name}`
                    : `Chặn trên tất cả ${servers.length} servers`}
                </p>
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Severity *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['Low', 'Medium', 'High', 'Critical'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setBlockSeverity(s)}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs font-bold border transition-all",
                        blockSeverity === s
                          ? severityColors[s]
                          : (theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200')
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Lý do chặn (tùy chọn)
                </label>
                <textarea
                  placeholder="vd: Phát hiện SSH brute force attack từ IP này"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={2}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none",
                    theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
                  )}
                />
              </div>

              <div>
                <label className={cn("block text-xs font-medium mb-1", theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Thời hạn chặn
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Số phút"
                    value={blockDuration}
                    onChange={(e) => setBlockDuration(e.target.value)}
                    min="1"
                    className={cn(
                      "px-3 py-2 rounded-lg border text-sm outline-none",
                      theme === 'dark'
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                        : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"
                    )}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => setBlockDuration('60')}
                      className={cn("flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all", theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600')}
                    >
                      1h
                    </button>
                    <button
                      onClick={() => setBlockDuration('1440')}
                      className={cn("flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all", theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600')}
                    >
                      1d
                    </button>
                    <button
                      onClick={() => setBlockDuration('')}
                      className={cn("flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all", theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600')}
                    >
                      ∞
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {blockDuration ? `Chặn trong ${blockDuration} phút` : 'Chặn vĩnh viễn (không tự động hết hạn)'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBlockModal(false)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg border font-medium text-sm transition-all",
                  theme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                )}
              >
                Hủy
              </button>
              <button
                onClick={handleBlock}
                disabled={blockLoading || !blockIP.trim()}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {blockLoading ? <RefreshCw size={16} className="animate-spin" /> : <Ban size={16} />}
                Block IP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
