import React, { useState } from 'react';
import { LogEntry } from '../types';
import { 
  FileText, ArrowDownLeft, ArrowUpRight, CheckCircle2, 
  AlertTriangle, Server, Clock, Search, Trash2, ShieldAlert
} from 'lucide-react';

interface ActivityLogProps {
  logs: LogEntry[];
  onClearLogs?: () => void;
}

export default function ActivityLog({ logs, onClearLogs }: ActivityLogProps) {
  const [filter, setFilter] = useState<'all' | 'rx' | 'tx' | 'broker' | 'errors'>('all');
  const [search, setSearch] = useState('');

  const filteredLogs = logs.filter(log => {
    // Channel Filters
    if (filter === 'rx' && log.type !== 'mqtt_rx') return false;
    if (filter === 'tx' && log.type !== 'mqtt_tx') return false;
    if (filter === 'broker' && !log.broker.toLowerCase().includes('broker') && log.type !== 'info' && log.type !== 'success') return false;
    if (filter === 'errors' && log.type !== 'error' && log.type !== 'warning') return false;

    // Search query term
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchB = log.broker.toLowerCase().includes(q);
      const matchTopic = log.topic?.toLowerCase().includes(q) || false;
      return matchMsg || matchB || matchTopic;
    }

    return true;
  });

  const getLogStyles = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        };
      case 'warning':
        return {
          bg: 'bg-amber-950/20 border-amber-900/30 text-amber-400',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        };
      case 'error':
        return {
          bg: 'bg-red-950/30 border-red-900/40 text-red-400',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
        };
      case 'mqtt_rx':
        return {
          bg: 'bg-indigo-950/10 border-indigo-900/30 text-indigo-400',
          icon: <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-400" />
        };
      case 'mqtt_tx':
        return {
          bg: 'bg-cyan-950/10 border-cyan-900/30 text-cyan-400',
          icon: <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
        };
      case 'info':
      default:
        return {
          bg: 'bg-slate-900/30 border-slate-805/40 text-slate-400',
          icon: <Clock className="w-3.5 h-3.5 text-slate-400" />
        };
    }
  };

  return (
    <div className="bg-[#161618] border border-[#1c1c1e] rounded-xl p-6 shadow-xl flex flex-col h-[520px] relative overflow-hidden backdrop-blur-md">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#c7a97c]/2 blur-[50px] rounded-full pointer-events-none" />

      {/* Header section with Action tools */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1c1c1e] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 border border-[#1c1c1e] rounded-lg text-[#c7a97c]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif tracking-tight text-zinc-100">Log Aktivitas Sistem</h3>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">Arus monitoring MQTT & Broker</p>
          </div>
        </div>

        {/* Local Simple Search */}
        <div className="relative w-full sm:w-60">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Cari kata kunci log..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0b] text-[#e2e2e2] pl-9 pr-4 py-1.5 text-xs rounded-lg border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-sans"
          />
        </div>
      </div>

      {/* Filter Tabs Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Semua Log' },
            { id: 'rx', label: 'Sinyal Masuk (RX)' },
            { id: 'tx', label: 'Kirim Topik (TX)' },
            { id: 'broker', label: 'Koneksi Broker' },
            { id: 'errors', label: 'Eror / Warning' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium cursor-pointer transition-all ${
                filter === tab.id
                  ? 'bg-[#c7a97c] text-[#0a0a0b]'
                  : 'bg-zinc-805 text-zinc-400 border border-[#1c1c1e] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Wipe action (simulated local clear, though backend keeps real log history) */}
        {onClearLogs && (
          <button
            onClick={onClearLogs}
            className="p-1 px-2.5 flex items-center gap-1.5 text-[9px] font-mono font-bold text-red-400 bg-red-950/10 border border-red-900/40 rounded hover:bg-red-900/20 hover:border-red-500/40 transition-all cursor-pointer uppercase tracking-wider"
          >
            <Trash2 className="w-3 h-3" /> CLEAR
          </button>
        )}
      </div>

      {/* Logs output block */}
      <div className="flex-1 mt-4 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed select-text space-y-2 max-h-[340px] scrollbar-thin scrollbar-thumb-slate-800">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-500">
            <Server className="w-6 h-6 opacity-30 mb-2 text-zinc-400" />
            <span className="font-sans text-xs">Tidak ada history log yang cocok</span>
          </div>
        ) : (
          filteredLogs.map(log => {
            const style = getLogStyles(log.type);
            return (
              <div
                key={log.id}
                className={`p-2.5 rounded border ${style.bg} flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 transition-all w-full`}
              >
                <div className="flex items-start gap-2 flex-1">
                  <span className="shrink-0 mt-0.5">{style.icon}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-300 break-words">{log.message}</span>
                    {log.topic && (
                      <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mt-1">
                        <span className="bg-[#0a0a0b] px-1 py-0.5 rounded border border-zinc-900 font-semibold select-all">
                          {log.topic}
                        </span>
                        {log.payload && (
                          <>
                            <span className="text-zinc-650 font-bold">&rarr;</span>
                            <span className="bg-[#0a0a0b] text-zinc-400 px-1 py-0.5 rounded border border-zinc-900 select-all">
                              {log.payload}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center text-[9px] font-semibold text-zinc-500">
                  <span className="bg-[#0a0a0b]/80 px-1.5 py-0.5 rounded border border-zinc-900 uppercase font-mono tracking-wide text-zinc-400">
                    {log.broker}
                  </span>
                  <span className="font-mono text-zinc-600">{log.timestamp}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer statistics bar */}
      <div className="border-t border-[#1c1c1e] mt-auto pt-4 flex justify-between items-center text-[10px] text-zinc-500 font-mono">
        <span>Menampilkan {filteredLogs.length} dari {logs.length} entitas log</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Feed (SSE)
        </span>
      </div>
    </div>
  );
}
