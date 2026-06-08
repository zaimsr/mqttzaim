import React, { useState, useEffect } from 'react';
import { SystemState, LogEntry, BrokerConfig } from './types';
import ActivityLog from './components/ActivityLog';
import BrokerConfigForm from './components/BrokerConfigForm';
import VoiceController from './components/VoiceController';
import { 
  Cpu, Thermometer, Droplet, Zap, Play, Square, 
  Wifi, ShieldAlert, Sliders, Settings, RefreshCw, 
  Clock, Power, CheckCircle, WifiOff, LayoutDashboard, Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');
  const [state, setState] = useState<SystemState>({
    temp: null,
    hum: null,
    relayStates: [false, false, false, false],
    variasiMode: 0,
    activeBrokerIndexESP32: 0,
    relayLabels: [
      "Relay 1 (Kipas)",
      "Relay 2 (Lampu)",
      "Relay 3 (Water Pump)",
      "Relay 4 (Sistem Utama)"
    ],
    brokers: [],
    brokerConnectionStates: [
      { index: 0, connected: false, connecting: false },
      { index: 1, connected: false, connecting: false },
      { index: 2, connected: false, connecting: false }
    ],
    logs: []
  });

  const [localTime, setLocalTime] = useState('');
  const [mutationLoading, setMutationLoading] = useState<string | null>(null);

  // Core helper to fetch state via REST API
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const parsed = await res.json();
        setState((prev) => ({
          ...prev,
          ...parsed
        }));
      }
    } catch (err) {
      console.error('Gagal mengambil status via REST:', err);
    }
  };

  // Sync state over Server-Sent Events (SSE) with robust REST fallback
  useEffect(() => {
    // 1. Fetch immediately on component mount
    fetchState();

    let eventSource: EventSource | null = null;
    let pollInterval: any = null;
    let lastMessageReceivedAt = Date.now();

    const startPollingFallback = () => {
      if (!pollInterval) {
        console.log('Mengaktifkan REST Polling otomatis...');
        pollInterval = setInterval(fetchState, 3000);
      }
    };

    const initEventSource = () => {
      try {
        eventSource = new EventSource('/api/stream');

        eventSource.onmessage = (event) => {
          lastMessageReceivedAt = Date.now();
          try {
            const parsed = JSON.parse(event.data);
            setState((prev) => ({
              ...prev,
              ...parsed
            }));
          } catch (err) {
            console.error('SSE JSON parsing error:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.warn('Koneksi stream SSE terputus, fallback ke REST Polling...', err);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          startPollingFallback();
        };
      } catch (e) {
        console.error('Gagal inisialisasi SSE:', e);
        startPollingFallback();
      }
    };

    initEventSource();

    // Watchdog timer: If we don't receive any SSE messages for 6 seconds, we active background REST polling
    // This is vital on Railway / proxy environments that silently buffer or drop SSE events.
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessageReceivedAt > 6000) {
        startPollingFallback();
      }
    }, 3000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      clearInterval(watchdog);
    };
  }, []);

  // Sync real local clock (using GMT+7 or general machine locale)
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setLocalTime(d.toLocaleTimeString('id-ID', { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Action helpers to talk to backend
  const triggerRelayState = async (idx: number, dest: 'ON' | 'OFF') => {
    setMutationLoading(`relay-${idx}`);
    try {
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, state: dest })
      });
      if (res.ok) {
        const parsed = await res.json();
        setState(prev => ({ ...prev, relayStates: parsed.relayStates }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMutationLoading(null);
    }
  };

  const triggerAllRelays = async (dest: 'ON' | 'OFF') => {
    setMutationLoading(`all-${dest}`);
    try {
      const res = await fetch('/api/relay/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: dest })
      });
      if (res.ok) {
        const parsed = await res.json();
        setState(prev => ({ ...prev, relayStates: parsed.relayStates }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMutationLoading(null);
    }
  };

  const triggerVariasiMode = async (mode: '1' | '2' | 'STOP') => {
    setMutationLoading(`variasi-${mode}`);
    try {
      const res = await fetch('/api/variasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        const parsed = await res.json();
        setState(prev => ({ ...prev, variasiMode: parsed.variasiMode }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMutationLoading(null);
    }
  };

  const triggerSwitchBroker = async (idx: number) => {
    // If we're already active there, ignore
    if (state.activeBrokerIndexESP32 === idx) return;

    setMutationLoading(`broker-${idx}`);
    try {
      const res = await fetch('/api/switch-broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx })
      });
      if (res.ok) {
        const parsed = await res.json();
        setState(prev => ({ ...prev, activeBrokerIndexESP32: parsed.activeBrokerIndexESP32 }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMutationLoading(null);
    }
  };

  const triggerSaveConfig = async (updatedBrokers: BrokerConfig[], updatedLabels: string[]) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokers: updatedBrokers, relayLabels: updatedLabels })
      });
      if (res.ok) {
        const parsed = await res.json();
        setState(prev => ({
          ...prev,
          relayLabels: parsed.config.relayLabels,
          brokers: parsed.config.brokers
        }));
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  // Helper clear logs for the activity panel
  const handleClearLogs = () => {
    setState(prev => ({ ...prev, logs: [] }));
  };

  // Check which general broker connections are alive
  const countConnectedBrokers = state.brokerConnectionStates.filter(b => b.connected).length;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e2e2e2] flex flex-col font-sans selection:bg-[#c7a97c]/30">
      
      {/* GLOW BACKGROUND EFFECT */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[350px] bg-[#c7a97c]/2 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[350px] bg-[#c7a97c]/1 blur-[120px] rounded-full pointer-events-none" />

      {/* HEADER BAR */}
      <header className="border-b border-[#1c1c1e] bg-[#0a0a0b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#c7a97c] flex items-center justify-center rounded-sm text-[#0a0a0b] shadow-lg shadow-[#c7a97c]/10">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-tight text-[#c7a97c]">
                ESP32 COMMAND
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">MQTT Control Protocol v2.4</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex gap-1.5 bg-[#161618] p-1 rounded-lg border border-[#1c1c1e]">
            <button
              id="nav-dashboard-tab"
              onClick={() => setActiveTab('dashboard')}
              className={`px-5 py-2 rounded-md font-medium text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#c7a97c] text-[#0a0a0b]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              id="nav-config-tab"
              onClick={() => setActiveTab('config')}
              className={`px-5 py-2 rounded-md font-medium text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-[#c7a97c] text-[#0a0a0b]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Network Config
            </button>
          </nav>

          {/* Live system status badge */}
          <div className="hidden sm:flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">JAM UTAMA</span>
              <span className="text-xs font-mono font-bold text-zinc-300 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-[#c7a97c]" />
                {localTime || '00:00:00'}
              </span>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold tracking-widest text-[#c7a97c] uppercase">SYSTEM ONLINE</div>
              <div className="text-[10px] text-emerald-500 flex items-center justify-end gap-1.5 font-mono leading-none mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Broker {state.activeBrokerIndexESP32 + 1 || 1} Active
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CORE VIEW BODY */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* INTRO METRIC BAR & ACTIVE BROKER CONSTATS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* SENSOR BAR TEMP DHT11 */}
              <div className="bg-[#161618] border border-[#1c1c1e] p-6 rounded-xl flex flex-col gap-1 relative overflow-hidden shadow-md">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-[#c7a97c]" /> Ambient Temperature
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-serif text-[#c7a97c]">
                    {state.temp !== null ? state.temp.toFixed(1) : '--.-'}
                  </span>
                  <span className="text-lg text-zinc-400 font-sans">&deg;C</span>
                </div>
                <div className="w-full bg-zinc-800 h-[2px] mt-3">
                  <div 
                    className="bg-[#c7a97c] h-full transition-all duration-1000" 
                    style={{ width: `${state.temp !== null ? Math.min(Math.max((state.temp / 50) * 100, 0), 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* SENSOR BAR HUM DHT11 */}
              <div className="bg-[#161618] border border-[#1c1c1e] p-6 rounded-xl flex flex-col gap-1 relative overflow-hidden shadow-md">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-[#c7a97c]" /> Air Humidity
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-serif text-[#c7a97c]">
                    {state.hum !== null ? state.hum.toFixed(1) : '--.-'}
                  </span>
                  <span className="text-lg text-zinc-400 font-sans">%</span>
                </div>
                <div className="w-full bg-zinc-800 h-[2px] mt-3">
                  <div 
                    className="bg-[#c7a97c] h-full transition-all duration-1000" 
                    style={{ width: `${state.hum !== null ? Math.min(Math.max(state.hum, 0), 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* REPORT ACTIVE BROKER AT ESP32 & SHORTCUTS TO SWITCH */}
              <div className="bg-[#161618] border border-[#1c1c1e] p-6 rounded-xl flex flex-col justify-between relative overflow-hidden shadow-md">
                <div className="flex items-center justify-between pb-2 border-b border-[#1c1c1e]">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-[#c7a97c]" /> Broker Aktif ESP32
                  </span>
                  <span className="text-[9px] font-mono bg-zinc-900 border border-[#1c1c1e] px-1.5 py-0.5 rounded text-[#c7a97c] font-bold">
                    CONNECTED
                  </span>
                </div>

                <div className="my-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-[#c7a97c]">Connected Broker:</div>
                  <div className="text-sm font-sans font-bold text-zinc-100 mt-1 flex items-center gap-2">
                    <span className="bg-[#c7a97c] text-[#0a0a0b] border border-[#c7a97c]/20 w-5 h-5 flex items-center justify-center rounded-xs text-[10px] font-mono font-bold">
                      {state.activeBrokerIndexESP32 + 1}
                    </span>
                    <span className="font-mono text-xs truncate max-w-[200px]">
                      {state.brokers[state.activeBrokerIndexESP32]?.server || 'kingfisher.lmq ...'}
                    </span>
                  </div>
                </div>

                {/* Shortcuts Switching */}
                <div className="pt-2 border-t border-[#1c1c1e]">
                  <span className="text-[10px] text-zinc-500 font-mono tracking-widest font-bold block mb-2 uppercase">Quick Broker Switch</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => {
                      const isActive = state.activeBrokerIndexESP32 === idx;
                      return (
                        <button
                          key={idx}
                          id={`shortcut-broker-btn-${idx}`}
                          onClick={() => triggerSwitchBroker(idx)}
                          disabled={mutationLoading !== null}
                          className={`py-2 rounded font-bold text-xs transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-[#c7a97c] text-[#0a0a0b] shadow-lg shadow-[#c7a97c]/10'
                              : 'bg-zinc-805 border border-[#1c1c1e] text-zinc-400 hover:border-[#c7a97c] hover:text-white'
                          }`}
                        >
                          B{idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

            {/* RELAYS CONTROL PANEL & VARIATION ACTIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* RELAYS GRID (Columns spans 2 in desktop) */}
              <div className="lg:col-span-2 bg-[#161618] border border-[#1c1c1e] rounded-xl p-6 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2">
                    <Power className="w-4 h-4 text-[#c7a97c]" /> Manual Relay Matrix
                    {state.variasiMode !== 0 && (
                      <span className="text-[9px] font-mono bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded text-amber-500 animate-pulse">
                        AUTOMATIC PATTERN RUNNING
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      id="all-on-btn-master"
                      onClick={() => triggerAllRelays('ON')}
                      disabled={mutationLoading !== null}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] uppercase border border-zinc-700 font-mono font-bold tracking-wider text-zinc-300 transition-all cursor-pointer"
                    >
                      Master ON
                    </button>
                    <button
                      id="all-off-btn-master"
                      onClick={() => triggerAllRelays('OFF')}
                      disabled={mutationLoading !== null}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] uppercase border border-zinc-700 font-mono font-bold tracking-wider text-zinc-300 transition-all cursor-pointer"
                    >
                      Master OFF
                    </button>
                  </div>
                </div>

                {state.variasiMode !== 0 && (
                  <div className="p-3 bg-amber-950/20 border border-amber-900/30 text-amber-300 text-xs rounded-lg flex items-center gap-3 mb-5">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="leading-normal">
                      Mekanisme <strong>Pola Variasi {state.variasiMode}</strong> sedang berjalan. Kontrol relay manual dinonaktifkan sementara di perangkat. Anda harus menekan tombol <strong>STOP MODE</strong> terlebih dahulu untuk mengembalikannya ke manual.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((relayIdx) => {
                    const isOn = state.relayStates[relayIdx];
                    const label = state.relayLabels[relayIdx] || `Relay ${relayIdx + 1}`;
                    const isLoading = mutationLoading === `relay-${relayIdx}`;

                    return (
                      <div
                        key={relayIdx}
                        className={`bg-[#0a0a0b] rounded-lg p-5 flex items-center justify-between transition-all border ${
                          isOn 
                            ? 'border-[#c7a97c]/30 shadow-[0_0_15px_rgba(199,169,124,0.05)]' 
                            : 'border-zinc-800'
                        }`}
                      >
                        <div>
                          <span className="text-[10px] block text-zinc-500 font-mono tracking-wider font-bold">RELAY 0{relayIdx + 1}</span>
                          <span className={`font-serif text-lg mt-0.5 block ${isOn ? 'text-[#c7a97c]' : 'text-zinc-400'}`}>
                            {label}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-650 mt-1 block tracking-wider uppercase">
                            Logic: {isOn ? 'ON (ACTIVE LOW)' : 'OFF (IDLE HIGH)'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#c7a97c]" />}
                          <button
                            id={`relay-toggle-${relayIdx}`}
                            disabled={state.variasiMode !== 0 || isLoading}
                            onClick={() => triggerRelayState(relayIdx, isOn ? 'OFF' : 'ON')}
                            className={`w-12 h-6 rounded-full relative transition-all duration-300 cursor-pointer flex items-center ${
                              state.variasiMode !== 0
                                ? 'bg-zinc-90 opacity-40 cursor-not-allowed'
                                : isOn
                                  ? 'bg-[#c7a97c]'
                                  : 'bg-zinc-800'
                            }`}
                          >
                            <span className={`absolute w-4 h-4 rounded-full transition-all top-1 ${
                              isOn 
                                ? 'bg-white right-1' 
                                : 'bg-zinc-600 left-1'
                            }`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AUTOMATION VARIASI CONTROL COLUMN */}
              <div className="bg-[#161618] border border-[#1c1c1e] rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm uppercase tracking-widest font-semibold flex items-center gap-2 mb-4">
                    <Sliders className="w-4 h-4 text-[#c7a97c]" /> Patterns & Sequences
                  </h3>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* Variasi 1 */}
                    <button
                      id="variasi-1-btn"
                      onClick={() => triggerVariasiMode('1')}
                      disabled={mutationLoading !== null}
                      className={`flex flex-col items-center justify-center py-4 px-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                        state.variasiMode === 1
                          ? 'bg-[#c7a97c]/10 border-[#c7a97c] text-[#c7a97c] font-bold'
                          : 'bg-zinc-800/40 border-zinc-800 text-zinc-300 hover:border-[#c7a97c]'
                      }`}
                    >
                      <span className="text-[9px] text-zinc-500 font-mono tracking-widest block uppercase">PATTERN SEQUENCE</span>
                      <span className="text-xs uppercase font-bold mt-1.5 flex items-center gap-1">
                        <Play className="w-3 h-3 fill-current" /> Variation 01 (Relay 1 → 4)
                      </span>
                    </button>

                    {/* Variasi 2 */}
                    <button
                      id="variasi-2-btn"
                      onClick={() => triggerVariasiMode('2')}
                      disabled={mutationLoading !== null}
                      className={`flex flex-col items-center justify-center py-4 px-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                        state.variasiMode === 2
                          ? 'bg-[#c7a97c]/10 border-[#c7a97c] text-[#c7a97c] font-bold'
                          : 'bg-zinc-800/40 border-zinc-800 text-zinc-300 hover:border-[#c7a97c]'
                      }`}
                    >
                      <span className="text-[9px] text-zinc-500 font-mono tracking-widest block uppercase">PATTERN SEQUENCE</span>
                      <span className="text-xs uppercase font-bold mt-1.5 flex items-center gap-1">
                        <Play className="w-3 h-3 fill-current" /> Variation 02 (Relay 4 → 1)
                      </span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#1c1c1e] pt-4 mt-4">
                  <button
                    id="variasi-stop-btn"
                    onClick={() => triggerVariasiMode('STOP')}
                    disabled={mutationLoading !== null || state.variasiMode === 0}
                    className={`w-full py-2.5 rounded font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                      state.variasiMode !== 0
                        ? 'bg-red-950/40 border-red-500 text-red-400 animate-pulse'
                        : 'bg-zinc-900 border-[#1c1c1e] text-zinc-650 cursor-not-allowed'
                    }`}
                  >
                    <Square className="w-2.5 h-2.5 fill-current" /> STOP MODE
                  </button>
                </div>
              </div>

            </div>

            {/* VOICE SPEECH ASSISTED CONTROLLER ROW */}
            <VoiceController 
              onCommandSuccess={() => {}} 
              relayLabels={state.relayLabels} 
            />

            {/* LIVE ACTIVITY LOGGER BLOCK */}
            <ActivityLog 
              logs={state.logs} 
              onClearLogs={handleClearLogs} 
            />

          </div>
        )}

        {/* PAGE 2 - HARDWARE CONFIGURATION VIEWS */}
        {activeTab === 'config' && (
          <div className="bg-[#161618] border border-[#1c1c1e] rounded-xl p-8 shadow-xl">
            <BrokerConfigForm
              initialBrokers={state.brokers}
              initialLabels={state.relayLabels}
              onSave={triggerSaveConfig}
            />
          </div>
        )}

      </main>

      {/* FOOTER BAR BRAND */}
      <footer className="px-8 py-5 bg-[#161618] border-t border-[#1c1c1e] flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] tracking-widest text-zinc-500 font-medium z-10 w-full">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 uppercase font-mono">
          <span>ESP32 STATUS: RUNNING</span>
          <span className="text-[#c7a97c]">Uptime: Active monitor verified</span>
        </div>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-6 uppercase font-mono">
          <span>IP: 192.168.1.104</span>
          <span>MAC: 3C:61:05:4F:A2:18</span>
          <span className="text-emerald-500">WIFI SIGNAL: -62 dBm</span>
        </div>
      </footer>

    </div>
  );
}
