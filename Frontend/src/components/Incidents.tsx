import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Theme, Alert } from '../types';
import { formatRelativeCompactTruoc, getApiTimeMs } from '../utils/dateUtils';

interface IncidentsProps {
  theme: Theme;
  t: any;
  recentAlerts: Alert[];
  setSelectedDetail: (detail: { type: string, data: any } | null) => void;
}

const severityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };

export const Incidents = ({ theme, t, recentAlerts, setSelectedDetail }: IncidentsProps) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = recentAlerts
    .filter(a => severityFilter === 'all' || a.severity === severityFilter)
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => {
      const sA = severityOrder[a.severity || 'Low'] ?? 3;
      const sB = severityOrder[b.severity || 'Low'] ?? 3;
      if (sA !== sB) return sA - sB;
      return getApiTimeMs(b.createdAt) - getApiTimeMs(a.createdAt);
    });

  const handleExport = () => {
    const rows = [
      ['ID', 'Severity', 'Alert Type', 'Title', 'Source IP', 'Server', 'Status', 'Created At'].join(','),
      ...filtered.map(a => [
        a.id,
        a.severity || '—',
        a.alertType || '—',
        `"${(a.title || a.message || '').replace(/"/g, '""')}"`,
        a.sourceIp || '—',
        a.serverName || a.targetAsset || '—',
        a.status || '—',
        a.createdAt || '—',
      ].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VeriChainIDS_Incidents_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.incidents || 'Sự Cố'}</h2>
          <p className="text-slate-400">
            {filtered.length} cảnh báo {filtered.length !== recentAlerts.length ? `(đã lọc từ ${recentAlerts.length})` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className={cn("border rounded-lg px-3 py-1.5 text-xs", theme === 'dark' ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700")}
          >
            <option value="all">Tất cả mức</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={cn("border rounded-lg px-3 py-1.5 text-xs", theme === 'dark' ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700")}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="Open">Open</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Investigating">Investigating</option>
            <option value="Resolved">Resolved</option>
          </select>
          <button
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className={cn("border rounded-xl overflow-hidden transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className={cn("text-[10px] uppercase tracking-wider text-slate-500", theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50")}>
                  <th className="px-4 py-4 font-medium w-12">#</th>
                  <th className="px-4 py-4 font-medium w-20">{t.severity || 'Mức Độ'}</th>
                  <th className="px-4 py-4 font-medium w-28">Loại</th>
                  <th className="px-4 py-4 font-medium">{t.message || 'Mô Tả'}</th>
                  <th className="px-4 py-4 font-medium w-32">IP Nguồn</th>
                  <th className="px-4 py-4 font-medium w-32">Server</th>
                  <th className="px-4 py-4 font-medium w-24">MITRE</th>
                  <th className="px-4 py-4 font-medium w-28">Trạng Thái</th>
                  <th className="px-4 py-4 font-medium w-24">{t.time || 'Thời Gian'}</th>
                  <th className="px-4 py-4 font-medium w-20">Action</th>
                </tr>
              </thead>
              <tbody className={cn("divide-y", theme === 'dark' ? "divide-slate-800" : "divide-slate-100")}>
                {filtered.map((alert, i) => (
                  <tr key={alert.id} className={cn("transition-colors cursor-pointer", theme === 'dark' ? "hover:bg-slate-800/30" : "hover:bg-slate-50")}>
                    <td className="px-4 py-4 text-xs text-slate-500">#{i + 1}</td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap inline-block",
                        alert.severity === 'Critical' ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" :
                        alert.severity === 'High' ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                        alert.severity === 'Medium' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                        "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      )}>
                        {alert.severity || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-400 break-words">{alert.alertType || '—'}</td>
                    <td className={cn("px-4 py-4 text-sm break-words", theme === 'dark' ? "text-slate-200" : "text-slate-700")}>
                      <div className="line-clamp-2" title={alert.title || alert.message || '—'}>
                        {alert.title || alert.message || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-400 break-all">{alert.sourceIp || '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-400 break-words">
                      <div className="line-clamp-2" title={alert.serverName || alert.targetAsset || '—'}>
                        {alert.serverName || alert.targetAsset || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono break-all inline-block", theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")}>
                        {alert.mitreTechnique || alert.mitreTactic || alert.mitre || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap inline-block",
                        alert.status === 'Resolved' || alert.status === 'Closed' || alert.status === 'resolved' || alert.status === 'closed' ? "bg-emerald-500/10 text-emerald-500" :
                        alert.status === 'Investigating' || alert.status === 'Acknowledged' || alert.status === 'acknowledged' ? "bg-blue-500/10 text-blue-500" :
                        "bg-slate-500/10 text-slate-400"
                      )}>
                        {alert.status || 'Open'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap">{formatRelativeCompactTruoc(alert.createdAt)}</td>
                    <td className="px-4 py-4">
                      <button 
                        onClick={() => setSelectedDetail({ type: 'incident', data: alert })}
                        className="text-blue-400 hover:underline text-xs whitespace-nowrap"
                      >
                        {t.details || 'Chi Tiết'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">
            {recentAlerts.length === 0
              ? 'Chưa có cảnh báo nào — Agent chưa gửi log hoặc AI chưa phát hiện bất thường.'
              : 'Không có cảnh báo nào khớp với bộ lọc hiện tại.'}
          </div>
        )}
      </div>
    </div>
  );
};
