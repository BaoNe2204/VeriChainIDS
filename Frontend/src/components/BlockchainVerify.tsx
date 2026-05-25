import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  GitCompareArrows,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GitBranch,
  Globe2,
  Link2,
  QrCode,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Share2,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import {
  BlockchainApi,
  type BlockchainHealth,
  type BlockchainIntegrityReport,
  type BlockchainProofReport,
  type BlockchainRecord,
  type BlockchainStats,
  type BlockchainVerifyResult,
  type IncidentCustodyReport,
  type IpReputationResult,
  type ThreatIntelReportResult,
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
  const [health, setHealth] = useState<BlockchainHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordType, setRecordType] = useState('all');
  const [status, setStatus] = useState('all');
  const [txHash, setTxHash] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<BlockchainVerifyResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [retryingId, setRetryingId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [comparingId, setComparingId] = useState('');
  const [integrityReport, setIntegrityReport] = useState<BlockchainIntegrityReport | null>(null);
  const [intelIp, setIntelIp] = useState('');
  const [intelAttackType, setIntelAttackType] = useState('SSH Brute Force');
  const [intelSeverity, setIntelSeverity] = useState('High');
  const [reputation, setReputation] = useState<IpReputationResult | null>(null);
  const [reportResult, setReportResult] = useState<ThreatIntelReportResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelReporting, setIntelReporting] = useState(false);
  const [intelError, setIntelError] = useState('');
  const [custodyTicketId, setCustodyTicketId] = useState('');
  const [custodyReport, setCustodyReport] = useState<IncidentCustodyReport | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [custodyAnchoring, setCustodyAnchoring] = useState(false);
  const [custodyError, setCustodyError] = useState('');
  const [publicProof, setPublicProof] = useState<{
    record: BlockchainRecord;
    url: string;
    qrDataUrl: string;
  } | null>(null);

  const filters = useMemo(() => ({
    recordType: recordType === 'all' ? undefined : recordType,
    status: status === 'all' ? undefined : status,
  }), [recordType, status]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [recordsRes, statsRes, healthRes] = await Promise.all([
        BlockchainApi.getRecords(1, 50, filters),
        BlockchainApi.getStats(),
        BlockchainApi.getHealth(),
      ]);

      if (recordsRes.success && recordsRes.data) {
        setRecords(recordsRes.data.items);
      } else {
        setError(recordsRes.message || 'Unable to load blockchain records.');
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }

      if (healthRes.success && healthRes.data) {
        setHealth(healthRes.data);
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

  const buildPublicProofUrl = (record: BlockchainRecord) => {
    const url = new URL('/verifier', window.location.origin);
    url.searchParams.set('txHash', record.txHash || '');
    url.searchParams.set('hash', record.dataHash);
    url.searchParams.set('type', record.recordType);
    return url.toString();
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

  const retryRecord = async (record: BlockchainRecord) => {
    setRetryingId(record.id);
    setError('');
    try {
      const res = await BlockchainApi.retryRecord(record.id);
      if (res.success) {
        await loadData();
      } else {
        setError(res.message || 'Retry failed.');
      }
    } finally {
      setRetryingId('');
    }
  };

  const confirmRecord = async (record: BlockchainRecord) => {
    setRetryingId(record.id);
    setError('');
    try {
      const res = await BlockchainApi.confirmRecord(record.id);
      if (res.success) {
        await loadData();
      } else {
        setError(res.message || 'Confirmation check failed.');
      }
    } finally {
      setRetryingId('');
    }
  };

  const showPublicProof = async (record: BlockchainRecord) => {
    if (!record.txHash) return;

    const url = buildPublicProofUrl(record);
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    setPublicProof({ record, url, qrDataUrl });
  };

  const downloadProofReport = async (record: BlockchainRecord, format: 'json' | 'pdf') => {
    setDownloadingId(record.id);
    setError('');
    try {
      const res = await BlockchainApi.getProofReport(record.id);
      if (!res.success || !res.data) {
        setError(res.message || 'Proof report failed.');
        return;
      }
      const blob = format === 'json'
        ? new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
        : new Blob([createProofPdf(res.data)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verichainids-proof-${record.recordType}-${record.id.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId('');
    }
  };

  const compareIntegrity = async (record: BlockchainRecord) => {
    setComparingId(record.id);
    setError('');
    try {
      const res = await BlockchainApi.getIntegrityReport(record.id);
      if (res.success && res.data) {
        if (res.data.isTampered || res.data.changes.length > 0) {
          setIntegrityReport(res.data);
        } else {
          setIntegrityReport(null);
        }
      } else {
        setError(res.message || 'Compare failed.');
      }
    } finally {
      setComparingId('');
    }
  };

  const queryReputation = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!intelIp.trim()) return;

    setIntelLoading(true);
    setIntelError('');
    setReputation(null);
    setReportResult(null);
    try {
      const res = await BlockchainApi.getIpReputation(intelIp.trim());
      if (res.success && res.data) {
        setReputation(res.data);
      } else {
        setIntelError(res.message || 'Reputation lookup failed.');
      }
    } finally {
      setIntelLoading(false);
    }
  };

  const reportThreatIntel = async () => {
    if (!intelIp.trim()) return;

    setIntelReporting(true);
    setIntelError('');
    setReportResult(null);
    try {
      const res = await BlockchainApi.reportIp(intelIp.trim(), intelAttackType.trim() || 'Unknown', intelSeverity);
      if (res.success && res.data) {
        setReportResult(res.data);
        setReputation((prev) => prev ? {
          ...prev,
          reportCount: prev.reportCount + 1,
          isGloballyBlocked: prev.isGloballyBlocked || prev.reportCount + 1 >= 5,
          lastReported: new Date().toISOString(),
        } : prev);
        await loadData();
      } else {
        setIntelError(res.message || 'Threat intel report failed.');
      }
    } finally {
      setIntelReporting(false);
    }
  };

  const loadCustodyChain = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!custodyTicketId.trim()) return;

    setCustodyLoading(true);
    setCustodyError('');
    setCustodyReport(null);
    try {
      const res = await BlockchainApi.getTicketCustody(custodyTicketId.trim());
      if (res.success && res.data) {
        setCustodyReport(res.data);
      } else {
        setCustodyError(res.message || 'Custody chain lookup failed.');
      }
    } finally {
      setCustodyLoading(false);
    }
  };

  const anchorCustodyChain = async () => {
    if (!custodyTicketId.trim()) return;

    setCustodyAnchoring(true);
    setCustodyError('');
    try {
      const res = await BlockchainApi.anchorTicketCustody(custodyTicketId.trim());
      if (res.success && res.data) {
        await loadCustodyChain();
        await loadData();
      } else {
        setCustodyError(res.message || 'Custody chain anchoring failed.');
      }
    } finally {
      setCustodyAnchoring(false);
    }
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

      {health && (
        <div className={cn('border rounded-lg p-4', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
          <div className="mb-4 flex items-center gap-2">
            <Activity size={18} className="text-cyan-400" />
            <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Blockchain Health</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HealthItem theme={theme} label="Network" value={health.network} />
            <HealthItem theme={theme} label="Mode" value={health.submissionMode} />
            <HealthItem theme={theme} label="Submitter" value={health.submitterStatus} tone={health.submitterOnline === false ? 'rose' : health.submitterOnline === true ? 'emerald' : 'slate'} />
            <HealthItem theme={theme} label="Wallet" value={health.walletFunded == null ? 'Unknown' : health.walletFunded ? `${health.walletAda ?? 0} ADA` : 'Not funded'} tone={health.walletFunded === false ? 'rose' : health.walletFunded === true ? 'emerald' : 'slate'} />
            <HealthItem theme={theme} label="Blockfrost" value={health.blockfrostConfigured ? 'Configured' : 'Missing'} tone={health.blockfrostConfigured ? 'emerald' : 'rose'} />
            <HealthItem theme={theme} label="Last Submit" value={health.lastSuccessfulSubmit ? formatRelativeCompactTruoc(health.lastSuccessfulSubmit) : 'None'} />
            <HealthItem theme={theme} label="Address" value={health.cardanoAddress ? truncateMiddle(health.cardanoAddress, 12, 8) : 'None'} title={health.cardanoAddress || undefined} />
            <HealthItem theme={theme} label="Last Error" value={health.lastError || 'None'} tone={health.lastError ? 'rose' : 'slate'} title={health.lastError || undefined} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatBlock theme={theme} icon={Database} label="Total Records" value={stats.totalRecords} tone="blue" />
        <StatBlock theme={theme} icon={CheckCircle2} label="Confirmed" value={stats.confirmedRecords} tone="emerald" />
        <StatBlock theme={theme} icon={Clock3} label="Pending" value={stats.pendingRecords} tone="amber" />
        <StatBlock theme={theme} icon={AlertTriangle} label="Failed" value={stats.failedRecords} tone="rose" />
      </div>

      {publicProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={cn('w-full max-w-md rounded-lg border p-5 shadow-2xl', theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white')}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Public Proof QR</h3>
                <p className="mt-1 text-xs text-slate-500">{publicProof.record.recordType} · {truncateMiddle(publicProof.record.id, 8, 6)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPublicProof(null)}
                className={cn('rounded-lg p-2 transition-colors', theme === 'dark' ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                title="Close"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="flex justify-center rounded-lg bg-white p-4">
              <img src={publicProof.qrDataUrl} alt="Public proof QR" className="h-56 w-56" />
            </div>

            <div className={cn('mt-4 rounded-lg border p-3', theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Verify Link</p>
              <code className={cn('block break-all text-xs', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                {publicProof.url}
              </code>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(publicProof.url, 'public-proof-url')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-cyan-500"
              >
                {copied === 'public-proof-url' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                Copy Link
              </button>
              <a
                href={publicProof.url}
                target="_blank"
                rel="noreferrer"
                className={cn('inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors', theme === 'dark' ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300')}
              >
                <ExternalLink size={14} />
                Open Verify
              </a>
            </div>
          </div>
        </div>
      )}

      <div className={cn('border rounded-lg p-5', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RadioTower size={18} className="text-violet-400" />
            <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Threat Intel Sharing</h3>
          </div>
          {reportResult?.explorerUrl && (
            <a href={reportResult.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300">
              Cardanoscan <ExternalLink size={12} />
            </a>
          )}
        </div>

        <form onSubmit={queryReputation} className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr_160px_160px]">
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">IP Address</span>
            <input
              value={intelIp}
              onChange={(event) => setIntelIp(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-violet-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-violet-500')}
              placeholder="203.0.113.45"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Attack Type</span>
            <input
              value={intelAttackType}
              onChange={(event) => setIntelAttackType(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-violet-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-violet-500')}
              placeholder="SSH Brute Force"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Severity</span>
            <select
              value={intelSeverity}
              onChange={(event) => setIntelSeverity(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-violet-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-violet-500')}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={intelLoading || !intelIp.trim()}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
              title="Lookup reputation"
            >
              <Search size={16} />
              {intelLoading ? 'Checking' : 'Check'}
            </button>
            <button
              type="button"
              onClick={reportThreatIntel}
              disabled={intelReporting || !intelIp.trim()}
              className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors disabled:opacity-60', theme === 'dark' ? 'bg-slate-800 text-violet-300 hover:bg-slate-700' : 'bg-violet-100 text-violet-700 hover:bg-violet-200')}
              title="Report to blockchain threat intel"
            >
              {intelReporting ? <RefreshCw size={16} className="animate-spin" /> : <Share2 size={16} />}
            </button>
          </div>
        </form>

        {intelError && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {intelError}
          </div>
        )}

        {(reputation || reportResult) && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {reputation && (
              <>
                <ThreatIntelMetric theme={theme} icon={Globe2} label="Reports" value={String(reputation.reportCount)} tone={reputation.reportCount > 0 ? 'amber' : 'slate'} />
                <ThreatIntelMetric theme={theme} icon={ShieldCheck} label="Reputation" value={reputation.isGloballyBlocked ? 'High Risk' : reputation.reportCount > 0 ? 'Watched' : 'Clean'} tone={reputation.isGloballyBlocked ? 'rose' : reputation.reportCount > 0 ? 'amber' : 'emerald'} />
                <ThreatIntelMetric theme={theme} icon={Activity} label="Severity Score" value={`${Math.round(reputation.severityScore * 100)}%`} tone={reputation.severityScore >= 0.9 ? 'rose' : reputation.severityScore > 0 ? 'amber' : 'slate'} />
                <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase text-slate-500">IP Hash</p>
                    <button type="button" onClick={() => copyText(reputation.ipHash, 'intel-hash')} className="text-slate-500 hover:text-violet-400" title="Copy IP hash">
                      {copied === 'intel-hash' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <code className={cn('mt-1 block truncate text-xs font-mono', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')} title={reputation.ipHash}>
                    {truncateMiddle(reputation.ipHash, 14, 10)}
                  </code>
                </div>
              </>
            )}
            {reportResult && (
              <div className={cn('rounded-lg border px-3 py-2 md:col-span-2 xl:col-span-4', theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-emerald-500">Threat Intel Anchored</p>
                    <p className={cn('mt-1 text-sm', theme === 'dark' ? 'text-slate-200' : 'text-slate-800')}>
                      {reportResult.txHash ? `Tx ${truncateMiddle(reportResult.txHash, 14, 10)}` : 'Waiting for transaction hash'}
                    </p>
                  </div>
                  <BlockchainBadge proof={reportResult.record} theme={theme} compact />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cn('border rounded-lg p-5', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-emerald-400" />
            <h3 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Chain of Custody</h3>
          </div>
          {custodyReport?.blockchainProof?.explorerUrl && (
            <a href={custodyReport.blockchainProof.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300">
              Cardanoscan <ExternalLink size={12} />
            </a>
          )}
        </div>

        <form onSubmit={loadCustodyChain} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_150px_150px]">
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Ticket ID</span>
            <input
              value={custodyTicketId}
              onChange={(event) => setCustodyTicketId(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors', theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500')}
              placeholder="Paste incident ticket id"
            />
          </label>
          <button
            type="submit"
            disabled={custodyLoading || !custodyTicketId.trim()}
            className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            <Search size={16} />
            {custodyLoading ? 'Loading' : 'View Chain'}
          </button>
          <button
            type="button"
            onClick={anchorCustodyChain}
            disabled={custodyAnchoring || !custodyTicketId.trim()}
            className={cn('mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors disabled:opacity-60', theme === 'dark' ? 'bg-slate-800 text-emerald-300 hover:bg-slate-700' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200')}
          >
            {custodyAnchoring ? <RefreshCw size={16} className="animate-spin" /> : <Link2 size={16} />}
            Anchor
          </button>
        </form>

        {custodyError && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {custodyError}
          </div>
        )}

        {custodyReport && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <ThreatIntelMetric theme={theme} icon={FileCheck2} label="Ticket" value={custodyReport.ticketNumber} tone="emerald" />
              <ThreatIntelMetric theme={theme} icon={Activity} label="Events" value={String(custodyReport.eventCount)} tone="slate" />
              <ThreatIntelMetric theme={theme} icon={GitBranch} label="Status" value={custodyReport.status} tone={custodyReport.status === 'CLOSED' ? 'emerald' : 'amber'} />
              <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Final Chain Hash</p>
                  <button type="button" onClick={() => copyText(custodyReport.finalChainHash, 'custody-hash')} className="text-slate-500 hover:text-emerald-400" title="Copy chain hash">
                    {copied === 'custody-hash' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <code className={cn('mt-1 block truncate text-xs font-mono', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')} title={custodyReport.finalChainHash}>
                  {truncateMiddle(custodyReport.finalChainHash, 14, 10)}
                </code>
              </div>
            </div>

            {custodyReport.blockchainProof && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <span className="text-xs font-bold uppercase text-emerald-500">Custody chain anchored</span>
                <BlockchainBadge proof={custodyReport.blockchainProof} theme={theme} compact />
              </div>
            )}

            <div className={cn('overflow-hidden rounded-lg border', theme === 'dark' ? 'border-slate-800' : 'border-slate-200')}>
              <table className="w-full text-left">
                <thead>
                  <tr className={cn('text-[10px] uppercase tracking-wider', theme === 'dark' ? 'bg-slate-950/50 text-slate-500' : 'bg-slate-50 text-slate-500')}>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Summary</th>
                    <th className="px-3 py-2 font-medium">Step Hash</th>
                  </tr>
                </thead>
                <tbody className={cn('divide-y text-sm', theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100')}>
                  {custodyReport.events.slice(0, 12).map((event) => (
                    <tr key={`${event.sequence}-${event.stepHash}`} className={theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 text-xs text-slate-500">{event.sequence}</td>
                      <td className={cn('px-3 py-2 text-xs font-bold', theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700')}>{event.eventType}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{event.actor}</td>
                      <td className={cn('max-w-[360px] px-3 py-2 text-xs', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>{event.summary}</td>
                      <td className="px-3 py-2"><HashText value={event.stepHash} theme={theme} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                <option value="ThreatIntel">Threat Intel</option>
                <option value="CustodyChain">Custody Chain</option>
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

          {integrityReport && (
            <IntegrityComparePanel
              report={integrityReport}
              theme={theme}
              onClose={() => setIntegrityReport(null)}
            />
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
                      {(record.retryCount ?? 0) > 0 && (
                        <p className="mt-1 text-[10px] text-slate-500">Retry {record.retryCount}</p>
                      )}
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
                          onClick={() => showPublicProof(record)}
                          disabled={!record.txHash}
                          className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200')}
                          title="Public proof QR"
                        >
                          <QrCode size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => compareIntegrity(record)}
                          disabled={comparingId === record.id || record.recordType === 'ThreatIntel'}
                          className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-violet-500/10 text-violet-300 hover:bg-violet-500/20' : 'bg-violet-100 text-violet-700 hover:bg-violet-200')}
                          title={record.recordType === 'ThreatIntel' ? 'Threat intel stores a privacy-preserving snapshot' : 'Compare / Xem thay doi'}
                        >
                          <GitCompareArrows size={14} className={comparingId === record.id ? 'animate-spin' : ''} />
                        </button>
                        {record.status === 'Failed' && (
                          <button
                            type="button"
                            onClick={() => retryRecord(record)}
                            disabled={retryingId === record.id}
                            className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-amber-100 text-amber-700 hover:bg-amber-200')}
                            title="Retry transaction"
                          >
                            <RotateCcw size={14} className={retryingId === record.id ? 'animate-spin' : ''} />
                          </button>
                        )}
                        {record.status === 'Pending' && record.txHash && !record.network.toLowerCase().includes('demo') && (
                          <button
                            type="button"
                            onClick={() => confirmRecord(record)}
                            disabled={retryingId === record.id}
                            className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200')}
                            title="Check confirmation"
                          >
                            <RefreshCw size={14} className={retryingId === record.id ? 'animate-spin' : ''} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => downloadProofReport(record, 'json')}
                          disabled={downloadingId === record.id}
                          className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
                          title="Download JSON proof"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadProofReport(record, 'pdf')}
                          disabled={downloadingId === record.id}
                          className={cn('p-2 rounded-lg transition-colors disabled:opacity-40', theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
                          title="Download PDF proof"
                        >
                          <FileText size={14} />
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

const IntegrityComparePanel = ({ report, theme, onClose }: {
  report: BlockchainIntegrityReport;
  theme: Theme;
  onClose: () => void;
}) => {
  const hasChanges = report.changes.length > 0;
  const tone = report.isTampered ? 'rose' : 'emerald';

  return (
    <div className={cn('m-4 rounded-lg border p-4', theme === 'dark' ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg', tone === 'rose' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400')}>
            {report.isTampered ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className={cn('font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Compare / Xem thay doi</h4>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', tone === 'rose' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-500')}>
                {report.isTampered ? 'Changed' : 'Clean'}
              </span>
            </div>
            <p className={cn('mt-1 text-sm', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>{report.verdict}</p>
            <p className="mt-1 text-xs text-slate-500">
              {report.recordType} · {truncateMiddle(report.entityId, 12, 8)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn('rounded-lg p-2 transition-colors', theme === 'dark' ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900')}
          title="Close"
        >
          <XCircle size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IntegrityCheck theme={theme} label="Snapshot" value={report.snapshotContentMatchesStoredHash} />
        <IntegrityCheck theme={theme} label="Current Data" value={report.currentHashMatchesStoredHash} />
        <IntegrityCheck theme={theme} label="Cardano Hash" value={report.storedHashMatchesOnChain} />
        <IntegrityCheck theme={theme} label="Field Changes" value={!hasChanges} text={hasChanges ? `${report.changes.length} changed` : 'No changes'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <HashLine theme={theme} label="Original DataHash" value={report.dataHash} />
        <HashLine theme={theme} label="CurrentHash" value={report.currentHash} />
        <HashLine theme={theme} label="On-chain Hash" value={report.onChainHash} />
      </div>

      <div className={cn('mt-4 overflow-hidden rounded-lg border', theme === 'dark' ? 'border-slate-800' : 'border-slate-200')}>
        <table className="w-full text-left">
          <thead>
            <tr className={cn('text-[10px] uppercase tracking-wider', theme === 'dark' ? 'bg-slate-900 text-slate-500' : 'bg-white text-slate-500')}>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Cu</th>
              <th className="px-3 py-2 font-medium">Moi</th>
            </tr>
          </thead>
          <tbody className={cn('divide-y text-sm', theme === 'dark' ? 'divide-slate-800' : 'divide-slate-200')}>
            {report.changes.map((change) => (
              <tr key={`${change.field}-${change.changeType}`}>
                <td className={cn('px-3 py-2 font-mono text-xs', theme === 'dark' ? 'text-cyan-300' : 'text-cyan-700')}>
                  {change.field}
                </td>
                <td className={cn('max-w-[220px] break-all px-3 py-2 font-mono text-xs', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                  {formatIntegrityValue(change.oldValue)}
                </td>
                <td className={cn('max-w-[220px] break-all px-3 py-2 font-mono text-xs', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>
                  {formatIntegrityValue(change.newValue)}
                </td>
              </tr>
            ))}
            {!hasChanges && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-500">
                  Original snapshot and current data have the same field values.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const IntegrityCheck = ({ theme, label, value, text }: {
  theme: Theme;
  label: string;
  value: boolean | null;
  text?: string;
}) => {
  const tone = value === null ? 'slate' : value ? 'emerald' : 'rose';
  const display = text || (value === null ? 'Unavailable' : value ? 'Match' : 'Mismatch');

  return (
    <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200')}>
      <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
      <p className={cn(
        'mt-1 text-sm font-bold',
        tone === 'slate' && (theme === 'dark' ? 'text-slate-300' : 'text-slate-700'),
        tone === 'emerald' && 'text-emerald-500',
        tone === 'rose' && 'text-rose-500'
      )}>
        {display}
      </p>
    </div>
  );
};

const HashLine = ({ theme, label, value }: {
  theme: Theme;
  label: string;
  value: string | null;
}) => (
  <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200')}>
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <code className={cn('mt-1 block truncate text-xs font-mono', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')} title={value || 'None'}>
      {value ? truncateMiddle(value, 12, 10) : 'None'}
    </code>
  </div>
);

const formatIntegrityValue = (value: string | null) =>
  value === null || value === '' ? 'None' : value;

const HealthItem = ({ theme, label, value, tone = 'slate', title }: {
  theme: Theme;
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'rose';
  title?: string;
}) => (
  <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200')}>
    <p className="text-[10px] uppercase font-bold text-slate-500">{label}</p>
    <p
      className={cn(
        'mt-1 truncate text-sm font-bold',
        tone === 'slate' && (theme === 'dark' ? 'text-slate-200' : 'text-slate-800'),
        tone === 'emerald' && 'text-emerald-500',
        tone === 'rose' && 'text-rose-500'
      )}
      title={title || value}
    >
      {value}
    </p>
  </div>
);

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

const ThreatIntelMetric = ({ theme, icon: Icon, label, value, tone }: {
  theme: Theme;
  icon: React.ElementType;
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
}) => (
  <div className={cn('rounded-lg border px-3 py-2', theme === 'dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200')}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
        <p className={cn(
          'mt-1 truncate text-sm font-bold',
          tone === 'slate' && (theme === 'dark' ? 'text-slate-300' : 'text-slate-700'),
          tone === 'emerald' && 'text-emerald-500',
          tone === 'amber' && 'text-amber-500',
          tone === 'rose' && 'text-rose-500'
        )}>
          {value}
        </p>
      </div>
      <Icon
        size={18}
        className={cn(
          tone === 'slate' && 'text-slate-500',
          tone === 'emerald' && 'text-emerald-500',
          tone === 'amber' && 'text-amber-500',
          tone === 'rose' && 'text-rose-500'
        )}
      />
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

const createProofPdf = (report: BlockchainProofReport): string => {
  const lines = [
    'VeriChainIDS Blockchain Proof Report',
    `Evidence ID: ${report.evidenceId}`,
    `Record Type: ${report.recordType}`,
    `Entity ID: ${report.entityId}`,
    `Status: ${report.status}`,
    `Verify Result: ${report.verifyResult === null ? 'Unknown' : report.verifyResult ? 'Valid' : 'Invalid'}`,
    `Verify Message: ${report.verifyMessage}`,
    `Data Hash: ${report.dataHash}`,
    `TxHash: ${report.txHash || 'None'}`,
    `Network: ${report.network}`,
    `Metadata Label: ${report.metadataLabel}`,
    `Block Height: ${report.blockHeight ?? 'None'}`,
    `Created At: ${report.createdAt}`,
    `Confirmed At: ${report.confirmedAt || 'None'}`,
    `Retry Count: ${report.retryCount}`,
    `Cardanoscan: ${report.cardanoscanLink || 'None'}`,
    `Snapshot Hash: ${report.snapshot?.snapshotHash || 'None'}`,
  ];

  const content = lines
    .slice(0, 36)
    .map((line, index) => `BT /F1 10 Tf 48 ${760 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n');
  pdf += `\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
};

const escapePdfText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, 112);
