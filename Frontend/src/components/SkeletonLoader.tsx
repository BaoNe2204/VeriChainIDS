import React from 'react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface SkeletonProps {
  theme: Theme;
  className?: string;
}

export const Skeleton = ({ theme, className, ...rest }: SkeletonProps & { key?: React.Key }) => (
  <div
    className={cn(
      "animate-pulse rounded",
      theme === 'dark' ? "bg-slate-800" : "bg-slate-200",
      className
    )}
    {...rest}
  />
);

export const DashboardSkeleton = ({ theme }: { theme: Theme }) => (
  <div className="space-y-8">
    {/* Stats Cards Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "border p-5 rounded-xl",
            theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
          )}
        >
          <Skeleton theme={theme} className="h-10 w-10 rounded-lg mb-4" />
          <Skeleton theme={theme} className="h-4 w-24 mb-2" />
          <Skeleton theme={theme} className="h-8 w-32" />
        </div>
      ))}
    </div>

    {/* Chart Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div
        className={cn(
          "lg:col-span-2 border p-6 rounded-xl",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}
      >
        <Skeleton theme={theme} className="h-6 w-48 mb-6" />
        <Skeleton theme={theme} className="h-[300px] w-full" />
      </div>

      <div
        className={cn(
          "border p-6 rounded-xl",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}
      >
        <Skeleton theme={theme} className="h-6 w-40 mb-6" />
        <Skeleton theme={theme} className="h-[250px] w-full rounded-full" />
      </div>
    </div>

    {/* Table Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div
        className={cn(
          "border p-5 rounded-xl",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}
      >
        <Skeleton theme={theme} className="h-6 w-48 mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} theme={theme} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>

      <div
        className={cn(
          "lg:col-span-2 border p-5 rounded-xl",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}
      >
        <Skeleton theme={theme} className="h-6 w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} theme={theme} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const TableSkeleton = ({ theme, rows = 5 }: { theme: Theme; rows?: number }) => (
  <div className="space-y-2">
    {[...Array(rows)].map((_, i) => (
      <Skeleton key={i} theme={theme} className="h-12 w-full" />
    ))}
  </div>
);

export const CardSkeleton = ({ theme }: { theme: Theme }) => (
  <div
    className={cn(
      "border p-6 rounded-xl",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}
  >
    <Skeleton theme={theme} className="h-6 w-32 mb-4" />
    <Skeleton theme={theme} className="h-4 w-full mb-2" />
    <Skeleton theme={theme} className="h-4 w-3/4" />
  </div>
);

export const AgentListSkeleton = ({ theme, count = 5 }: { theme: Theme; count?: number }) => (
  <div
    className={cn(
      "border rounded-xl overflow-hidden",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}
  >
    <div className={cn("p-5 border-b", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
      <Skeleton theme={theme} className="h-6 w-48" />
    </div>
    <div className="p-5 space-y-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3 rounded-lg border"
          style={{ borderColor: theme === 'dark' ? 'rgba(51,65,85,0.5)' : 'rgba(226,232,240,0.5)' }}>
          <div className="flex items-center gap-3">
            <Skeleton theme={theme} className="w-2.5 h-2.5 rounded-full" />
            <div>
              <Skeleton theme={theme} className="h-4 w-32 mb-1" />
              <Skeleton theme={theme} className="h-3 w-24" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <Skeleton theme={theme} className="h-2 w-6 mb-1" />
              <Skeleton theme={theme} className="h-4 w-8" />
            </div>
            <div className="text-right">
              <Skeleton theme={theme} className="h-2 w-6 mb-1" />
              <Skeleton theme={theme} className="h-4 w-8" />
            </div>
            <Skeleton theme={theme} className="w-4 h-4 rounded" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
