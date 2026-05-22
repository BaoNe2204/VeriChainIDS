import React from 'react';
import { cn } from '../../lib/utils';
import { Theme } from '../../types';

interface ToggleProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  label: string;
  theme: Theme;
}

export const Toggle = ({ enabled, onChange, label, theme }: ToggleProps) => (
  <div className="flex items-center justify-between py-3">
    <span className={cn("text-sm transition-colors", theme === 'dark' ? "text-slate-300" : "text-slate-600")}>{label}</span>
    <button 
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
        enabled ? "bg-blue-600" : (theme === 'dark' ? "bg-slate-700" : "bg-slate-200")
      )}
    >
      <span 
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          enabled ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  </div>
);
