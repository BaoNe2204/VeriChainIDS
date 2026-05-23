import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  Link2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import {
  BlockchainApi,
  type BlockchainRecord,
  type BlockchainStats,
  type BlockchainVerifyResult,
} from '../services/api';
import { BlockchainBadge } from './BlockchainBadge';
import { formatRelativeCompactTruoc } from '../utils/dateUtils';

interface BlockchainVerifyProps {
  theme: Theme;
}

const emptyStats: BlockchainStats = {
  totalRecords: 0,
  pendingRecords: 0,
  confirmedRecords: 0,
  failedRecords: 0,
  alertRecords: 0,
  blockIpRecords: 0,
  auditLogRecords: 0,
};

export const BlockchainVerify = ({ theme }: BlockchainVerifyProps) => {
  const [records, setRecords] = useState<BlockchainRecord[]>([]);
  const [stats, setStats] = useState<BlockchainStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [recordType, setRecordType] = useState('all');
  const [status, setStatus] = useState('all');
  const [txHash, setTxHash] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<BlockchainVerifyResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const filters = useMemo(() => ({
    recordType: recordType === 'all' ? undefined : recordType,
    status: status === 'all' ? undefined : status,
  }), [recordType, status]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [recordsRes, statsRes] = await Promise.all([
        BlockchainApi.getRecords(1, 50, filters),
        BlockchainApi.getStats(),
      ]);

      if (recordsRes.success && recordsRes.data) {
        setRecords(recordsRes.data.items);
      } else {
        setError(recordsRes.message || 'Unable to load blockchain records.');
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const copyText = (value: string, key: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1400);
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!txHash.trim() || !expectedHash.trim()) return;

    setVerifying(true);
    setVerifyResult(null);
    setError('');
    try {
      const res = await BlockchainApi.verify(txHash.trim(), expectedHash.trim());
      if (res.success && res.data) {
        setVerifyResult(res.data);
      } else {
        setError(res.message || 'Verification failed.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const fillFromRecord = (record: BlockchainRecord) => {
    setTxHash(record.txHash || '');
    setExpectedHash(record.dataHash);
    setVerifyResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={cn('text-2xl font-bold flex items-center gap-2', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
            <Link2 size={24} className="text-cyan-400" />
            Blockchain Evidence
          </h2>
          <p className="text-slate-400">AI detects the threat. Cardano proves the evidence.</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatBlock theme={theme} icon={Database} label="Total Records" value={stats.totalRecords} tone="blue" />
        <StatBlock theme={theme} icon={CheckCircle2} label="Confirmed" value={stats.confirmedRecords} tone="emerald" />
        <StatBlock theme={theme} icon={Clock3} label="Pending" value={stats.pendingRecords} tone="amber" />
        <StatBlock theme={theme} icon={AlertTriangle} label="Failed" value={stats.failedRecords} tone="rose" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={verify}
          className={cn('xl:col-span-1 border rounded-lg p-5 space-y-4', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}
        >
          <div className="flex items-center gap-2">
            <FileCheck2 size={18} className="text-cyan-400" />
            <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Verify Proof</h3>
          </div>

          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">TxHash</span>
            <input
              value={txHash}
              onChange={(event) => setTxHash(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500')}
              placeholder="Cardano transaction hash"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Expected SHA-256</span>
            <textarea
              value={expectedHash}
              onChange={(event) => setExpectedHash(event.target.value)}
              rows={3}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors resize-none', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-cyan-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500')}
              placeholder="64-character evidence hash"
            />
          </label>

          <button
            type="submit"
            disabled={verifying || !txHash.trim() || !expectedHash.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-500 transition-colors disabled:opacity-60"
          >
            <Search size={16} />
            {verifying ? 'Verifying...' : 'Verify'}
          </button>

          {verifyResult && (
            <div
              className={cn(
                'rounded-lg border p-4 space-y-3',
                verifyResult.isValid
                  ? theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                  : theme === 'dark' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
              )}
            >
              <div className="flex items-center gap-2">
                {verifyResult.isValid ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
                <span className={cn('font-bold text-sm', verifyResult.isValid ? 'text-emerald-500' : 'text-rose-500')}>
                  {verifyResult.isValid ? 'Valid Evidence' : 'Hash Mismatch'}
                </span>
              </div>
              <p className={cn('text-sm', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>{verifyResult.message}</p>
              <p className="text-xs text-slate-500">Source: {verifyResult.source}</p>
              {verifyResult.explorerUrl && (
                <a href={verifyResult.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300">
                  Cardanoscan <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </form>

        <div className={cn('xl:col-span-2 border rounded-lg overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
          <div className={cn('p-4 border-b flex flex-wrap items-center justify-between gap-3', theme === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
            <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Evidence Records</h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={recordType}
                onChange={(event) => setRecordType(event.target.value)}
                className={cn('border rounded-lg px-3 py-1.5 text-xs', theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700')}
              >
                <option value="all">All types</option>
                <option value="Alert">Alert</option>
                <option value="BlockIP">Block IP</option>
                <option value="AuditLog">Audit Log</option>
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={cn('border rounded-lg px-3 py-1.5 text-xs', theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700')}
              >
                <option value="all">All status</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="m-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={cn('text-[10px] uppercase tracking-wider', theme === 'dark' ? 'bg-slate-950/50 text-slate-500' : 'bg-slate-50 text-slate-500')}>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Proof</th>
                  <th className="px-4 py-3 font-medium">Data Hash</th>
                  <th className="px-4 py-3 font-medium">TxHash</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y', theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100')}>
                {records.map((record) => (
                  <tr key={record.id} className={theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                    <td className={cn('px-4 py-3 text-sm font-bold', theme === 'dark' ? 'text-slate-200' : 'text-slate-800')}>{record.recordType}</td>
                    <td className="px-4 py-3">
                      <BlockchainBadge proof={record} theme={theme} compact />
                    </td>
                    <td className="px-4 py-3">
                      <HashText value={record.dataHash} theme={theme} />
                    </td>
                    <td className="px-4 py-3">
                      <HashText value={record.txHash || ''} theme={theme} empty="Pending" />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatRelativeCompactTruoc(record.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => fillFromRecord(record)}
                          disabled={!record.txHash}
                          className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
                          title="Use for verification"
                        >
                          <Search size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(record.dataHash, record.id)}
                          className={cn('p-2 rounded-lg transition-colors', copied === record.id ? 'bg-emerald-600 text-white' : theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
                          title="Copy hash"
                        >
                          {copied === record.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      No blockchain records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatBlock = ({ theme, icon: Icon, label, value, tone }: {
  theme: Theme;
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
}) => (
  <div className={cn('border rounded-lg p-4', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{value.toLocaleString()}</p>
      </div>
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center',
        tone === 'blue' && 'bg-blue-500/10 text-blue-400',
        tone === 'emerald' && 'bg-emerald-500/10 text-emerald-400',
        tone === 'amber' && 'bg-amber-500/10 text-amber-400',
        tone === 'rose' && 'bg-rose-500/10 text-rose-400'
      )}>
        <Icon size={20} />
      </div>
    </div>
  </div>
);

const HashText = ({ value, theme, empty = 'None' }: { value: string; theme: Theme; empty?: string }) => (
  <code className={cn('inline-block max-w-[180px] truncate rounded px-2 py-1 text-xs font-mono', theme === 'dark' ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-700')} title={value || empty}>
    {value ? truncateMiddle(value, 10, 8) : empty}
  </code>
);

const truncateMiddle = (value: string, start = 8, end = 6) =>
  value.length <= start + end + 3 ? value : `${value.slice(0, start)}...${value.slice(-end)}`;
