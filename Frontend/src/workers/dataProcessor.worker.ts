/**
 * Web Worker for heavy data processing
 * Chạy trên thread riêng, không block UI
 */

import { getApiTimeMs } from '../utils/dateUtils';

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case 'PROCESS_DASHBOARD_DATA': {
      const processed = processDashboardData(data);
      self.postMessage({ type: 'DASHBOARD_PROCESSED', data: processed });
      break;
    }

    case 'PROCESS_ALERTS': {
      const processed = processAlerts(data);
      self.postMessage({ type: 'ALERTS_PROCESSED', data: processed });
      break;
    }

    case 'PROCESS_TRAFFIC_DATA': {
      const processed = processTrafficData(data);
      self.postMessage({ type: 'TRAFFIC_PROCESSED', data: processed });
      break;
    }

    default:
      console.warn('Unknown worker message type:', type);
  }
};

// Heavy processing functions
function processDashboardData(rawData: any) {
  const now = Date.now();

  // Handle both direct DashboardSummary and wrapped ApiResponse format
  const data = rawData?.data || rawData || {};

  // Traffic chart data
  const trafficPoints = (data.trafficData || data.TrafficData || []).map((point: any, idx: number) => ({
    time: point.time || point.Time || point.label || `T${idx}`,
    requests: Number(point.requests || point.Requests || point.totalRequests || 0),
    attacks: Number(point.attacks || point.Attacks || point.totalAttacks || 0),
    bytesIn: point.bytesIn || point.BytesIn || 0,
    bytesOut: point.bytesOut || point.BytesOut || 0,
  }));

  // Attack distribution
  const attackBreakdown = (data.attackTypes || data.AttackTypes || data.attackDistribution || []).map((type: any) => ({
    name: type.name || type.Name || type.label || type.attackType || 'Unknown',
    value: Number(type.value || type.Value || type.count || type.percentage || 0),
    color: type.color || type.Color || getAttackColor(type.name || type.attackType || ''),
  }));

  // Recent alerts with enriched data
  const recentAlerts = (data.recentAlerts || data.RecentAlerts || data.alerts || []).map((alert: any, idx: number) => ({
    id: alert.id || alert.Id || `alert-${idx}`,
    title: alert.title || alert.Title || alert.message || alert.AlertType || 'Alert',
    message: alert.description || alert.Description || alert.message || '',
    alertType: alert.alertType || alert.AlertType || alert.type || 'Security',
    severity: normalizeSeverity(alert.severity || alert.Severity),
    sourceIp: alert.sourceIp || alert.SourceIp || alert.ipAddress || alert.ip || '',
    targetAsset: alert.targetAsset || alert.TargetAsset || alert.serverName || '',
    mitreTactic: alert.mitreTactic || alert.MitreTactic || '',
    mitreTechnique: alert.mitreTechnique || alert.MitreTechnique || '',
    anomalyScore: alert.anomalyScore || alert.AnomalyScore || alert.score || 0,
    serverName: alert.serverName || alert.ServerName || alert.serverId || '',
    createdAt: alert.createdAt || alert.CreatedAt || alert.timestamp || alert.detectedAt || new Date().toISOString(),
    status: alert.status || alert.Status || 'Open',
  }));

  // Stats - handle both PascalCase (backend) and camelCase
  const stats = {
    totalRequests: Number(data.totalRequests || data.TotalRequests || 0),
    threatsBlocked: Number(data.threatsBlocked || data.totalAlerts || data.TotalAlerts || 0),
    avgResponse: Number(data.avgResponse || data.AvgResponseMs || 120),
    avgResponseMs: Number(data.avgResponse || data.AvgResponseMs || 120),
    totalAlerts: Number(data.totalAlerts || data.TotalAlerts || 0),
    openAlerts: Number(data.openAlerts || data.OpenAlerts || 0),
    criticalAlerts: Number(data.criticalAlerts || data.CriticalAlerts || 0),
    totalTickets: Number(data.totalTickets || data.TotalTickets || 0),
    openTickets: Number(data.openTickets || data.OpenTickets || 0),
    closedTicketsToday: Number(data.closedTicketsToday || data.ClosedTicketsToday || 0),
    currentBandwidthIn: Number(data.currentBandwidthIn || data.CurrentBandwidthIn || 0),
    currentBandwidthOut: Number(data.currentBandwidthOut || data.CurrentBandwidthOut || 0),
    requestsTrend: data.requestsTrend || null,
    threatsTrend: data.threatsTrend || null,
  };

  // Server health - handle both naming conventions
  const serverHealth = (data.serverHealth || data.ServerHealth || data.servers || []).map((s: any) => ({
    id: s.id || s.Id || s.serverId,
    name: s.name || s.Name || s.serverName || 'Server',
    ip: s.ipAddress || s.IpAddress || s.ip || '',
    status: (s.status || s.Status || 'offline').toLowerCase(),
    cpu: Number(s.cpuUsage ?? s.CpuUsage ?? s.cpu ?? 0),
    ram: Number(s.ramUsage ?? s.RamUsage ?? s.ram ?? 0),
    diskUsage: Number(s.diskUsage ?? s.DiskUsage ?? s.disk ?? 0),
    lastSeen: s.lastSeenAt || s.LastSeenAt || s.lastSeen || '',
    os: s.os || s.Os || '',
  }));

  return {
    stats,
    recentAlerts,
    serverHealth,
    trafficData: trafficPoints,
    attackTypes: attackBreakdown,
    _processedAt: now,
    _rawData: data,
  };
}

function processAlerts(alerts: any[]) {
  // Sort, filter, transform alerts
  return alerts
    .filter(a => a.id)
    .sort((a, b) => getApiTimeMs(b.createdAt) - getApiTimeMs(a.createdAt))
    .slice(0, 50);
}

function processTrafficData(data: any[]) {
  // Aggregate, calculate statistic
  return data.map(point => ({
    ...point,
    total: point.requests + point.attacks,
    attackRate: point.requests > 0 ? (point.attacks / point.requests) * 100 : 0,
  }));
}

function normalizeSeverity(severity: string | undefined): string {
  if (!severity) return 'Medium';
  const s = severity.toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === '1' || s === 'BLOCK') return 'Critical';
  if (s === 'HIGH') return 'Critical';
  if (s === 'MEDIUM' || s === 'WARNING' || s === '2' || s === 'ALERT') return 'Medium';
  if (s === 'LOW' || s === '3') return 'Low';
  if (s === 'INFO' || s === '4') return 'Info';
  return severity;
}

function getAttackColor(attackType: string): string {
  const colors: Record<string, string> = {
    'ddos': '#ef4444',
    'bruteforce': '#f97316',
    'sqlinjection': '#eab308',
    'xss': '#22c55e',
    'portscan': '#3b82f6',
    'malware': '#a855f7',
    'phishing': '#ec4899',
    'default': '#64748b',
  };
  const key = attackType.toLowerCase().split(/[_\s-]/)[0];
  return colors[key] || colors['default'];
}

export {};
