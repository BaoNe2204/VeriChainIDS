import React from 'react';
import { Server, ChevronDown, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import type { Agent } from '../types';

interface ServerSelectorProps {
  theme: Theme;
  servers: Agent[];
  selectedServerId: string | null;
  onSelectServer: (serverId: string | null) => void;
  showAllOption?: boolean;
}

export const ServerSelector = ({
  theme,
  servers,
  selectedServerId,
  onSelectServer,
  showAllOption = true,
}: ServerSelectorProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedServer = servers.find(s => s.id === selectedServerId);
  const displayText = selectedServerId 
    ? `${selectedServer?.name || 'Unknown'} (${selectedServer?.ip || 'N/A'})`
    : 'Tất cả máy chủ';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all min-w-[200px]",
          theme === 'dark'
            ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        )}
      >
        <Server size={16} className="text-blue-500" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute top-full left-0 right-0 mt-2 rounded-lg border shadow-xl z-50 max-h-[300px] overflow-y-auto",
          theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
        )}>
          {showAllOption && (
            <button
              onClick={() => {
                onSelectServer(null);
                setIsOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors",
                !selectedServerId
                  ? (theme === 'dark' ? "bg-blue-600/20 text-blue-400" : "bg-blue-50 text-blue-600")
                  : (theme === 'dark' ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-50 text-slate-700")
              )}
            >
              <Globe size={14} />
              <span className="font-medium">Tất cả máy chủ</span>
              <span className={cn("ml-auto text-xs", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                ({servers.length} servers)
              </span>
            </button>
          )}

          {servers.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              Không có máy chủ nào
            </div>
          ) : (
            servers.map((server) => (
              <button
                key={server.id}
                onClick={() => {
                  onSelectServer(server.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors border-t",
                  theme === 'dark' ? "border-slate-700" : "border-slate-100",
                  selectedServerId === server.id
                    ? (theme === 'dark' ? "bg-blue-600/20 text-blue-400" : "bg-blue-50 text-blue-600")
                    : (theme === 'dark' ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-50 text-slate-700")
                )}
              >
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full flex-shrink-0",
                  server.status === 'online'
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse"
                    : server.status === 'warning'
                    ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] animate-pulse"
                    : "bg-slate-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{server.name}</p>
                  <p className={cn("text-xs font-mono", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                    {server.ip}
                  </p>
                </div>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
                  server.status === 'online' ? "bg-emerald-500/20 text-emerald-400" :
                  server.status === 'warning' ? "bg-amber-500/20 text-amber-400" :
                  "bg-slate-500/20 text-slate-400"
                )}>
                  {server.status}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
