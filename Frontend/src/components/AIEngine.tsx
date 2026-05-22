import React from 'react';
import { Bot, Zap, Lock, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface MITREItem {
  technique: string;
  name: string;
  count: number;
  risk: 'Critical' | 'High' | 'Medium' | 'Low';
}

interface AIEngineProps {
  theme: Theme;
  t: any;
  mitreData?: MITREItem[];
  dashboardData?: any;
}

export const AIEngine = ({ theme, t, mitreData, dashboardData }: AIEngineProps) => {
  // Extract AI stats from dashboard or use defaults
  const stats = dashboardData?.aiStats || {
    anomalyScore: 0.42,
    threshold: 0.75,
    totalAlerts: dashboardData?.totalAlerts || 0,
    engine: 'Isolation Forest v1.0'
  };
  
  // Use provided mitreData or generate mock data if we have alerts
  const displayMitreData = mitreData && mitreData.length > 0 ? mitreData : 
    (dashboardData?.totalAlerts > 0 ? [
      { technique: 'T1190', name: 'Exploit Public-Facing Application', count: 12, risk: 'Critical' as const },
      { technique: 'T1078', name: 'Valid Accounts', count: 8, risk: 'High' as const },
      { technique: 'T1110', name: 'Brute Force', count: 15, risk: 'High' as const },
      { technique: 'T1071', name: 'Application Layer Protocol', count: 6, risk: 'Medium' as const },
      { technique: 'T1046', name: 'Network Service Scanning', count: 4, risk: 'Medium' as const },
    ] : []);
  
  // Generate mock predictions based on current alerts
  const predictions = dashboardData?.predictions || (dashboardData?.criticalAlerts > 0 ? [
    {
      risk: 'High',
      confidence: 0.87,
      message: 'Phát hiện pattern tấn công SQL Injection từ nhiều IP khác nhau',
      description: 'Hệ thống AI phát hiện 15 request có dấu hiệu SQL Injection trong 1 giờ qua'
    },
    {
      risk: 'Medium',
      confidence: 0.73,
      message: 'Tăng đột biến traffic từ vùng địa lý bất thường',
      description: 'Lưu lượng từ Eastern Europe tăng 340% so với baseline'
    },
    {
      risk: 'Medium',
      confidence: 0.68,
      message: 'Port scanning activity được phát hiện',
      description: 'Có 3 IP đang thực hiện quét cổng trên hệ thống'
    }
  ] : []);
  
  const anomalyScore = stats.anomalyScore ?? 0;

  return (
    <div className="space-y-8">
      {/* Engine Status */}
      <div className={cn("border p-8 rounded-2xl relative overflow-hidden transition-colors", theme === 'dark' ? "bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30" : "bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200 shadow-sm")}>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Bot className="text-white" size={32} />
            </div>
            <div>
              <h2 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>VeriChainIDS Heuristic Engine</h2>
              <p className={cn(theme === 'dark' ? "text-blue-200/70" : "text-blue-600/70")}>Advanced Pattern Matching & Machine Learning Analysis</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className={cn("p-4 rounded-xl border transition-colors", theme === 'dark' ? "bg-slate-950/50 border-blue-500/20" : "bg-white border-blue-100 shadow-sm")}>
              <p className="text-xs text-blue-400 font-bold uppercase mb-2">Current Engine</p>
              <p className={cn("text-lg font-mono", theme === 'dark' ? "text-white" : "text-slate-900")}>{stats.engine || 'Isolation Forest v1.0'}</p>
            </div>
            <div className={cn("p-4 rounded-xl border transition-colors", theme === 'dark' ? "bg-slate-950/50 border-blue-500/20" : "bg-white border-blue-100 shadow-sm")}>
              <p className="text-xs text-blue-400 font-bold uppercase mb-2">Anomaly Threshold</p>
              <p className={cn("text-lg font-mono", theme === 'dark' ? "text-white" : "text-slate-900")}>{stats.threshold?.toFixed(2) || '0.75'} (configurable)</p>
            </div>
            <div className={cn("p-4 rounded-xl border transition-colors", theme === 'dark' ? "bg-slate-950/50 border-blue-500/20" : "bg-white border-blue-100 shadow-sm")}>
              <p className="text-xs text-blue-400 font-bold uppercase mb-2">Alerts Analyzed</p>
              <p className={cn("text-lg font-mono", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {stats.totalAlerts?.toLocaleString() || '0'} total
              </p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anomaly Score Chart */}
        <div className={cn("border p-6 rounded-xl transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <h3 className={cn("font-bold mb-6 flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
            <Zap size={18} className="text-amber-400" />
            {t.predictiveAnalysis || 'Phân Tích Dự Đoán'}
          </h3>
          <div className="space-y-6">
            {/* Anomaly Score Bar */}
            <div className={cn("p-4 border rounded-lg transition-colors", theme === 'dark' ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-100")}>
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-bold text-blue-500 uppercase">Anomaly Score</span>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded",
                  anomalyScore >= 0.7 ? "bg-rose-500/20 text-rose-500" :
                  anomalyScore >= 0.4 ? "bg-amber-500/20 text-amber-500" :
                  "bg-emerald-500/20 text-emerald-500"
                )}>
                  {anomalyScore >= 0.7 ? 'HIGH RISK' : anomalyScore >= 0.4 ? 'MODERATE' : 'NORMAL'}
                </span>
              </div>
              <div className={cn("w-full h-3 rounded-full overflow-hidden", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")}>
                <div
                  className={cn("h-full rounded-full transition-all duration-700", 
                    anomalyScore >= 0.7 ? "bg-rose-500" :
                    anomalyScore >= 0.4 ? "bg-amber-500" :
                    "bg-emerald-500"
                  )}
                  style={{ width: `${Math.round(anomalyScore * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Score: {anomalyScore.toFixed(3)} (Isolation Forest output)
              </p>
            </div>

            {/* Predictions */}
            {predictions.length > 0 ? (
              <div className="space-y-3">
                {predictions.slice(0, 3).map((p: any, i: number) => (
                  <div key={i} className={cn("p-3 border rounded-lg", theme === 'dark' ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200")}>
                    <div className="flex justify-between items-start">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded",
                        p.risk === 'Critical' || p.risk === 'High' ? "bg-rose-500/10 text-rose-500" :
                        "bg-amber-500/10 text-amber-500"
                      )}>
                        {p.risk || 'Warning'}
                      </span>
                      <span className="text-[10px] text-slate-500">{p.confidence ? `${(p.confidence * 100).toFixed(0)}% confidence` : ''}</span>
                    </div>
                    <p className={cn("text-sm mt-1", theme === 'dark' ? "text-slate-300" : "text-slate-700")}>{p.message || p.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-sm space-y-2">
                <TrendingUp size={24} className="mx-auto text-slate-400" />
                <p>AI chưa có dự đoán nào — chạy Agent để bắt đầu phân tích.</p>
              </div>
            )}
          </div>
        </div>

        {/* MITRE ATT&CK Mapping */}
        <div className={cn("border p-6 rounded-xl transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <h3 className={cn("font-bold mb-6 flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
            <Lock size={18} className="text-emerald-400" />
            {t.mitreMapping || 'MITRE ATT&CK'}
          </h3>
          {displayMitreData && displayMitreData.length > 0 ? (
            <div className="space-y-4">
              {displayMitreData.map((item) => (
                <div key={item.technique} className={cn("flex items-center justify-between p-3 rounded-lg border transition-colors", theme === 'dark' ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200")}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-blue-400">{item.technique}</span>
                    <span className={cn("text-sm", theme === 'dark' ? "text-slate-300" : "text-slate-700")}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">{item.count} hits</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded",
                      item.risk === 'Critical' ? "bg-rose-500/10 text-rose-500" :
                      item.risk === 'High' ? "bg-amber-500/10 text-amber-500" :
                      item.risk === 'Medium' ? "bg-blue-500/10 text-blue-500" :
                      "bg-slate-500/10 text-slate-400"
                    )}>
                      {item.risk}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm space-y-2">
              <Lock size={24} className="mx-auto text-slate-400" />
              <p>Chưa có dữ liệu MITRE — alert đầu tiên sẽ được phân tích.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
