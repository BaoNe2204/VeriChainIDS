/**
 * DataFetchWorker - Web Worker cho fetch data song song
 * Chạy trong thread riêng, không block UI thread
 * 
 * Sử dụng:
 *   worker.postMessage({ type: 'FETCH_ALL', payload: { endpoints, apiUrl, token } })
 *   worker.postMessage({ type: 'FETCH_ONE', payload: { endpoint, apiUrl, token } })
 */

import type { DashboardSummary } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface FetchPayload {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

interface FetchAllPayload {
  requests: FetchPayload[];
  concurrency?: number;
  apiUrl?: string;
  token?: string;
}

// Retry logic với exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  backoff = 300
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const response = await fetch(url, options);
    const data = response.ok
      ? await response.json().catch(() => ({}))
      : { message: `HTTP ${response.status}` };
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(r => setTimeout(r, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

// Fetch nhiều requests song song với giới hạn concurrency
async function fetchAllParallel(
  requests: FetchPayload[],
  concurrency = 4,
  apiUrl: string,
  token?: string
): Promise<Record<string, { ok: boolean; status: number; data: any; error?: string }>> {
  const results: Record<string, { ok: boolean; status: number; data: any; error?: string }> = {};
  const queue = [...requests];
  const executing: Promise<void>[] = [];

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  const runTask = async (task: FetchPayload, index: number): Promise<void> => {
    const url = `${apiUrl}${task.endpoint}`;
    const options: RequestInit = {
      method: task.method || 'GET',
      headers: { ...defaultHeaders, ...task.headers },
      ...(task.body ? { body: JSON.stringify(task.body) } : {}),
    };

    try {
      const result = await fetchWithRetry(url, options);
      results[task.endpoint] = { ...result };
    } catch (err: any) {
      results[task.endpoint] = {
        ok: false,
        status: 0,
        data: null,
        error: err.message || 'Network error',
      };
    }
  };

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const promises = batch.map((task, i) => runTask(task, requests.indexOf(task)));
    await Promise.allSettled(promises);
  }

  return results;
}

// Process dashboard data — chạy trong worker để không block UI
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
    _rawData: data, // Giữ lại raw data để debug
  };
}

// Normalize severity values
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

// Get color for attack type
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

// Main message handler
self.onmessage = async (e: MessageEvent) => {
  const { type, payload, requestId } = e.data;

  try {
    switch (type) {
      case 'FETCH_ALL': {
        const { requests, concurrency = 4, apiUrl = API_BASE_URL, token } = payload as FetchAllPayload;
        const results = await fetchAllParallel(requests, concurrency, apiUrl, token);
        self.postMessage({ type: 'FETCH_ALL_RESULT', data: results, requestId });
        break;
      }

      case 'PROCESS_DASHBOARD_DATA': {
        const processed = processDashboardData(payload);
        self.postMessage({ type: 'DASHBOARD_PROCESSED', data: processed, requestId });
        break;
      }

      case 'FETCH_DASHBOARD_BATCH': {
        // Fetch multiple dashboard-related endpoints in parallel
        const { apiUrl = API_BASE_URL, token } = payload;
        const endpoints = [
          { endpoint: '/api/reports/dashboard' },
          { endpoint: '/api/alerts?page=1&pageSize=20' },
          { endpoint: '/api/servers?page=1&pageSize=50' },
          { endpoint: '/api/defense/blocked-ips?page=1&pageSize=20&active=true' },
        ];
        
        const results = await fetchAllParallel(endpoints, 4, apiUrl, token);
        
        // Combine and process
        const dashboardRaw = results['/api/reports/dashboard']?.data?.data || results['/api/reports/dashboard']?.data || {};
        const processed = processDashboardData({
          ...dashboardRaw,
          recentAlerts: results['/api/alerts']?.data?.data?.items || results['/api/alerts']?.data?.items || [],
          serverHealth: results['/api/servers']?.data?.data?.items || results['/api/servers']?.data?.items || [],
        });

        self.postMessage({
          type: 'FETCH_DASHBOARD_BATCH_RESULT',
          data: {
            processed,
            raw: {
              dashboard: results['/api/reports/dashboard']?.data,
              alerts: results['/api/alerts']?.data,
              servers: results['/api/servers']?.data,
              blockedIPs: results['/api/defense/blocked-ips']?.data,
            },
            errors: Object.fromEntries(
              Object.entries(results).filter(([, v]) => !v.ok)
            ),
          },
          requestId,
        });
        break;
      }

      case 'PING': {
        self.postMessage({ type: 'PONG', requestId, timestamp: Date.now() });
        break;
      }

      default:
        self.postMessage({
          type: 'ERROR',
          error: `Unknown message type: ${type}`,
          requestId,
        });
    }
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      error: error.message || 'Worker error',
      requestId,
    });
  }
};

export {};
