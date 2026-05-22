export type Theme = 'dark' | 'light';
export type Language = 'en' | 'vi';
export type AuthMode = 'login' | 'register';
export type UserRole = 'SuperAdmin' | 'Admin' | 'User';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical' | 'Warning';

export interface User {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  email: string;
  fullName: string;
  username: string;
  role: UserRole;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'warning';
  cpu: number;
  ram: number;
  lastSeen: string;
  os?: string;
  diskUsage?: number;
}

export interface Alert {
  id: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical' | 'Warning';
  alertType?: string;
  title?: string;
  message?: string;
  target?: string;
  time?: string;
  mitre?: string;
  mitreTechnique?: string;
  mitreTactic?: string;
  status?: string;
  sourceIp?: string;
  targetAsset?: string;
  createdAt?: string;
  serverName?: string;
  description?: string;
  // Legacy/compat
  type?: string;
}

export interface Notification {
  id: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
  type?: string;
  link?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  created: string;
  keyPrefix?: string;
  plainApiKey?: string;
  isActive?: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}
