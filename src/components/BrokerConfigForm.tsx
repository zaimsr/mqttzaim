import React, { useState } from 'react';
import { BrokerConfig } from '../types';
import { 
  Server, Lock, Key, Eye, EyeOff, Save, Cpu, 
  HelpCircle, CheckCircle, Info, RefreshCw, LayoutGrid
} from 'lucide-react';
import { motion } from 'motion/react';

interface BrokerConfigFormProps {
  initialBrokers: BrokerConfig[];
  initialLabels: string[];
  onSave: (updatedBrokers: BrokerConfig[], updatedLabels: string[]) => Promise<boolean>;
}

export default function BrokerConfigForm({ initialBrokers, initialLabels, onSave }: BrokerConfigFormProps) {
  // Config States for 3 brokers
  const [brokers, setBrokers] = useState<BrokerConfig[]>(() => {
    // Fill up to 3 elements if missing
    const list = [...initialBrokers];
    while (list.length < 3) {
      list.push({ server: '', port: 8883, user: '', pass: '', client_id: '', vhost: '' });
    }
    return list;
  });

  // Toggle state to show/hide passcode representation for each of the 3 brokers
  const [showPasswords, setShowPasswords] = useState<boolean[]>([false, false, false]);

  // Labels States for 4 relays
  const [labels, setLabels] = useState<string[]>(() => {
    const arr = [...initialLabels];
    while (arr.length < 4) {
      arr.push(`Relay ${arr.length + 1}`);
    }
    return arr;
  });

  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<'idle' | 'success' | 'fail'>('idle');

  // Sync state if parents props change or finish loading
  const [isInitialized, setIsInitialized] = useState(false);
  React.useEffect(() => {
    if (initialBrokers && initialBrokers.length > 0 && !isInitialized) {
      const hasRealData = initialBrokers.some(b => b.server);
      if (hasRealData) {
        const list = [...initialBrokers];
        while (list.length < 3) {
          list.push({ server: '', port: 8883, user: '', pass: '', client_id: '', vhost: '' });
        }
        setBrokers(list);
        setIsInitialized(true);
      }
    }
  }, [initialBrokers, isInitialized]);

  React.useEffect(() => {
    if (initialLabels && initialLabels.length > 0) {
      const arr = [...initialLabels];
      while (arr.length < 4) {
        arr.push(`Relay ${arr.length + 1}`);
      }
      setLabels(arr);
    }
  }, [initialLabels]);

  const handleBrokerChange = (index: number, field: keyof BrokerConfig, value: any) => {
    const updated = [...brokers];
    updated[index] = {
      ...updated[index],
      [field]: field === 'port' ? Number(value) || 0 : value
    };
    setBrokers(updated);
  };

  const handleLabelChange = (index: number, value: string) => {
    const updated = [...labels];
    updated[index] = value;
    setLabels(updated);
  };

  const toggleShowPassword = (index: number) => {
    const updated = [...showPasswords];
    updated[index] = !updated[index];
    setShowPasswords(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedStatus('idle');

    const success = await onSave(brokers, labels);
    setSaving(false);
    setSavedStatus(success ? 'success' : 'fail');

    if (success) {
      setTimeout(() => setSavedStatus('idle'), 4000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 3 Brokers Side-By-Side (sejajar) Grid */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-zinc-900 border border-[#1c1c1e] rounded-lg text-[#c7a97c]">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-serif tracking-tight text-[#c7a97c]">Setup Port & MQTT Broker</h2>
            <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wider">Atur detail host, port kustom SSL, virtual host, dan kredensial akses broker</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {brokers.map((broker, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-[#0a0a0b] border border-[#1c1c1e] rounded-lg p-6 flex flex-col justify-between"
            >
              {/* Badge */}
              <div className="absolute top-5 right-5 px-2.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#161618] text-zinc-500 border border-[#1c1c1e] tracking-wider">
                B{idx + 1}
              </div>

              <div className="space-y-4">
                <span className="text-xs uppercase tracking-widest font-bold text-[#c7a97c] block border-b border-[#1c1c1e] pb-2">
                  {idx === 0 ? 'Primary Broker' : idx === 1 ? 'Secondary Broker' : 'Emergency Broker'}
                </span>

                {/* Server Host URL */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Server Host IP / Domain</label>
                  <input
                    type="text"
                    required
                    value={broker.server}
                    placeholder="e.g. kingfisher.lmq..."
                    onChange={(e) => handleBrokerChange(idx, 'server', e.target.value)}
                    className="w-full bg-[#161618] text-[#e2e2e2] px-3.5 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                  />
                </div>

                {/* Port */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Port (SSL/TLS)</label>
                  <input
                    type="number"
                    required
                    value={broker.port}
                    placeholder="8883"
                    onChange={(e) => handleBrokerChange(idx, 'port', e.target.value)}
                    className="w-full bg-[#161618] text-[#e2e2e2] px-3.5 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                  />
                </div>

                {/* User */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Username</label>
                  <input
                    type="text"
                    value={broker.user}
                    placeholder="Username broker"
                    onChange={(e) => handleBrokerChange(idx, 'user', e.target.value)}
                    className="w-full bg-[#161618] text-[#e2e2e2] px-3.5 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                  />
                </div>

                {/* Password Input with Visibility toggle */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Password / Key</label>
                  <div className="relative">
                    <input
                      type={showPasswords[idx] ? 'text' : 'password'}
                      value={broker.pass}
                      placeholder="••••••••••••"
                      onChange={(e) => handleBrokerChange(idx, 'pass', e.target.value)}
                      className="w-full bg-[#161618] text-[#e2e2e2] pl-3.5 pr-10 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowPassword(idx)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-350 cursor-pointer"
                    >
                      {showPasswords[idx] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Client ID */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">Client ID</label>
                  <input
                    type="text"
                    value={broker.client_id}
                    placeholder="Unique Client ID"
                    onChange={(e) => handleBrokerChange(idx, 'client_id', e.target.value)}
                    className="w-full bg-[#161618] text-[#e2e2e2] px-3.5 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                  />
                </div>

                {/* Virtual Host (Vhost) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono flex items-center gap-1">
                    Virtual Host
                    <span className="text-[9px] text-zinc-650 font-sans tracking-normal lowercase">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={broker.vhost || ''}
                    placeholder="Contoh: harvltis"
                    onChange={(e) => handleBrokerChange(idx, 'vhost', e.target.value)}
                    className="w-full bg-[#161618] text-[#e2e2e2] px-3.5 py-2 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-mono"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Relay Labels Configuration Grid */}
      <div className="bg-[#0a0a0b] border border-[#1c1c1e] rounded-lg p-6 relative overflow-hidden mt-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#c7a97c]/2 blur-[50px] rounded-full pointer-events-none" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-zinc-900 border border-[#1c1c1e] rounded-lg text-[#c7a97c]">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-serif tracking-tight text-[#c7a97c]">Alias Deskripsi Relay</h2>
            <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wider">Beri nama beban listrik per-saklar agar mempermudah monitoring log dan perintah suara AI</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {labels.map((label, idx) => (
            <div key={idx} className="space-y-2 p-4 bg-[#161618] border border-[#1c1c1e] rounded">
              <label className="text-[10px] font-mono text-zinc-500 font-bold block uppercase tracking-widest">
                Relay 0{idx + 1}
              </label>
              <input
                type="text"
                required
                value={label}
                placeholder={`Beban Relay ${idx + 1}`}
                onChange={(e) => handleLabelChange(idx, e.target.value)}
                className="w-full bg-[#0a0a0b] text-[#e2e2e2] px-3 py-1.5 text-xs rounded border border-[#1c1c1e] focus:outline-none focus:border-[#c7a97c] transition-all font-sans"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save Action footer button */}
      <div className="flex items-center justify-end gap-4 border-t border-[#1c1c1e] pt-6">
        {savedStatus === 'success' && (
          <div className="flex items-center gap-2 text-xs text-emerald-500 font-mono">
            <CheckCircle className="w-4 h-4" /> Kredensial & Broker berhasil diubah!
          </div>
        )}
        {savedStatus === 'fail' && (
          <div className="flex items-center gap-2 text-xs text-red-500 font-mono">
            <Info className="w-4 h-4" /> Terjadi kendala saat menyimpan.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-[#c7a97c] hover:bg-[#bda073] disabled:bg-[#c7a97c]/50 text-[#0a0a0b] text-xs font-bold rounded flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#c7a97c]/10"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          SIMPAN KONFIGURASI
        </button>
      </div>
    </form>
  );
}
