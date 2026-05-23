import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, FileDown, Link2, Search, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { BlockchainApi, type BlockchainVerifyResult } from '../services/api';

interface PublicBlockchainVerifyProps {
  theme: Theme;
}

export const PublicBlockchainVerify = ({ theme }: PublicBlockchainVerifyProps) => {
  const [txHash, setTxHash] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BlockchainVerifyResult | null>(null);
  const [error, setError] = useState('');

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!txHash.trim() || !expectedHash.trim()) return;

    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await BlockchainApi.verifyPublic(txHash.trim(), expectedHash.trim());
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.message || 'Verification failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadProof = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verichainids-proof-${result.txHash.slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('min-h-screen px-4 py-10 font-sans', theme === 'dark' ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900')}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <Link2 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Public Blockchain Verification</h1>
            <p className="text-sm text-slate-500">VeriChainIDS evidence proof</p>
          </div>
        </div>

        <form
          onSubmit={verify}
          className={cn('rounded-lg border p-5 space-y-4', theme === 'dark' ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white shadow-sm')}
        >
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">TxHash</span>
            <input
              value={txHash}
              onChange={(event) => setTxHash(event.target.value)}
              className={cn('w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none', theme === 'dark' ? 'border-slate-800 bg-slate-950 text-slate-100 focus:border-cyan-500' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-cyan-500')}
              placeholder="Cardano transaction hash"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Evidence Hash</span>
            <textarea
              value={expectedHash}
              onChange={(event) => setExpectedHash(event.target.value)}
              rows={3}
              className={cn('w-full resize-none rounded-lg border px-3 py-2 text-sm font-mono outline-none', theme === 'dark' ? 'border-slate-800 bg-slate-950 text-slate-100 focus:border-cyan-500' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-cyan-500')}
              placeholder="64-character SHA-256 hash"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !txHash.trim() || !expectedHash.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cyan-500 disabled:opacity-60"
          >
            <Search size={16} />
            {loading ? 'Verifying...' : 'Verify Evidence'}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {error}
          </div>
        )}

        {result && (
          <div
            className={cn(
              'rounded-lg border p-5 space-y-4',
              result.isValid
                ? theme === 'dark' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50'
                : theme === 'dark' ? 'border-rose-500/30 bg-rose-500/10' : 'border-rose-200 bg-rose-50'
            )}
          >
            <div className="flex items-center gap-2">
              {result.isValid ? <CheckCircle2 size={20} className="text-emerald-500" /> : <XCircle size={20} className="text-rose-500" />}
              <h2 className={cn('font-bold', result.isValid ? 'text-emerald-500' : 'text-rose-500')}>
                {result.isValid ? 'Valid Evidence' : 'Hash Mismatch'}
              </h2>
            </div>
            <p className={cn('text-sm', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>{result.message}</p>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <ProofField label="Source" value={result.source} theme={theme} />
              <ProofField label="On-chain hash" value={result.onChainHash || 'None'} theme={theme} />
            </div>
            <div className="flex flex-wrap gap-2">
              {result.explorerUrl && (
                <a
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  <ExternalLink size={14} />
                  Open Cardanoscan
                </a>
              )}
              <button
                type="button"
                onClick={downloadProof}
                className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold', theme === 'dark' ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300')}
              >
                <FileDown size={14} />
                Download Proof
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ProofField = ({ label, value, theme }: { label: string; value: string; theme: Theme }) => (
  <div className={cn('rounded-lg border p-3', theme === 'dark' ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-white')}>
    <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">{label}</p>
    <code className={cn('block truncate text-xs', theme === 'dark' ? 'text-slate-200' : 'text-slate-800')} title={value}>
      {value}
    </code>
  </div>
);
