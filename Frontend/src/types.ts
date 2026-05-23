// ============================================================
// VeriChainIDS - Core Types
// ============================================================

export type Theme = 'dark' | 'light';
export type Language = 'vi' | 'en';
export type AuthMode = 'login' | 'register';

// --- User & Auth ---
export interface User {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  email: string;
  fullName: string;
  role: 'SuperAdmin' | 'Admin' | 'Staff' | 'User';
  isActive?: boolean;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  sessionTimeoutEnabled?: boolean;
  sessionTimeoutMinutes?: number;
  emailAlertsEnabled?: boolean;
  telegramAlertsEnabled?: boolean;
  pushNotificationsEnabled?: boolean;
  telegramChatId?: string | null;
  alertSeverityThreshold?: string;
  alertDigestMode?: string;
  avatarUrl?: string | null;
}

export interface Alert {
  id: string;
  tenantId?: string;
  serverId?: string | null;
  serverName?: string | null;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical' | 'Warning';
  alertType?: string;
  title?: string;
  message?: string;
  description?: string | null;
  sourceIp?: string | null;
  targetAsset?: string | null;
  mitre?: string;
  mitreTactic?: string | null;
  mitreTechnique?: string | null;
  status?: string;
  anomalyScore?: number | null;
  recommendedAction?: string | null;
  createdAt?: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  acknowledgedByName?: string | null;
  resolvedByName?: string | null;
  blockchainProof?: BlockchainRecord | null;
}

export interface BlockchainRecord {
  id: string;
  tenantId: string;
  recordType: string;
  entityId: string;
  dataHash: string;
  txHash: string | null;
  blockHeight: number | null;
  status: string;
  network: string;
  metadataLabel: string;
  createdAt: string;
  confirmedAt: string | null;
  errorMessage: string | null;
  explorerUrl: string | null;
}

// --- Agent / Server ---
export interface Agent {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'warning';
  cpu: number;
  ram: number;
  diskUsage: number;
  os: string;
  lastSeen: string;
  version?: string;
  tenantId?: string;
  apiKey?: string;
}

// --- API Key ---
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  plainApiKey: string;  // Make required instead of optional
  created: string;
  expiresAt?: string;
  lastUsed?: string;
  tenantId?: string;
}

/** Modal hiển thị API key (tạo mới / xem / tái tạo) */
export interface ServerKeyModalState {
  serverId: string;
  serverName: string;
  plainApiKey: string | null;
  keyPrefix?: string;
}

// --- Notification ---
export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: 'Alert' | 'Warning' | 'Ticket' | 'Info';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

// --- Report ---
export interface Report {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  format: 'pdf' | 'excel' | 'csv';
  status: 'generating' | 'ready' | 'failed';
  downloadUrl?: string;
  createdAt: string;
  tenantId?: string;
}

// --- Dashboard Summary ---
export interface DashboardSummary {
  totalRequests: number;
  threatsBlocked: number;
  activeAgents: number;
  avgResponse: string;
  totalAlerts: number;
  openAlerts: number;
  criticalAlerts: number;
  totalTickets: number;
  openTickets: number;
  closedTicketsToday: number;
  currentBandwidthIn: number;
  currentBandwidthOut: number;
  recentAlerts: Alert[];
  serverHealth: Agent[];
  trafficData?: TrafficDataPoint[];
  attackTypes?: AttackType[];
  mitreData?: MitreItem[];
  aiStats?: AIStats;
  predictions?: Prediction[];
}

// --- AI Engine Stats ---
export interface AIStats {
  anomalyScore: number;
  threshold: number;
  totalAlerts: number;
  engine: string;
}

export interface Prediction {
  risk: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: number;
  message: string;
  description?: string;
}

export interface MitreItem {
  technique: string;
  name: string;
  count: number;
  risk: 'Critical' | 'High' | 'Medium' | 'Low';
}

// --- Traffic Data Point ---
export interface TrafficDataPoint {
  time: string;
  requests: number;
  attacks: number;
}

// --- Attack Type (for pie chart) ---
export interface AttackType {
  name: string;
  value: number;
  color: string;
}

// --- Pricing Plan ---
export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  agentLimit: number;
  isPopular?: boolean;
  stripePriceId?: string;
}

// --- MITRE ATT&CK ---
export interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  killChainPhase: string;
  indicators?: string[];
 Mitigations?: string[];
  examples?: string[];
}
