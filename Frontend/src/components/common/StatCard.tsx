import React from 'react';
import { cn } from '../../lib/utils';
import { Theme } from '../../types';

interface StatCardProps {
  label: string;
  value: string;
  icon: any;
  trend?: string;
  color: string;
  theme: Theme;
}

export const StatCard = ({ label, value, icon: Icon, trend, color, theme }: StatCardProps) => (
  <div className={cn("border p-5 rounded-xl backdrop-blur-sm transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon size={20} className="text-white" />
      </div>
      {trend && (
        <span className={cn("text-xs font-medium px-2 py-1 rounded-full", trend.startsWith('+') ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-500/10 text-emerald-600")}>
          {trend}
        </span>
      )}
    </div>
    <p className={cn("text-sm mb-1", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>{label}</p>
    <h3 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{value}</h3>
  </div>
);
