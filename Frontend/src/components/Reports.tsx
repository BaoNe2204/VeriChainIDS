import React, { useState } from 'react';
import { Download, FileText, Calendar, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface ReportsProps {
  theme: Theme;
  t: any;
  handleExport: (startDate?: string, endDate?: string) => void;
}

export const Reports = ({ theme, t, handleExport }: ReportsProps) => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isExporting, setIsExporting] = useState(false);

  const onExport = async () => {
    setIsExporting(true);
    try {
      await handleExport(startDate, endDate);
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  const quickRanges = [
    { label: 'Hôm nay', days: 0 },
    { label: '7 ngày', days: 7 },
    { label: '30 ngày', days: 30 },
    { label: '90 ngày', days: 90 },
  ];

  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days === 0) {
      // Today
    } else {
      start.setDate(start.getDate() - days);
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Báo Cáo Bảo Mật
          </h2>
          <p className="text-slate-400">Xuất báo cáo Excel theo ngày tháng</p>
        </div>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Download size={18} />
          )}
          Xuất Excel
        </button>
      </div>

      {/* Date Range Selection */}
      <div className={cn("border rounded-xl p-6 transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
        <div className="flex items-center gap-3 mb-4">
          <Calendar size={18} className="text-blue-400" />
          <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Chọn Khoảng Thời Gian
          </h3>
        </div>

        {/* Quick ranges */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {quickRanges.map((range) => (
            <button
              key={range.label}
              onClick={() => applyQuickRange(range.days)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold border transition-all",
                theme === 'dark'
                  ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-blue-500/50"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Date pickers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={cn("w-full border rounded-lg px-4 py-2.5 text-sm transition-colors", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn("w-full border rounded-lg px-4 py-2.5 text-sm transition-colors", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900")}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onExport}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Download size={16} />
              Xuất Báo Cáo
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
          <p className="text-xs text-blue-400">
            Báo cáo sẽ bao gồm: Tổng quan cảnh báo, Phiếu sự cố, Top nguồn tấn công, MITRE ATT&CK mapping, phân tích theo ngày.
          </p>
        </div>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            title: 'Tổng Quan Anomaly',
            desc: 'Thống kê tất cả alert và threat detection',
            type: 'Tổng quan',
            ready: true,
          },
          {
            title: 'Phiếu Sự Cố',
            desc: 'Chi tiết tickets và workflow xử lý',
            type: 'Technical',
            ready: true,
          },
          {
            title: 'MITRE ATT&CK',
            desc: 'Phân tích theo framework MITRE',
            type: 'Compliance',
            ready: true,
          },
        ].map((report, i) => (
          <div key={i} className={cn("border p-6 rounded-xl transition-all group", theme === 'dark' ? "bg-slate-900/50 border-slate-800 hover:border-blue-500/50" : "bg-white border-slate-200 hover:border-blue-500 shadow-sm")}>
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors", theme === 'dark' ? "bg-slate-800 group-hover:bg-blue-600/20 group-hover:text-blue-400" : "bg-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600")}>
              <FileText size={24} />
            </div>
            <h4 className={cn("font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>{report.title}</h4>
            <p className="text-xs text-slate-500 mb-4">{report.desc}</p>
            <div className="flex justify-between items-center">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", report.ready ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500")}>
                {report.ready ? '✓ Sẵn sàng' : 'Đang xử lý...'}
              </span>
              {report.ready && (
                <button
                  onClick={onExport}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Download size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
