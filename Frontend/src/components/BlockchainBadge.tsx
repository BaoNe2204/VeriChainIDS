import React from 'react';
import { CheckCircle2, Clock3, ExternalLink, FlaskConical, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, BlockchainRecord } from '../types';

interface BlockchainBadgeProps {
  proof?: BlockchainRecord | null;
  theme: Theme;
  compact?: boolean;
}

export const BlockchainBadge = ({ proof, theme, compact = false }: BlockchainBadgeProps) => {
  const isDemo = proof?.network?.toLowerCase().includes('demo') ?? false;
  const isConfirmed = proof?.status === 'Confirmed';
  const isFailed = proof?.status === 'Failed';
  const label = !proof
    ? 'Pending Chain'
    : isFailed
      ? 'Chain Failed'
      : isDemo
        ? 'Demo Proof'
        : isConfirmed
          ? 'Verified on Cardano'
          : 'Pending Chain';

  const Icon = !proof ? Clock3 : isFailed ? ShieldAlert : isDemo ? FlaskConical : isConfirmed ? CheckCircle2 : Clock3;
  const tone = !proof
    ? 'amber'
    : isFailed
      ? 'rose'
      : isDemo
        ? 'cyan'
        : isConfirmed
          ? 'emerald'
          : 'amber';

  const className = cn(
    'inline-flex items-center gap-1.5 rounded-md border font-bold transition-colors whitespace-nowrap',
    compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs',
    tone === 'emerald' && (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'),
    tone === 'cyan' && (theme === 'dark' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 text-cyan-700 border-cyan-200'),
    tone === 'amber' && (theme === 'dark' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200'),
    tone === 'rose' && (theme === 'dark' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200')
  );

  const content = (
    <>
      <Icon size={compact ? 12 : 14} />
      <span>{label}</span>
      {proof?.explorerUrl && <ExternalLink size={compact ? 11 : 13} />}
    </>
  );

  if (proof?.explorerUrl) {
    return (
      <a
        href={proof.explorerUrl}
        target="_blank"
        rel="noreferrer"
        className={className}
        title={`${proof.network} tx: ${proof.txHash}`}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={className} title={proof?.txHash ? `${proof.network} tx: ${proof.txHash}` : 'Waiting for evidence hash anchoring'}>
      {content}
    </span>
  );
};
