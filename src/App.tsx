import { useEffect, useRef, useState, FormEvent } from 'react';
import { SMKResult } from './types/smk';
import { 
  RefreshCw, Play, Square, Settings, X, Activity, Radio, HardDrive, Cpu, Terminal
} from 'lucide-react';
import { SMKChart } from './components/SMKChart';
import { StatsPanel } from './components/StatsPanel';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [source, setSource] = useState('NONE');
  const [result, setResult] = useState<SMKResult | null>(null);
  const [results, setResults] = useState<SMKResult[]>([]);
  const [logs, setLogs] = useState<{ msg: string; color: string; time: string }[]>([]);
  const [activeModel, setActiveModel] = useState('random_forest');
  const [speed, setSpeed] = useState(300);
  const [viewMode, setViewMode] = useState<'chart' | 'logs'>('chart');
  const [aiOpen, setAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const log = (msg: string, color: string = 'text-gray-400') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ msg, color, time }, ...prev.slice(0, 99)]);
  };

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const ws = new WebSocket(`${protocol}//${wsHost}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'bar') {
        const bar = msg.data;
        setResult(bar);
        setResults(prev => [...prev.slice(-499), bar]);
        
        if (bar.execution?.is_armed && bar.execution?.action === 'TRADE') {
           log(`SIGNAL ARMED: ${bar.execution.direction > 0 ? 'BUY' : 'SELL'} PATTERN=[${bar.execution.pattern}]`, 'text-emerald-400 font-bold');
        }
        if (bar.execution?.action.startsWith('CLOSED')) {
           log(`${bar.execution.action}: PNL=${bar.session_pnl?.realized}`, 'text-amber-400');
        }
      } else if (msg.type === 'done') {
        setIsRunning(false);
        log("SIMULATION MANIFOLD EXHAUSTED", "text-blue-400");
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  const handleStart = () => {
    if (!wsRef.current) return;
    setIsRunning(true);
    wsRef.current.send(JSON.stringify({ action: 'run', speed }));
    log("SEQUENCER INITIALIZED", "text-emerald-500");
  };

  const handlePause = () => {
    if (!wsRef.current) return;
    setIsRunning(false);
    wsRef.current.send(JSON.stringify({ action: 'stop' }));
    log("SEQUENCER SUSPENDED", "text-amber-500");
  };

  const handleLiveToggle = () => {
    if (!wsRef.current) return;
    if (isLive) {
      wsRef.current.send(JSON.stringify({ action: 'stop_live' }));
      setIsLive(false);
      log("LIVE FEED DECOUPLING", "text-red-400");
    } else {
      wsRef.current.send(JSON.stringify({ action: 'start_live', symbol: 'EURUSDT', granularity: '1m' }));
      setIsLive(true);
      log("BITGET QUANTUM TUNNEL ESTABLISHED", "text-emerald-400");
    }
  };

  const handleModelChange = async (model: string) => {
    setActiveModel(model);
    try {
      await fetch('/api/model/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      });
      log(`REVERSAL ENGINE SWAPPED: ${model.toUpperCase()}`, "text-blue-400");
    } catch (e) {
      log("MODEL SWITCH FAILED", "text-red-500");
    }
  };

  const loadSample = async () => {
     try {
       const r = await fetch('/api/load/sample', { method: 'POST' });
       const data = await r.json();
       setDataLoaded(true);
       setSource('SYNTHETIC');
       log(`LOADED ${data.count} SYNTHETIC BARS`, "text-cyan-400");
     } catch (err) {
       log("SAMPLE LOAD FAILED", "text-red-500");
     }
  };

  const onChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiLoading(true);

    try {
      const apiKey = (process.env as any).GEMINI_API_KEY;
      if (!apiKey) {
         setChatMessages(prev => [...prev, { role: 'model', text: "API KEY MISSING. UNABLE TO ACCESS AI CORE." }]);
         return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const context = result ? `
Price: ${result.bar.close}
Bias: ${result.bias?.bias}
Phase: ${result.ipda_phase?.phase}
Causality: Granger[${result.causality?.granger?.conf}]
AMD: ${result.amd?.state}
` : "Waiting for Sync...";

      const prompt = `You are Sovereign Kernel AI. Help operator. context: ${context}\nOperator: ${userMsg}`;
      const res = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      
      const text = res.text || "NO_RESPONSE";
      setChatMessages(prev => [...prev, { role: 'model', text }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'model', text: `CORE ERROR: ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/30 font-sans flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">Sovereign Market Kernel</h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                {isLive ? 'LIVE MANIFOLD' : 'LOCAL SIMULATOR'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              <span className="text-[10px] text-gray-500 font-mono">PNL:</span>
              <span className={`text-[11px] font-mono font-bold ${result?.session_pnl?.total && result.session_pnl.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${result?.session_pnl?.total.toFixed(2) || '0.00'}
              </span>
           </div>
           <button onClick={() => setAiOpen(!aiOpen)} className="p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10">
              <Cpu className={`w-5 h-5 ${aiOpen ? 'text-blue-400' : 'text-gray-400'}`} />
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-80 border-r border-white/5 p-6 space-y-6 bg-black/20 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] mb-4">Operations</h3>
            <div className="grid grid-cols-2 gap-2">
               <button 
                onClick={isRunning ? handlePause : handleStart}
                className={`flex items-center justify-center gap-2 h-11 rounded-lg font-mono text-xs transition-all border ${
                  isRunning 
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20' 
                  : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/20'
                }`}
               >
                 {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                 {isRunning ? 'HALT' : 'START'}
               </button>
               <button 
                onClick={handleLiveToggle}
                className={`flex items-center justify-center gap-2 h-11 rounded-lg font-mono text-xs transition-all border ${
                  isLive 
                  ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20' 
                  : 'bg-blue-500/10 border-blue-500/50 text-blue-500 hover:bg-blue-500/20'
                }`}
               >
                 <Activity className="w-4 h-4" />
                 {isLive ? 'DISCONNECT' : 'LIVE'}
               </button>
            </div>
            <button 
              onClick={loadSample}
              className="mt-2 w-full h-11 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg flex items-center justify-center gap-2 font-mono text-xs border border-white/5 transition-all"
            >
              <HardDrive className="w-4 h-4" /> LOAD SYTHETIC SEED
            </button>
          </div>

          <StatsPanel 
            lastResult={result || undefined} 
            activeModel={activeModel} 
            onModelChange={handleModelChange} 
          />
        </aside>

        {/* Viewport */}
        <section className="flex-1 flex flex-col relative bg-black/40">
          <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
               <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
                  <button onClick={() => setViewMode('chart')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-widest transition-all ${viewMode === 'chart' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                    <Activity className="w-3 h-3" /> Visualizer
                  </button>
                  <button onClick={() => setViewMode('logs')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-widest transition-all ${viewMode === 'logs' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                    <Terminal className="w-3 h-3" /> Terminal
                  </button>
               </div>
               
               <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                  <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_5px_#3b82f6]" />
                     AEGIS READY
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                     ORD FLOW ACTIVE
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_5px_#a855f7]" />
                     JAX ACCEL
                  </div>
               </div>
            </div>

            <div className="flex-1 min-h-0 bg-black/20 rounded-xl border border-white/5 p-1 relative">
               <AnimatePresence mode="wait">
                 {viewMode === 'chart' ? (
                    <motion.div 
                      key="chart"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.02 }}
                      className="h-full"
                    >
                      <SMKChart results={results} activeTrades={[]} />
                    </motion.div>
                 ) : (
                    <motion.div 
                      key="logs"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="h-full bg-black/60 rounded-lg p-4 font-mono overflow-y-auto space-y-1 custom-scrollbar text-[11px]"
                    >
                      {logs.map((L, i) => (
                        <div key={i} className="flex gap-4">
                          <span className="text-gray-600 shrink-0">[{L.time}]</span>
                          <span className={L.color}>{L.msg}</span>
                        </div>
                      ))}
                    </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </div>
        </section>

        {/* AI Side Panel */}
        <AnimatePresence>
          {aiOpen && (
            <motion.aside 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-96 border-l border-white/5 bg-black/60 backdrop-blur-3xl flex flex-col p-6 z-40"
            >
               <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-400" />
                    <h3 className="text-xs font-mono text-white uppercase tracking-widest">Quantum Interface</h3>
                  </div>
                  <button onClick={() => setAiOpen(false)} className="hover:bg-white/10 p-1 rounded transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar text-[11px] font-mono" ref={chatScrollRef}>
                  {chatMessages.length === 0 && (
                    <div className="text-gray-500 italic p-4 bg-white/5 rounded-lg border border-white/5">
                      Neural link established. Awaiting instructions from operator...
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-lg leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white/5 border border-white/10 text-gray-300'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
               </div>
               <form onSubmit={onChatSubmit} className="relative">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="TRANSMIT COMMAND..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 text-xs font-mono focus:outline-none focus:border-blue-500/50 transition-all pl-10"
                    disabled={isAiLoading}
                  />
                  <Radio className={`w-4 h-4 absolute left-3 top-3.5 transition-colors ${isAiLoading ? 'text-blue-500 animate-pulse' : 'text-gray-600'}`} />
               </form>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
