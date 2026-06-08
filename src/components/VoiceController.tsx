import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Command } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceControllerProps {
  onCommandSuccess: () => void;
  relayLabels: string[];
}

// Ensure TypeScript is happy with Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (event: Event) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: (event: Event) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
}

export default function VoiceController({ onCommandSuccess, relayLabels }: VoiceControllerProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognitionClass = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      const rec = new SpeechRecognitionClass();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'id-ID'; // Set lang to Indonesian as requested by prompt details

      rec.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setFeedback({ text: 'Mendengarkan suara Anda...', error: false });
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', e.error);
        if (e.error !== 'no-speech') {
          setFeedback({ text: `Mikrofon bermasalah: ${e.error}`, error: true });
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const text = Array.from(e.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        
        setTranscript(text);

        // If it is the final result, process it
        if (e.results[e.results.length - 1].isFinal) {
          processVoiceCommand(text);
        }
      };

      recognitionRef.current = rec;
    }
  }, [relayLabels]);

  const speak = (message: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // stop current sound
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const executeControl = async (endpoint: string, body: any, successMsg: string) => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onCommandSuccess();
        setFeedback({ text: successMsg, error: false });
        speak(successMsg);
      } else {
        throw new Error('Gagal menghubungi alat');
      }
    } catch (e: any) {
      setFeedback({ text: `Gagal menjalankan: ${e.message}`, error: true });
    }
  };

  // Fast offline regex parser
  const processLocalCommand = (rawText: string): boolean => {
    const txt = rawText.toLowerCase().trim();
    
    // Switch all relays
    if (txt.includes('semua') || txt.includes('all')) {
      if (txt.includes('hidup') || txt.includes('on') || txt.includes('nyala') || txt.includes('aktif')) {
        executeControl('/api/relay/all', { state: 'ON' }, 'Menyalakan seluruh relay sistem');
        return true;
      }
      if (txt.includes('mati') || txt.includes('off') || txt.includes('padam')) {
        executeControl('/api/relay/all', { state: 'OFF' }, 'Mematikan seluruh relay sistem');
        return true;
      }
    }

    // Variasi
    if (txt.includes('variasi')) {
      if (txt.includes('satu') || txt.includes('1')) {
        executeControl('/api/variasi', { mode: '1' }, 'Mengaktifkan pola variasi satu');
        return true;
      }
      if (txt.includes('dua') || txt.includes('2')) {
        executeControl('/api/variasi', { mode: '2' }, 'Mengaktifkan pola variasi dua');
        return true;
      }
      if (txt.includes('mati') || txt.includes('off') || txt.includes('stop') || txt.includes('henti')) {
        executeControl('/api/variasi', { mode: 'STOP' }, 'Menghentikan variasi, relay kembali ke manual');
        return true;
      }
    }

    if (txt.includes('stop') || txt.includes('berhenti')) {
      executeControl('/api/variasi', { mode: 'STOP' }, 'Variasi otomatis dihentikan');
      return true;
    }

    // Individual Relays Match by user-defined descriptions or Numbers
    for (let i = 0; i < 4; i++) {
      const numWords = [(i+1).toString(), i === 0 ? 'satu' : i === 1 ? 'dua' : i === 2 ? 'tiga' : 'empat'];
      const descWord = relayLabels[i].toLowerCase();

      // Check if text triggers this relay specifically
      const matchesRelay = numWords.some(w => txt.includes(`relay ${w}`) || txt.includes(`saklar ${w}`) || txt.includes(`colokan ${w}`)) || 
                            (descWord.length > 3 && txt.includes(descWord));

      if (matchesRelay) {
        if (txt.includes('hidup') || txt.includes('on') || txt.includes('nyala') || txt.includes('aktif') || txt.includes('buka')) {
          executeControl('/api/relay', { index: i, state: 'ON' }, `Menghidupkan ${relayLabels[i]}`);
          return true;
        }
        if (txt.includes('mati') || txt.includes('off') || txt.includes('padam') || txt.includes('tutup')) {
          executeControl('/api/relay', { index: i, state: 'OFF' }, `Mematikan ${relayLabels[i]}`);
          return true;
        }
      }
    }

    // Broker switching shortcuts via voice
    if (txt.includes('broker')) {
      if (txt.includes('satu') || txt.includes('1')) {
        executeControl('/api/switch-broker', { index: 0 }, `Berpindah ke Broker satu`);
        return true;
      }
      if (txt.includes('dua') || txt.includes('2')) {
        executeControl('/api/switch-broker', { index: 1 }, `Berpindah ke Broker dua`);
        return true;
      }
      if (txt.includes('tiga') || txt.includes('3')) {
        executeControl('/api/switch-broker', { index: 2 }, `Berpindah ke Broker tiga`);
        return true;
      }
    }

    return false;
  };

  // Run Gemini parser as semantic fallback
  const processVoiceCommand = async (rawText: string) => {
    if (!rawText.trim()) return;

    // Try parsing locally first for speed
    const wasLocalHandled = processLocalCommand(rawText);
    if (wasLocalHandled) return;

    // If local matches didn't hit, call Gemini back-end for semantic matching
    setGeminiLoading(true);
    setFeedback({ text: 'Menganalisis perintah dengan asisten AI...', error: false });
    
    try {
      const res = await fetch('/api/gemini/parse-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: rawText }),
      });

      if (!res.ok) throw new Error('Query error');
      const data = await res.json();

      if (data.matched) {
        // Execute the action determined by Gemini
        if (data.action === 'relay') {
          await executeControl(
            '/api/relay', 
            { index: data.params.index, state: data.params.state }, 
            data.explanation
          );
        } else if (data.action === 'relay_all') {
          await executeControl(
            '/api/relay/all', 
            { state: data.params.state }, 
            data.explanation
          );
        } else if (data.action === 'variasi') {
          await executeControl(
            '/api/variasi', 
            { mode: data.params.mode }, 
            data.explanation
          );
        } else if (data.action === 'switch_broker') {
          await executeControl(
            '/api/switch-broker', 
            { index: data.params.index }, 
            data.explanation
          );
        }
      } else {
        setFeedback({ text: `Perintah tidak dikenali: "${rawText}". Coba sebut "relay 1 ON" atau "variasi 1".`, error: true });
        speak('Perintah tidak dikenali. Silakan coba lagi.');
      }
    } catch (e) {
      console.error('Gemini parsing error:', e);
      setFeedback({ text: `Gagal memproses kata "${rawText}". Sinyal terputus.`, error: true });
    } finally {
      setGeminiLoading(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setFeedback({ text: 'Peranti WebSpeech tidak didukung di browser ini.', error: true });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setFeedback(null);
      recognitionRef.current.start();
    }
  };

  return (
    <div className="bg-[#161618] border border-[#1c1c1e] rounded-xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
      {/* Decorative accent grid */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#c7a97c]/2 blur-[60px] rounded-full pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 bg-zinc-900 border border-[#1c1c1e] rounded-lg text-[#c7a97c]">
            <Command className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-serif tracking-tight text-lg text-zinc-100 flex items-center gap-2">
              Voice Assistant Command
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-900 text-[#c7a97c] border border-zinc-800 flex items-center gap-1 leading-none uppercase tracking-wider">
                <Sparkles className="w-3 h-3" /> AI Online
              </span>
            </h3>
            <p className="text-zinc-400 text-xs mt-1 max-w-lg leading-relaxed">
              Tekan ikon mikrofon dan sebutkan instruksi Anda (misal: "hidupkan relay 2", "matikan semua", "aktifkan variasi 1", "pindah broker 3").
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            id="voice-mic-btn"
            onClick={toggleListening}
            className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-350 relative group cursor-pointer ${
              isListening
                ? 'bg-red-950/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                : 'bg-[#0a0a0b] border-zinc-800 text-zinc-300 hover:border-[#c7a97c] hover:text-[#c7a97c]'
            }`}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full border border-red-500 opacity-75 animate-ping" />
            )}
            {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <span className="text-[9px] font-mono text-zinc-500 font-bold tracking-widest uppercase">
            {isListening ? 'MENYADAP' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Real-time speech transcript & matching feedback */}
      <AnimatePresence mode="wait">
        {(transcript || feedback || geminiLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 pt-4 border-t border-[#1c1c1e] flex flex-col gap-3 relative z-10"
          >
            {transcript && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0a0a0b] text-zinc-500 border border-zinc-800 font-mono font-bold uppercase tracking-wider">Suara Anda</span>
                <p className="text-[#c7a97c] text-xs italic font-semibold">"{transcript}"</p>
              </div>
            )}
            
            {feedback && (
              <div className={`p-3 rounded text-xs flex items-center gap-3 border ${
                feedback.error 
                  ? 'bg-red-950/15 border-red-900/30 text-red-400 font-mono' 
                  : 'bg-emerald-950/15 border-emerald-900/30 text-emerald-400'
              }`}>
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span>{feedback.text}</span>
              </div>
            )}

            {geminiLoading && (
              <div className="flex items-center gap-2 text-[#c7a97c] text-[10px] font-mono tracking-wider uppercase animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c7a97c] animate-bounce" />
                Mencerna semantik bahasa Indonesia...
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
