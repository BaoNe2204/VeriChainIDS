import React, { memo, useMemo } from 'react';
import { 
  Globe, 
  Shield, 
  Server, 
  Zap, 
  Activity, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2,
  Activity as ActivityIcon,
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Theme, Agent, Alert } from '../types';
import { StatCard } from './common/StatCard';
import { DashboardSkeleton, AgentListSkeleton } from './SkeletonLoader';
import { formatRelativeCompactTruoc } from '../utils/dateUtils';

interface DashboardProps {
  theme: Theme;
  t: any;
  isAlertVisible: boolean;
  setIsAlertVisible: (val: boolean) => void;
  trafficData: any[];
  attackTypes: any[];
  recentAlerts: Alert[];
  agents: Agent[];
  dashboardData?: any;
  setSelectedDetail: (detail: { type: string, data: any } | null) => void;
  setShowAddServerModal: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  isLoading?: boolean;
}

export const Dashboard = memo(({ 
  theme, 
  t, 
  isAlertVisible,
  setIsAlertVisible,
  trafficData, 
  attackTypes, 
  recentAlerts, 
  agents,
  dashboardData,
  setSelectedDetail,
  setShowAddServerModal,
  setActiveTab,
  isLoading = false,
}: DashboardProps) => {

  // Show skeleton only for dashboardData. Stats/charts need it, but agents list is shown always.
  const showFullSkeleton = isLoading || !dashboardData;

  const stats = dashboardData?.stats || {};

  // Memoized computed values
  const latestAlert = useMemo(() => 
    recentAlerts?.[0] || null, 
  [recentAlerts]);

  const onlineAgents = useMemo(() => 
    agents.filter(a => a.status === 'online').length, 
  [agents]);

  // Memoized chart data - limit to last 24 points for performance
  const chartTrafficData = useMemo(() => 
    trafficData.slice(-24), 
  [trafficData]);

  return (
    <div className="space-y-8">
      {/* Real-time Alert Popup */}
      <AnimatePresence>
        {isAlertVisible && latestAlert && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className={cn(
              "fixed bottom-8 right-8 z-50 p-6 rounded-2xl border shadow-2xl flex items-center gap-6 max-w-md transition-colors",
              theme === 'dark' ? "bg-slate-900 border-rose-500/50" : "bg-white border-rose-200"
            )}
          >
            <div className="bg-rose-500 p-3 rounded-xl animate-pulse">
              <AlertTriangle className="text-white" size={24} />
            </div>
            <div className="flex-1">
              <h4 className={cn("font-bold text-rose-500 uppercase tracking-widest text-xs mb-1")}>
                {t.criticalThreat || 'Cảnh Báo Mới'}
              </h4>
              <p className={cn("text-sm font-medium", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {latestAlert.title || latestAlert.message || latestAlert.alertType || 'Phát hiện mối đe dọa mới'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {latestAlert.serverName || latestAlert.targetAsset || latestAlert.sourceIp || '—'}
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setIsAlertVisible(false); setActiveTab('incidents'); }}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  {t.activateSoar || 'Xem Chi Tiết'}
                </button>
                <button onClick={() => setIsAlertVisible(false)} className={cn("text-[10px] font-bold px-4 py-2 rounded-lg border transition-colors", theme === 'dark' ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100")}>
                  {t.cancel || 'Đóng'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Grid — show skeleton or real data */}
      {showFullSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={cn("border p-5 rounded-xl", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}>
              <div className={cn("h-10 w-10 rounded-lg mb-4 animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
              <div className={cn("h-4 w-24 mb-2 rounded animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
              <div className={cn("h-8 w-32 rounded animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label={t.totalRequests || 'Tổng Requests'}
            value={stats.totalRequests ? stats.totalRequests.toLocaleString() : '—'}
            icon={Globe}
            trend={stats.requestsTrend || null}
            color="bg-blue-600"
            theme={theme}
          />
          <StatCard
            label={t.threatsBlocked || 'Mối Đe Dọa'}
            value={stats.threatsBlocked ? stats.threatsBlocked.toLocaleString() : '0'}
            icon={Shield}
            trend={stats.threatsTrend || null}
            color="bg-emerald-600"
            theme={theme}
          />
          <StatCard
            label={t.activeAgents || 'Agents Online'}
            value={`${onlineAgents} / ${agents.length}`}
            icon={Server}
            trend={null}
            color="bg-indigo-600"
            theme={theme}
          />
          <StatCard
            label={t.avgResponse || 'Response TB'}
            value={stats.avgResponse ? `${stats.avgResponse}ms` : '—'}
            icon={Zap}
            trend={null}
            color="bg-amber-600"
            theme={theme}
          />
        </div>
      )}

      {/* Charts Row — skeleton or real */}
      {showFullSkeleton ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={cn("lg:col-span-2 border p-6 rounded-xl", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
            <div className={cn("h-6 w-48 mb-6 rounded animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
            <div className={cn("h-[300px] w-full rounded animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
          </div>
          <div className={cn("border p-6 rounded-xl", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
            <div className={cn("h-6 w-40 mb-6 rounded animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
            <div className={cn("h-[250px] w-full rounded-full animate-pulse", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Traffic Chart */}
          <div className={cn("lg:col-span-2 border p-6 rounded-xl transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={cn("font-bold flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
                <ActivityIcon size={18} className="text-blue-400" />
                {t.networkTraffic || 'Lưu Lượng Mạng'}
              </h3>
              <select className={cn("border rounded px-2 py-1 text-xs transition-colors", theme === 'dark' ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-600")}>
                <option>24 Giờ</option>
                <option>7 Ngày</option>
                <option>30 Ngày</option>
              </select>
            </div>
            <div className="h-[300px]">
              {chartTrafficData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartTrafficData}>
                    <defs>
                      <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAtk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#1e293b" : "#e2e8f0"} vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
                        border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                      }}
                      itemStyle={{ fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="requests" stroke="#3b82f6" fillOpacity={1} fill="url(#colorReq)" strokeWidth={2} />
                    <Area type="monotone" dataKey="attacks" stroke="#ef4444" fillOpacity={1} fill="url(#colorAtk)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Chưa có dữ liệu lưu lượng — Agent chưa gửi log
                </div>
              )}
            </div>
          </div>

          {/* Attack Distribution Pie */}
          <div className={cn("border p-6 rounded-xl transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
            <h3 className={cn("font-bold mb-6 flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              <BarChart3 size={18} className="text-purple-400" />
              {t.attackDist || 'Phân Bố Tấn Công'}
            </h3>
            {attackTypes.length > 0 ? (
              <>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={attackTypes}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {attackTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
                          border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {attackTypes.slice(0, 5).map((type) => (
                    <div key={type.name} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: type.color }}></div>
                        <span className="text-slate-400">{type.name}</span>
                      </div>
                      <span className={cn("font-medium", theme === 'dark' ? "text-white" : "text-slate-900")}>{type.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">
                Chưa có dữ liệu tấn công
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Row — always show agents + alerts (skeleton for alerts if loading) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset Health List — ALWAYS shown (servers fetched separately from dashboard) */}
        {agents.length > 0 ? (
          <div className={cn("border rounded-xl overflow-hidden transition-colors backdrop-blur-sm", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
            <div className={cn("p-5 border-b flex justify-between items-center", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
              <h3 className={cn("text-base font-bold flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
                <Server size={18} className="text-indigo-400" />
                {t.assetHealth || 'Sức khỏe tài sản quản lý'}
              </h3>
              <button onClick={() => setActiveTab('agents')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">{t.viewAll || 'Xem tất cả'}</button>
            </div>
            <div className="p-5 space-y-3 max-h-[420px] overflow-y-auto">
              {agents.slice(0, 10).map((agent) => (
                <div key={agent.id} className={cn("flex items-center justify-between p-3 rounded-lg transition-all duration-200 group cursor-pointer border", theme === 'dark' ? "bg-slate-800/30 hover:bg-slate-800/50 border-slate-700/50 hover:border-slate-600" : "bg-slate-50 hover:bg-slate-100 border-slate-200")}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", agent.status === 'online' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse" : "bg-slate-500")}></div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-bold truncate", theme === 'dark' ? "text-white" : "text-slate-900")}>{agent.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{agent.ip}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">CPU</p>
                      <p className={cn("text-sm font-bold font-mono", agent.cpu > 80 ? "text-rose-400" : theme === 'dark' ? "text-slate-300" : "text-slate-700")}>{agent.cpu}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">RAM</p>
                      <p className={cn("text-sm font-bold font-mono", agent.ram > 80 ? "text-rose-400" : theme === 'dark' ? "text-slate-300" : "text-slate-700")}>{agent.ram}%</p>
                    </div>
                    {agent.status === 'online' ? <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={18} className="text-rose-500 flex-shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AgentListSkeleton theme={theme} count={5} />
        )}

        {/* Recent Alerts Table */}
        <div className={cn("lg:col-span-2 border rounded-xl overflow-hidden transition-colors backdrop-blur-sm", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className={cn("p-5 border-b flex justify-between items-center", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
            <h3 className={cn("text-base font-bold flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              <AlertTriangle size={18} className="text-amber-400" />
              {t.liveAlerts || 'Cảnh báo bảo mật trực tiếp'}
            </h3>
            <button onClick={() => setActiveTab('incidents')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">{t.viewAll || 'Xem tất cả log'}</button>
          </div>
          {recentAlerts.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className={cn("text-[10px] uppercase tracking-wider font-semibold", theme === 'dark' ? "bg-slate-950/90 text-slate-400 backdrop-blur-sm" : "bg-slate-50 text-slate-600")}>
                    <th className="px-4 py-3">{t.severity || 'Mức độ'}</th>
                    <th className="px-4 py-3">{t.message || 'Thông điệp'}</th>
                    <th className="px-4 py-3">IP Nguồn</th>
                    <th className="px-4 py-3">MITRE</th>
                    <th className="px-4 py-3">{t.time || 'Thời gian'}</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y", theme === 'dark' ? "divide-slate-800/50" : "divide-slate-100")}>
                  {recentAlerts.slice(0, 20).map((alert) => (
                    <tr 
                      key={alert.id} 
                      className={cn("transition-all duration-200 cursor-pointer group", theme === 'dark' ? "hover:bg-slate-800/40" : "hover:bg-slate-50")}
                      onClick={() => setSelectedDetail({ type: 'alert', data: alert })}
                    >
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded inline-block",
                          alert.severity === 'Critical' || alert.severity === 'High' ? "bg-rose-500/10 text-rose-400 border border-rose-500/30" :
                          alert.severity === 'Medium' || alert.severity === 'Warning' ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                          "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                        )}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-sm font-medium", theme === 'dark' ? "text-slate-200 group-hover:text-white" : "text-slate-700 group-hover:text-slate-900")}>
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[300px]">{alert.title || alert.message || alert.alertType || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className={cn("text-xs font-mono px-1.5 py-0.5 rounded", theme === 'dark' ? "bg-slate-800/50 text-slate-300" : "bg-slate-100 text-slate-600")}>
                          {alert.sourceIp || '—'}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono font-medium", theme === 'dark' ? "bg-slate-800/70 text-slate-400" : "bg-slate-100 text-slate-600")}>
                          {alert.mitreTechnique || alert.mitreTactic || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium">{formatRelativeCompactTruoc(alert.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-slate-600 opacity-50" />
              <p className="text-slate-500 text-sm font-medium">Chưa có cảnh báo nào</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
