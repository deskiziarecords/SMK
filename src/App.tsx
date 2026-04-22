import { useEffect, useRef, useState, ChangeEvent, FormEvent } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { GoogleGenAI } from "@google/genai";
import { SMKResult } from './types/smk';
import { RefreshCw, Play, Square, FastForward, Settings, X, Check, LayoutGrid, BarChart2, MessageSquare, ChevronDown, Activity, BarChart3 } from 'lucide-react';

const MODULE_DEFS = [
  {id:'bias',        name:'Bias Detector',       layer:'L1'},
  {id:'ipda',        name:'IPDA Phase Detector',  layer:'L1'},
  {id:'dealing',     name:'Dealing Range',         layer:'L1'},
  {id:'swing',       name:'Swing Detector',        layer:'L1'},
  {id:'session',     name:'Session / Killzone',    layer:'L1'},
  {id:'vol_decay',   name:'Vol Decay λ1',          layer:'λ'},
  {id:'displacement',name:'Displacement λ6',       layer:'λ'},
  {id:'harmonic',    name:'Harmonic Trap λ3',      layer:'λ'},
  {id:'expansion',   name:'Expansion Predictor',   layer:'λ'},
  {id:'manipulation',name:'Manipulation λ4',       layer:'λ'},
  {id:'fvg',         name:'FVG Detector',          layer:'L2'},
  {id:'ob',          name:'Order Block',           layer:'L2'},
  {id:'vol_profile', name:'Volume Profile',        layer:'L2'},
  {id:'kl',          name:'KL Divergence',         layer:'L4'},
  {id:'fusion',      name:'Lambda Fusion Ring0',   layer:'L4'},
  {id:'mandra',      name:'Mandra Gate',           layer:'L4'},
  {id:'topology',    name:'Topology Fracture',     layer:'L4'},
];

const LAYER_COLORS: Record<string, string> = {'L1':'#237a45','λ':'#d96000','L2':'#555','L4':'#aa2828'};

export default function App() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const processBarRef = useRef<any>(null);

  const markersRef = useRef<any[]>([]);
  const historicalResultsRef = useRef<Map<number, SMKResult>>(new Map());
  const lastJudasRef = useRef(false);

  const [isRunning, setIsRunning] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [source, setSource] = useState('NONE');
  const [wsStatus, setWsStatus] = useState<'LIVE' | 'PAUSED' | 'DISCONNECTED'>('DISCONNECTED');
  const [result, setResult] = useState<SMKResult | null>(null);
  const [logs, setLogs] = useState<{ panel: 'ev' | 'tr' | 'vt', msg: string, color: string }[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [realizedPnl, setRealizedPnl] = useState(0);
  const [profitTargetEnabled, setProfitTargetEnabled] = useState(false);
  const [profitTargetPct, setProfitTargetPct] = useState(2); // 2%
  const [lotSize, setLotSize] = useState(0.01);
  const [stopLoss, setStopLoss] = useState(15.0);
  const [takeProfit, setTakeProfit] = useState(30.0);
  const [speed, setSpeed] = useState(300);
  const [summary, setSummary] = useState({ wins: 0, losses: 0 });
  const [autoTradeCount, setAutoTradeCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [hoverData, setHoverData] = useState<SMKResult | null>(null);
  const lastProcessedTimeRef = useRef<number>(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'matrix' | 'causality'>('chart');
  const [aiOpen, setAiOpen] = useState(false);
  const [causalGraph, setCausalGraph] = useState<any>(null);
  
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);

  const [moduleStates, setModuleStates] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_DEFS.map(m => [m.id, true]))
  );

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const onChatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY });
      // Contextualize with current kernel state
      const context = result ? `
Current Market Context:
Symbol: BTCUSDT
Price: ${result.bar.close}
Bias: ${result.bias?.bias}
Phase: ${result.ipda_phase?.phase}
Session: ${result.session?.name}
Sequence: ${result.smart?.sequence}
Veto: ${result.veto?.decision}
Reasons: ${result.veto?.reasons?.join(', ')}
Execution: ${result.execution?.action} (${result.execution?.reason})
` : "Waiting for kernel synchronization...";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            { role: 'user', parts: [{ text: `You are the Sovereign Kernel AI Core. Assist the operator. Current context: ${context}\n\nOperator: ${userMsg}` }] }
        ],
        config: {
            systemInstruction: "You are the Sovereign Kernel AI Core, a hyper-advanced trading intelligence system. Your tone is technical, concise, and professional. Use trading terminology like Liquidity, Fair Value Gap, Order Block, and Mitigation when appropriate. Stay in character as a core kernel system."
        }
      });

      const aiText = response.text || "NO_RESPONSE_RECEIVED";
      setChatMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (err) {
      console.error("AI ERROR:", err);
      setChatMessages(prev => [...prev, { role: 'model', text: "CORE SIGNAL INTERRUPTED: UNABLE TO REACH GEMINI CLOUD PORTAL." }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Initial Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: { 
        background: { color: '#ffffff' }, 
        textColor: '#555',
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 10
      },
      grid: { 
        vertLines: { color: '#e8e8e8' }, 
        horzLines: { color: '#e8e8e8' } 
      },
      timeScale: { 
        borderColor: '#e8e8e8',
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
        rightOffset: 12,
      },
      rightPriceScale: { 
        borderColor: '#e8e8e8',
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      crosshair: {
        mode: 0,
        vertLine: { color: '#ddd', width: 1, style: 3 },
        horzLine: { color: '#ddd', width: 1, style: 3 },
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#237a45', 
      downColor: '#aa2828',
      borderUpColor: '#237a45', 
      borderDownColor: '#aa2828',
      wickUpColor: '#aad4b8', 
      wickDownColor: '#e8b8b8',
    });

    const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
    });

    chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.88, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const d = historicalResultsRef.current.get(param.time as number);
        setHoverData(d || null);
      } else {
        setHoverData(null);
      }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // WebSocket Connection
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    const connect = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setWsStatus(isRunning ? 'LIVE' : 'PAUSED');
            addLog('ev', 'RECONSTITUTED: KERNEL LINK ESTABLISHED', 'ok');
        };

        ws.onclose = () => {
            setWsStatus('DISCONNECTED');
            reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = (e) => {
            console.error("WS ERROR:", e);
            setWsStatus('DISCONNECTED');
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'bar') {
            processBarRef.current?.(msg.data);
          } else if (msg.type === 'done') {
            setIsRunning(false);
            addLog('ev', 'BACKTEST COMPLETE', 'ok');
          } else if (msg.type === 'reset') {
              candleSeriesRef.current?.setData([]);
              volumeSeriesRef.current?.setData([]);
              setResult(null);
              setLogs([]);
              lastProcessedTimeRef.current = 0;
          }
        };

        wsRef.current = ws;
    };

    connect();
    addLog('ev', 'SOVEREIGN KERNEL BOOT SEQUENCE INITIATED', 'ok');

    return () => {
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (wsStatus !== 'DISCONNECTED') {
      setWsStatus(isRunning ? 'LIVE' : 'PAUSED');
    }
  }, [isRunning]);

  const sendMessage = (msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    addLog('ev', 'WS NOT READY', 'alert');
    return false;
  };

  const processBar = (data: SMKResult) => {
    const bar = data.bar;
    const time = Math.floor(Number(bar.time));
    
    if (time < lastProcessedTimeRef.current) {
        return;
    }
    lastProcessedTimeRef.current = time;

    setResult(data);
    historicalResultsRef.current.set(time, data);

    candleSeriesRef.current?.update({
      time: time as any,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close
    });
    volumeSeriesRef.current?.update({
      time: time as any,
      value: bar.volume,
      color: bar.close >= bar.open ? '#237a4522' : '#aa282822'
    });

    const markers: any[] = [];
    if (data.amd?.changed) {
        addLog('ev', `AMD PHASE SHIFT: ${data.amd.prev} → ${data.amd.state}`, 'warn');
        if (data.amd.state === 'Distribution') {
            markers.push({ time: bar.time as any, position: 'belowBar', color: '#1a6335', shape: 'arrowUp', text: '▲ DIST' });
        } else if (data.amd.state === 'Retracement') {
            markers.push({ time: bar.time as any, position: 'aboveBar', color: '#aa2828', shape: 'arrowDown', text: '▼ RET' });
        }
    }
    if (data.manipulation?.active) {
        if (!lastJudasRef.current) {
            addLog('ev', `JUDAS SWING DETECTED @ ${bar.close.toFixed(5)}`, 'alert');
        }
        lastJudasRef.current = true;
        markers.push({ time: bar.time as any, position: 'aboveBar', color: '#c05000', shape: 'circle', text: 'JUDAS' });
    } else {
        lastJudasRef.current = false;
    }
    if (data.veto?.decision === 'Halt') {
        const lastDecision = result?.veto?.decision;
        if (lastDecision !== 'Halt') {
            data.veto.reasons.forEach(r => addLog('vt', `HALT: ${r}`, 'alert'));
        }
    }

    // SL/TP Monitor
    trades.forEach(t => {
        const pips = (t.side === 'buy' ? (bar.close - t.price) : (t.price - bar.close)) * 10000;
        if (t.sl && pips <= -t.sl) {
            addLog('tr', `STOP LOSS HIT: ${t.side.toUpperCase()} @ ${bar.close.toFixed(5)}`, 'alert');
            closeTrade(t.id);
        } else if (t.tp && pips >= t.tp) {
            addLog('tr', `TAKE PROFIT HIT: ${t.side.toUpperCase()} @ ${bar.close.toFixed(5)}`, 'ok');
            closeTrade(t.id);
        }
    });

    if (markers.length > 0) {
        markersRef.current = [...markersRef.current, ...markers].slice(-200);
        candleSeriesRef.current?.setMarkers(markersRef.current);
    }

    if (data.causality) {
        setCausalGraph(data.causality);
    }

    // Auto Mode execution
    if (autoMode && (data.execution?.action === 'TRADE' || data.execution?.action === 'PROCEED')) {
        const hasLong = trades.some(t => t.side === 'buy');
        const hasShort = trades.some(t => t.side === 'sell');

        if (autoTradeCount < 4) {
            if (data.execution.direction === 1 && !hasLong) {
                openTrade('buy', data.execution.stop_loss_price, data.execution.take_profit_price);
                addLog('tr', `AUTO-BUY [${autoTradeCount + 1}/4]: ${data.execution.reason} -> BUY (SL: ${data.execution.stop_loss_price.toFixed(5)})`, 'ok');
                setAutoTradeCount(prev => prev + 1);
            } else if (data.execution.direction === -1 && !hasShort) {
                openTrade('sell', data.execution.stop_loss_price, data.execution.take_profit_price);
                addLog('tr', `AUTO-SELL [${autoTradeCount + 1}/4]: ${data.execution.reason} -> SELL (SL: ${data.execution.stop_loss_price.toFixed(5)})`, 'alert');
                setAutoTradeCount(prev => prev + 1);
            }
        } else {
            // Log once when limit reached
            if (autoTradeCount === 4) {
                addLog('vt', 'SESSION LIMIT REACHED: 4 AUTO-TRADES COMPLETED', 'warn');
                setAutoTradeCount(5); // Prevent repeat logs
            }
        }
    }

    // Price Line Updates (Execution Levels & Active Trades)
    const activeSL = trades.length > 0 ? trades[0].price - (trades[0].sl / 10000) * (trades[0].side === 'buy' ? 1 : -1) : 0;
    const activeTP = trades.length > 0 ? trades[0].price + (trades[0].tp / 10000) * (trades[0].side === 'buy' ? 1 : -1) : 0;

    const showSL = (data.execution?.is_armed && data.execution.stop_loss_price > 0) ? data.execution.stop_loss_price : (trades.length > 0 ? activeSL : 0);
    const showTP = (data.execution?.is_armed && data.execution.take_profit_price > 0) ? data.execution.take_profit_price : (trades.length > 0 ? activeTP : 0);

    if (showSL > 0) {
        if (!slLineRef.current && candleSeriesRef.current) {
            slLineRef.current = candleSeriesRef.current.createPriceLine({
                price: showSL,
                color: trades.length > 0 ? '#ff0000' : 'var(--down)',
                lineWidth: trades.length > 0 ? 2 : 1,
                lineStyle: 3, // Dashed
                axisLabelVisible: true,
                title: trades.length > 0 ? 'ACTIVE SL' : 'STOP LOSS',
            });
        } else if (slLineRef.current) {
            slLineRef.current.applyOptions({ 
                price: showSL,
                color: trades.length > 0 ? '#ff0000' : 'var(--down)',
                lineWidth: trades.length > 0 ? 2 : 1,
                title: trades.length > 0 ? 'ACTIVE SL' : 'STOP LOSS',
            });
        }
    } else if (slLineRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.removePriceLine(slLineRef.current);
        slLineRef.current = null;
    }

    if (showTP > 0) {
        if (!tpLineRef.current && candleSeriesRef.current) {
            tpLineRef.current = candleSeriesRef.current.createPriceLine({
                price: showTP,
                color: trades.length > 0 ? '#00ff00' : 'var(--up)',
                lineWidth: trades.length > 0 ? 2 : 1,
                lineStyle: 3, // Dashed
                axisLabelVisible: true,
                title: trades.length > 0 ? 'ACTIVE TP' : 'TAKE PROFIT',
            });
        } else if (tpLineRef.current) {
            tpLineRef.current.applyOptions({ 
                price: showTP,
                color: trades.length > 0 ? '#00ff00' : 'var(--up)',
                lineWidth: trades.length > 0 ? 2 : 1,
                title: trades.length > 0 ? 'ACTIVE TP' : 'TAKE PROFIT',
            });
        }
    } else if (tpLineRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.removePriceLine(tpLineRef.current);
        tpLineRef.current = null;
    }

    if (autoMode && data.execution?.action === 'HALT' && trades.length > 0) {
        setTrades([]);
        addLog('tr', `AUTO-SYSTEM: ${data.execution.reason} -> EMERGENCY LIQUIDATION`, 'alert');
    }

    // Ensure chart advances
    if (chartRef.current && isRunning) {
        chartRef.current.timeScale().scrollToRealTime();
    }
  };

  processBarRef.current = processBar;

  const addLog = (panel: 'ev' | 'tr' | 'vt', msg: string, flavor: string = 'info') => {
    const colors: any = { ok: '#237a45', alert: '#c05000', warn: '#d96000', info: '#444' };
    setLogs(prev => [{ panel, msg, color: colors[flavor] || '#444' }, ...prev].slice(0, 100));
  };

  const loadData = async (type: string) => {
    try {
        // Clear old sessions
        candleSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        markersRef.current = [];
        candleSeriesRef.current?.setMarkers([]);
        historicalResultsRef.current.clear();
        setResult(null);

        const resp = await fetch(`/api/load/${type}`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: type === 'bitget' ? JSON.stringify({ symbol: 'BTCUSDT' }) : undefined
        });
        const data = await resp.json();
        if (data.status === 'ok') {
            setDataLoaded(true);
            setSource(type.toUpperCase());
            addLog('ev', `LOADED ${data.count} BARS FROM ${data.source}`, 'ok');
            
            if (data.snapshot && Array.isArray(data.snapshot)) {
                const results = data.snapshot;
                const candleData = results.map((r: any) => r.bar);
                const volumeData = results.map((r: any) => ({
                    time: r.bar.time,
                    value: r.bar.volume,
                    color: r.bar.close >= r.bar.open ? '#237a4522' : '#aa282822'
                }));
                candleSeriesRef.current?.setData(candleData);
                volumeSeriesRef.current?.setData(volumeData);
                setResult(results[results.length - 1]);
                lastProcessedTimeRef.current = Math.floor(Number(results[results.length - 1].bar.time));
                results.forEach((r: any) => historicalResultsRef.current.set(r.bar.time, r));
            }

            // Initial view sync
            setTimeout(() => {
              chartRef.current?.timeScale().fitContent();
            }, 50);
        }
    } catch (err) {
        addLog('ev', 'LOAD FAILED', 'alert');
    }
  };

  const loadCSV = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const resp = await fetch('/api/load/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: file.name })
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        setDataLoaded(true);
        setSource('CSV:' + file.name.toUpperCase());
        addLog('ev', `LOADED ${data.count} BARS FROM ${file.name}`, 'ok');

        if (data.snapshot && Array.isArray(data.snapshot)) {
            const results = data.snapshot;
            const candleData = results.map((r: any) => r.bar);
            const volumeData = results.map((r: any) => ({
                time: r.bar.time,
                value: r.bar.volume,
                color: r.bar.close >= r.bar.open ? '#237a4522' : '#aa282822'
            }));
            candleSeriesRef.current?.setData(candleData);
            volumeSeriesRef.current?.setData(volumeData);
            setResult(results[results.length - 1]);
            lastProcessedTimeRef.current = Math.floor(Number(results[results.length - 1].bar.time));
            results.forEach((r: any) => historicalResultsRef.current.set(r.bar.time, r));
            setTimeout(() => {
              chartRef.current?.timeScale().fitContent();
            }, 50);
        }
      }
    } catch (err) {
      addLog('ev', 'CSV LOAD FAILED', 'alert');
    }
  };

  const toggleRun = () => {
    if (isRunning) {
        if (sendMessage({ action: 'stop' })) {
            setIsRunning(false);
        }
    } else {
        if (sendMessage({ action: 'run', speed })) {
            setIsRunning(true);
        }
    }
  };

  const step = () => {
      sendMessage({ action: 'step' });
  };

  const reset = () => {
      if (sendMessage({ action: 'reset' })) {
          setIsRunning(false);
          setRealizedPnl(0);
          setTrades([]);
          setHistory([]);
          setSummary({ wins: 0, losses: 0 });
          setAutoTradeCount(0);
          lastJudasRef.current = false;
          markersRef.current = [];
          historicalResultsRef.current.clear();
          candleSeriesRef.current?.setData([]);
          volumeSeriesRef.current?.setData([]);
          setResult(null);
          setLogs([]);
          lastProcessedTimeRef.current = 0;
      }
  };

  const openTrade = (side: 'buy' | 'sell', sl_price?: number, tp_price?: number) => {
      if (!result) return;
      const price = result.bar.close;
      const id = Date.now();
      
      // Calculate SL/TP in pips for the monitor, or use defaults
      const sl = sl_price ? Math.abs(price - sl_price) * 10000 : stopLoss;
      const tp = tp_price ? Math.abs(price - tp_price) * 10000 : takeProfit;

      setTrades(prev => [...prev, { 
          id, side, price, lots: lotSize, 
          sl, tp, 
          venue: result.execution?.venue_allocation?.[0] || 'DEFAULT'
      }]);
      addLog('tr', `OPEN ${side.toUpperCase()} ${lotSize} @ ${price.toFixed(5)} [SL:${sl.toFixed(1)} TP:${tp.toFixed(1)}]`, side === 'buy' ? 'ok' : 'alert');
  };

  const closeTrade = (id: number) => {
      setTrades(currentTrades => {
          const trade = currentTrades.find(t => t.id === id);
          if (!trade || !result) return currentTrades;
          
          const currentPrice = result.bar.close;
          const pips = (trade.side === 'buy' ? (currentPrice - trade.price) : (trade.price - currentPrice)) * 10000;
          const profit = pips * trade.lots;
          
          const closedTrade = {
            ...trade,
            closePrice: currentPrice,
            pips,
            profit,
            closedAt: result.bar.time
          };

          setHistory(prev => [closedTrade, ...prev].slice(0, 50));
          setRealizedPnl(prev => prev + profit);
          setSummary(prev => ({
              wins: pips > 0 ? prev.wins + 1 : prev.wins,
              losses: pips <= 0 ? prev.losses + 1 : prev.losses
          }));
          
          addLog('tr', `CLOSE ${trade.side.toUpperCase()} @ ${currentPrice.toFixed(5)} | ${pips >= 0 ? '+' : ''}${pips.toFixed(1)}p`, pips >= 0 ? 'ok' : 'alert');
          return currentTrades.filter(t => t.id !== id);
      });
  };

  const openPnlProfit = result ? trades.reduce((sum, t) => {
      const p = (t.side === 'buy' ? (result.bar.close - t.price) : (t.price - result.bar.close)) * 10000 * t.lots;
      return sum + p;
  }, 0) : 0;

  const buySignal = result && (result.fusion?.p_fused || 0) > 0.45 && (result.fusion?.confidence || 0) > 0.6 && result.veto?.decision === 'Proceed';
  const sellSignal = result && (result.fusion?.p_fused || 0) < -0.45 && (result.fusion?.confidence || 0) > 0.6 && result.veto?.decision === 'Proceed';
  
  // Auto-close on opposing signal (Flip)
  useEffect(() => {
     if (autoMode && result) {
        if (buySignal) {
           trades.filter(t => t.side === 'sell').forEach(t => closeTrade(t.id));
        }
        if (sellSignal) {
           trades.filter(t => t.side === 'buy').forEach(t => closeTrade(t.id));
        }
     }
  }, [buySignal, sellSignal, autoMode, result]);

  const closeSignal = trades.length > 0 && (result?.veto?.decision === 'Halt' || (openPnlProfit > 10));

  const netPnl = realizedPnl + openPnlProfit;
  const winRate = (summary.wins + summary.losses) > 0 ? (summary.wins / (summary.wins + summary.losses) * 100).toFixed(0) + '%' : '--%';
  const initialBalance = 10000;
  const currentReturnPct = (netPnl / initialBalance) * 100;

  useEffect(() => {
    if (profitTargetEnabled && currentReturnPct >= profitTargetPct && trades.length > 0) {
      addLog('ev', `TARGET REACHED: ${currentReturnPct.toFixed(2)}% | Closing all...`, 'ok');
      // Programmatic closure
      trades.forEach(t => closeTrade(t.id));
    }
  }, [currentReturnPct, profitTargetEnabled, profitTargetPct, trades]);

  const toggleModule = (id: string) => {
    setModuleStates(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const applySettings = async () => {
    const disabled = MODULE_DEFS.filter(m => !moduleStates[m.id]).map(m => m.id);
    try {
      await fetch('/api/config/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled_modules: disabled })
      });
      addLog('ev', `CONFIG APPLIED: ${disabled.length} MODULES DISABLED`, 'ok');
      setSettingsOpen(false);
    } catch (err) {
      addLog('ev', 'CONFIG FAILED', 'alert');
    }
  };

  const resetSettings = () => {
    setModuleStates(Object.fromEntries(MODULE_DEFS.map(m => [m.id, true])));
  };

  return (
    <div className="shell">
      {/* SOURCE MODAL */}
      {sourceModalOpen && (
        <div className="modal-backdrop" onClick={() => setSourceModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <span className="modal-t">BROKER / API CONFIGURATION</span>
              <button onClick={() => setSourceModalOpen(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="api-group">
                <div className="api-t">CENTRALIZED EXCHANGES</div>
                <div className="api-row">
                  <span className="api-lbl">BITGET API KEY</span>
                  <input type="text" className="t-input" placeholder="Enter key..." />
                  <span className="api-lbl">SECRET</span>
                  <input type="password" className="t-input" placeholder="••••••••" />
                </div>
              </div>
              <div className="api-group">
                <div className="api-t">TRADING TERMINALS</div>
                <div className="api-row">
                  <span className="api-lbl">METATRADER 5 ADDRESS</span>
                  <input type="text" className="t-input" placeholder="127.0.0.1:8000" />
                  <span className="api-lbl">TV WEBHOOK URL</span>
                  <input type="text" className="t-input" placeholder="https://hooks.tradingview.com/..." />
                </div>
              </div>
              <div className="api-group">
                <div className="api-t">ETORO / SOCIAL CONNECT</div>
                <button className="btn w-full py-2 mb-2" onClick={() => addLog('ev', 'AUTHENTICATING ETORO...', 'warn')}>OAUTH CONNECT</button>
              </div>
              <div className="flex gap-2">
                <button className="btn-block btn-prime" onClick={() => { setSourceModalOpen(false); addLog('ev', 'API CONFIG SAVED', 'ok'); }}>SAVE CONFIG</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS DRAWER */}
      <div className={`drawer-backdrop ${settingsOpen ? 'open' : ''}`} onClick={() => setSettingsOpen(false)} />
      <div className={`drawer ${settingsOpen ? 'open' : ''}`}>
        <div className="drawer-hdr">
          <span className="drawer-title">MODULE CONFIGURATION</span>
          <button className="p-1 hover:bg-zinc-100 rounded" onClick={() => setSettingsOpen(false)}><X size={14}/></button>
        </div>
        <div className="mod-list">
          {MODULE_DEFS.map(m => {
            const on = moduleStates[m.id];
            const col = LAYER_COLORS[m.layer] || '#888';
            return (
              <div key={m.id} className="mod-item" onClick={() => toggleModule(m.id)}>
                <div className="mod-dot" style={{ background: on ? col : 'var(--b3)' }} />
                <span className="mod-layer" style={{ borderColor: col, color: col }}>{m.layer}</span>
                <span className="mod-name" style={{ color: on ? 'var(--t1)' : 'var(--t4)' }}>{m.name}</span>
                <span className="mod-sts" style={{ color: on ? 'var(--up)' : 'var(--down)' }}>{on ? 'ON' : 'OFF'}</span>
              </div>
            );
          })}
        </div>
        <div className="drawer-ftr">
          <button className="btn-block" onClick={resetSettings}>RESET ALL</button>
          <button className="btn-block btn-prime" onClick={applySettings}>APPLY</button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="tb">
        <span className="logo">QUIMERIA / SMK</span>
        <span className={`pill ${result?.veto?.decision === 'Halt' ? 'p-alert' : 'p-ok'}`}>
          {result?.veto?.decision === 'Halt' ? 'HALTED' : 'ONLINE'}
        </span>
        <span className={`pill ${result?.amd?.state === 'Manipulation' ? 'p-warn' : 'p-off'}`}>
          AMD:{result?.amd?.state.toUpperCase().slice(0,3) || 'ACC'}
        </span>
        <span className="pill p-off">
          REGIME:{result?.kl?.stable ? 'STABLE' : 'FRACT'}
        </span>
        <span className="pill p-off">SRC:{source}</span>
        {isRunning && <div className="dot"></div>}

        <div className="flex gap-1 ml-2">
            <button 
                className={`btn ${viewMode === 'chart' ? 'bg-zinc-200 border-zinc-400' : ''}`}
                onClick={() => setViewMode('chart')}
                title="Chart View"
            >
                <BarChart2 size={12} />
            </button>
            <button 
                className={`btn ${viewMode === 'matrix' ? 'bg-zinc-200 border-zinc-400' : ''}`}
                onClick={() => setViewMode('matrix')}
                title="Matrix View"
            >
                <LayoutGrid size={12} />
            </button>
            <button 
                className={`btn ${viewMode === 'causality' ? 'bg-zinc-200 border-zinc-400' : ''}`}
                onClick={() => setViewMode('causality')}
                title="Causality Manifold"
            >
                <Activity size={12} />
            </button>
            <button 
                className={`btn ${aiOpen ? 'bg-blue-100 border-blue-400' : ''}`}
                onClick={() => setAiOpen(!aiOpen)}
                title="AI Core"
            >
                <MessageSquare size={12} className={aiOpen ? 'text-blue-600' : ''} />
            </button>
        </div>
        
        <div className="tb-r">
          <label className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors mr-2">
            <input 
              type="checkbox" 
              className="w-3 h-3 accent-blue-500" 
              checked={profitTargetEnabled} 
              onChange={(e) => setProfitTargetEnabled(e.target.checked)}
            />
            <span className="text-[10px] text-gray-400 font-mono">AUTO-CLOSE 2%</span>
          </label>
          <span className={`pill ${wsStatus === 'LIVE' ? 'p-ok' : wsStatus === 'PAUSED' ? 'p-warn' : 'p-alert'} flex items-center gap-1.5`}>
            <div className={`status-dot ${wsStatus === 'LIVE' ? 'sd-live' : wsStatus === 'PAUSED' ? 'sd-paused' : 'sd-off'}`} />
            WS:{wsStatus}
          </span>
          <span>
            {result ? new Date(result.bar.time * 1000).toISOString().replace('T', ' ').slice(11, 16) + 'Z' : '--:--Z'} | BAR {result?.bar_index || 0}/{result?.total_bars || 0}
          </span>
        </div>
      </div>

      <div className="main-content">
        {/* LEFT PANEL */}
        <div className="lp">
          <div className="phdr">LAMBDA SENSORS</div>
          <div className="flex-1 overflow-y-auto">
            {result?.sensors?.map(s => (
              <div key={s.id} className="srow">
                <span className="sn" style={{ color: s.active ? 'var(--t2)' : 'var(--t4)' }}>{s.name}</span>
                <div className="sbar">
                  <div className="sbf" style={{ 
                    width: `${(s.score * 100).toFixed(0)}%`,
                    background: s.active ? (['s03','s09','s10','s13'].includes(s.id as any) ? 'var(--alert)' : 'var(--t2)') : 'var(--b2)'
                  }}></div>
                </div>
                <span className="sv">{(s.score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div className="phdr">CAUSAL LAYER</div>
          <div className="caur"><span className="cl">GRANGER</span><span>{result?.displacement?.is_disp ? 'CAUSAL' : 'NONE'}</span></div>
          <div className="caur"><span className="cl">TRANS ENT</span><span>0.434</span></div>
          <div className="caur"><span className="cl">CCM ρ</span><span>0.493</span></div>
          <div className="caur"><span className="cl">SPEARMAN τ</span><span>τ=2</span></div>
          <div className="caur" style={{ borderBottom: 'none' }}><span className="cl">DECAY e^τ</span><span>0.852</span></div>
        </div>

        {/* CENTER COLUMN */}
        <div className="cc">
          <div className="cbar">
            <span className={`cb ${result?.amd?.state === 'Manipulation' ? 'cb-alert' : ''}`}>AMD:{result?.amd?.state.toUpperCase().slice(0,3) || 'ACC'}</span>
            <span className="cb">ZONE:{result?.dealing_range?.zone.toUpperCase().slice(0,4) || '--'}</span>
            <span className="cb">SES:{result?.session?.name.split('_')[0] || '--'}</span>
            <span className="cb">BIAS:{result?.bias?.bias.slice(0,4) || '--'}</span>
            <span className="cb">PHASE:{result?.ipda_phase?.phase.slice(0,4) || '--'}</span>
            <span className="cb font-mono tracking-[0.2em] text-[7px] bg-white text-zinc-800 border border-zinc-200 px-1 rounded">SEQ:{result?.smart?.sequence.slice(-10) || '----------'}</span>
            {result?.fvg?.active && <span className="cb cb-alert">FVG</span>}
            {result?.ob?.active && <span className="cb">OB</span>}
            {result?.manipulation?.active && <span className="cb cb-alert">JUDAS</span>}
            {result?.displacement?.is_disp && <span className="cb">DISP</span>}
          </div>

          <div className="pos-bar">
            {trades.length === 0 ? (
              <span className="no-pos">NO OPEN POSITIONS</span>
            ) : (
              trades.map(t => {
                const pips = (t.side === 'buy' ? (result!.bar.close - t.price) : (t.price - result!.bar.close)) * 10000;
                const profit = pips * t.lots;
                return (
                  <div key={t.id} className="pos-item">
                    <div className={`pdot ${t.side === 'buy' ? 'pdot-l' : 'pdot-s'}`}></div>
                    <span className="plbl">{t.side.toUpperCase()}</span>
                    <span className="pval">{t.lots}@{t.price.toFixed(5)}</span>
                    <span className={pips >= 0 ? 'pnl-p' : 'pnl-n'}>{pips >= 0 ? '+' : ''}{pips.toFixed(1)}p ({profit >= 0 ? '+' : ''}{profit.toFixed(2)})</span>
                    <button className={`pcls ${closeSignal ? 'close-signal' : ''}`} onClick={() => closeTrade(t.id)}>CLOSE</button>
                  </div>
                );
              })
            )}
          </div>

          <div className="chart-wrap" style={{ visibility: viewMode === 'chart' ? 'visible' : 'hidden', position: viewMode === 'chart' ? 'relative' : 'absolute', zIndex: viewMode === 'chart' ? 1 : -1, width: '100%', height: viewMode === 'chart' ? '100%' : '0' }}>
            <div ref={chartContainerRef} className="absolute inset-0" />
            <div className="hud">
              <div className="hud-r">
                O:{(hoverData || result)?.bar.open.toFixed(5) || '--'} H:{(hoverData || result)?.bar.high.toFixed(5) || '--'} L:{(hoverData || result)?.bar.low.toFixed(5) || '--'} C:{(hoverData || result)?.bar.close.toFixed(5) || '--'}
              </div>
              <div className="hud-r">VOL:{(hoverData || result)?.bar.volume.toLocaleString() || '--'}</div>
              {hoverData && (
                <div className="hud-r" style={{ color: 'var(--alert)', fontWeight: 800 }}>
                  AMD:{(hoverData.amd?.state || '---').toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {viewMode === 'matrix' && (
            <div className="matrix-view">
                <div className="matrix-grid">
                    {Array.from(historicalResultsRef.current.values()).sort((a: any, b: any) => a.bar.time - b.bar.time).map((res: any, i) => (
                        <div key={res.bar.time} className="matrix-cell" style={{ 
                            color: res.bar.close >= res.bar.open ? 'var(--up)' : 'var(--down)',
                            background: res.smart?.symbol === 'B' ? '#e6f4ea' : res.smart?.symbol === 'I' ? '#fce8e6' : 'transparent'
                        }}>
                            {res.smart?.symbol || 'X'}
                        </div>
                    ))}
                    {isRunning && <div className="matrix-cell animate-pulse border-l-2 border-zinc-400 font-bold">_</div>}
                </div>
            </div>
          )}

          {viewMode === 'causality' && (
            <div className="causality-view p-4 bg-zinc-50 overflow-y-auto">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="text-blue-600" size={16} />
                    <h3 className="font-bold text-sm tracking-tight text-zinc-800">LEAD-LAG CAUSALITY MANIFOLD</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* GRANGER */}
                    <div className="bg-white p-3 border border-zinc-200 rounded shadow-sm">
                        <div className="text-[10px] text-zinc-400 font-mono mb-1">λ7 / GRANGER F-TEST</div>
                        <div className="flex justify-between items-end">
                            <div className="text-xl font-bold text-zinc-900">
                                {causalGraph?.granger?.conf ? (causalGraph.granger.conf * 100).toFixed(0) : 0}%
                            </div>
                            <div className={`text-[10px] px-1 rounded ${causalGraph?.granger?.significant ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                                {causalGraph?.granger?.significant ? 'CAUSAL' : 'STOCHASTIC'}
                            </div>
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-2 font-mono">OPTIMAL LAG τ = {causalGraph?.granger?.lag || 0}</div>
                    </div>

                    {/* TRANSFER ENTROPY */}
                    <div className="bg-white p-3 border border-zinc-200 rounded shadow-sm">
                        <div className="text-[10px] text-zinc-400 font-mono mb-1">λ-TE / INFORMATION FLOW</div>
                        <div className="flex justify-between items-end">
                            <div className="text-xl font-bold text-zinc-900">
                                {causalGraph?.transfer?.flow ? causalGraph.transfer.flow.toFixed(4) : "0.0000"}
                            </div>
                            <div className={`text-[10px] px-1 rounded ${causalGraph?.transfer?.significant ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                                {causalGraph?.transfer?.significant ? 'DIR-FLOW' : 'EQUILIBRIUM'}
                            </div>
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-2 font-mono">MM-CORRECTED ENTROPY</div>
                    </div>

                    {/* CCM */}
                    <div className="bg-white p-3 border border-zinc-200 rounded shadow-sm">
                        <div className="text-[10px] text-zinc-400 font-mono mb-1">λ-CCM / SHADOW MANIFOLD</div>
                        <div className="flex justify-between items-end">
                            <div className="text-xl font-bold text-zinc-900">
                                {causalGraph?.ccm?.rho ? causalGraph.ccm.rho.toFixed(3) : "0.000"}
                            </div>
                            <div className={`text-[10px] px-1 rounded ${causalGraph?.ccm?.convergent ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                                {causalGraph?.ccm?.convergent ? 'CONVERGENT' : 'DIVERGENT'}
                            </div>
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-2 font-mono">ρ SKILL (TAKENS EMBEDDING)</div>
                    </div>

                    {/* SPEARMAN */}
                    <div className="bg-white p-3 border border-zinc-200 rounded shadow-sm">
                        <div className="text-[10px] text-zinc-400 font-mono mb-1">λ-RANK / SPEARMAN τ</div>
                        <div className="flex justify-between items-end">
                            <div className="text-xl font-bold text-zinc-900">
                                {causalGraph?.spearman?.rho ? causalGraph.spearman.rho.toFixed(3) : "0.000"}
                            </div>
                            <div className={`text-[10px] px-1 rounded ${causalGraph?.spearman?.significant ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                                {causalGraph?.spearman?.significant ? 'MONOTONIC' : 'DRIFT'}
                            </div>
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-2 font-mono">PEAK LAG τ = {causalGraph?.spearman?.lag || 0}</div>
                    </div>
                </div>

                <div className="mt-6 p-4 border-2 border-dashed border-zinc-200 rounded bg-white text-center">
                    <p className="text-xs text-zinc-400 font-mono italic">
                        [ SYSTEM ANALYSIS ]<br />
                        DETECTING LEAD-LAG RELATIONSHIPS BETWEEN VOLUME (LEAD) AND PRICE (TARGET) MANIFOLD.
                    </p>
                    {causalGraph?.granger?.significant && (
                        <div className="mt-2 text-[10px] text-emerald-600 font-bold">
                            VOLUME LEADS PRICE WITH τ={causalGraph.granger.lag} BARS (CONF: {(causalGraph.granger.conf * 100).toFixed(1)}%)
                        </div>
                    )}
                </div>
            </div>
          )}

          <div className="logs">
            <div className="lbox">
              <div className="lbh">EVENT LOG</div>
              <div className="lba">
                {logs.filter(l => l.panel === 'ev').map((l, i) => <div key={i} className="ll" style={{ color: l.color }}>{l.msg}</div>)}
              </div>
            </div>
            <div className="lbox">
              <div className="lbh">VETO STREAM</div>
              <div className="lba">
                {logs.filter(l => l.panel === 'vt').map((l, i) => <div key={i} className="ll" style={{ color: l.color }}>{l.msg}</div>)}
              </div>
            </div>
            <div className="lbox">
              <div className="lbh">TRADE LOG</div>
              <div className="lba">
                {logs.filter(l => l.panel === 'tr').map((l, i) => <div key={i} className="ll" style={{ color: l.color }}>{l.msg}</div>)}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="rp">
          <div className="rb">
            <div className="rl">EXECUTION ENGINE</div>
            <div className={`veto-banner mb-2 ${result?.execution?.action === 'HALT' ? 'vb-halt' : result?.execution?.action === 'PROCEED' ? 'vb-proceed' : ''}`}>
              {result?.execution?.action === 'PROCEED' ? 'EXECUTION ARMED' : result?.execution?.action || 'IDLE'}
            </div>
            <div className="caur"><span className="cl">SIGNAL</span><span className={result?.execution?.direction === 1 ? 'text-green-600 font-bold' : result?.execution?.direction === -1 ? 'text-red-600 font-bold' : 'text-zinc-400'}>{result?.execution?.direction === 1 ? 'BUY' : result?.execution?.direction === -1 ? 'SELL' : 'NONE'}</span></div>
            <div className="caur"><span className="cl">REASON</span><span className="text-[7px] truncate max-w-[100px] text-zinc-500 uppercase">{result?.execution?.reason || '--'}</span></div>
            <div className="caur"><span className="cl">PATTERN</span><span className="font-mono text-zinc-600 tracking-widest">{result?.execution?.pattern || '--'}</span></div>
            <div className="caur" style={{ borderBottom: 'none' }}><span className="cl">RISK PIPS</span><span className="text-zinc-600">{result?.execution?.risk_pips?.toFixed(1) || '0.0'}p</span></div>
          </div>

          <div className="trade-panel">
            <div className="rl">TRADE SIMULATOR</div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <div className="t-lbl">LOTS</div>
                <input 
                  type="number" 
                  className="t-input" 
                  value={lotSize} 
                  onChange={e => setLotSize(parseFloat(e.target.value))}
                  step={0.01}
                />
              </div>
              <div className="flex-1">
                <div className="t-lbl">SL (p)</div>
                <input 
                  type="number" 
                  className="t-input" 
                  value={stopLoss} 
                  onChange={e => setStopLoss(parseFloat(e.target.value))}
                  step={1}
                />
              </div>
              <div className="flex-1">
                <div className="t-lbl">TP (p)</div>
                <input 
                  type="number" 
                  className="t-input" 
                  value={takeProfit} 
                  onChange={e => setTakeProfit(parseFloat(e.target.value))}
                  step={1}
                />
              </div>
            </div>
            <div className="t-lbl">ENTRY PRICE</div>
            <input 
              type="text" 
              className="t-input" 
              value={result?.bar.close ? result.bar.close.toFixed(5) : '--'} 
              readOnly 
            />
            <div className="trade-row">
              <button className={`btn-buy ${buySignal ? 'signal-active' : ''}`} onClick={() => openTrade('buy')}>▲ BUY</button>
              <button className={`btn-sell ${sellSignal ? 'signal-active' : ''}`} onClick={() => openTrade('sell')}>▼ SELL</button>
            </div>
            <button className={`btn-ca ${closeSignal ? 'close-signal' : ''}`} onClick={() => setTrades([])}>CLOSE ALL POSITIONS</button>
          </div>

          <div className="rb">
            <div className="rl">P&L SUMMARY</div>
            <div className="pnl-row"><span className="pk">OPEN TRADES</span><span className="pv">{trades.length}</span></div>
            <div className="pnl-row"><span className="pk">UNREALISED</span><span className={`pv ${openPnlProfit >= 0 ? 'pv-up' : 'pv-dn'}`}>{openPnlProfit >= 0 ? '+' : ''}{openPnlProfit.toFixed(2)} p</span></div>
            <div className="pnl-row"><span className="pk">REALISED</span><span className={`pv ${realizedPnl >= 0 ? 'pv-up' : 'pv-dn'}`}>{realizedPnl >= 0 ? '+' : ''}{realizedPnl.toFixed(2)} p</span></div>
            <div className="pnl-row"><span className="pk">NET P&L</span><span className={`pv ${netPnl >= 0 ? 'pv-up' : 'pv-dn'}`}>{netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)} p</span></div>
            <div className="pnl-row"><span className="pk">WIN RATE</span><span className="pv font-bold">{winRate}</span></div>
            <div className="pnl-row"><span className="pk">TRADES</span><span className="pv">{summary.wins + summary.losses} (W:{summary.wins} L:{summary.losses})</span></div>
          </div>

          {history.length > 0 && (
            <div className="rb">
              <div className="rl">RECENT HISTORY</div>
              <div className="max-h-[120px] overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <div key={i} className="flex justify-between text-[8px] py-1 border-b border-zinc-100 last:border-0">
                    <span className={h.side === 'buy' ? 'text-green-600' : 'text-red-600'}>
                      {h.side.toUpperCase()} {h.lots}
                    </span>
                    <span className={h.pips >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {h.pips >= 0 ? '+' : ''}{h.pips.toFixed(1)}p
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rb">
            <div className="rl">FUSED SIGNAL</div>
            <div className="fg">
              <div className="fc"><div className="fcl">P_FUSED</div><div className="fcv" style={{ color: (result?.fusion?.p_fused || 0) > 0 ? 'var(--up)' : 'var(--down)' }}>{(result?.fusion?.p_fused || 0).toFixed(4)}</div></div>
              <div className="fc"><div className="fcl">CONF</div><div className="fcv">{(result?.fusion?.confidence || 0).toFixed(3)}</div></div>
              <div className="fc"><div className="fcl">REGIME</div><div className="fcv rv-s">{(result?.fusion?.regime || 'STABLE').slice(0, 8)}</div></div>
              <div className="fc"><div className="fcl">LAMBDAS</div><div className="fcv">{result?.fusion?.active_lambdas.length || 0}</div></div>
            </div>
          </div>

          <div className="rb">
            <div className="rl">DEALING RANGE</div>
            <div className="caur"><span className="cl">DR HIGH</span><span>{result?.dealing_range?.high.toFixed(5) || '--'}</span></div>
            <div className="caur"><span className="cl">EQUIL</span><span>{result?.dealing_range?.eq.toFixed(5) || '--'}</span></div>
            <div className="caur"><span className="cl">DR LOW</span><span>{result?.dealing_range?.low.toFixed(5) || '--'}</span></div>
            <div className="caur"><span className="cl">ZONE</span><span>{result?.dealing_range?.zone || '--'}</span></div>
            <div className="caur" style={{ borderBottom: 'none' }}><span className="cl">COHER</span><span>{result?.dealing_range?.coherence?.toFixed(3) || '--'}</span></div>
          </div>

          <div className="rb">
            <div className="rl">REGIME / TOPOLOGY</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><div className="text-[8px] text-zinc-500">KL</div><div className="rv-s">{result?.kl?.score?.toFixed(3) || '--'}</div></div>
              <div><div className="text-[8px] text-zinc-500">H1 𝒯</div><div className="rv-s">{result?.topology?.h1_score?.toFixed(2) || '--'}</div></div>
            </div>
            <div className="rl">TOPO H1</div>
            <div className="mbar">
              <div className="mbf" style={{ 
                width: `${Math.min(100, (result?.topology?.h1_score || 0) * 20)}%`,
                background: (result?.topology?.h1_score || 0) > 3.5 ? 'var(--alert)' : 'var(--b3)'
              }}></div>
            </div>
          </div>

          <div className="rb border-b-0">
             <div className="rl">VOLATILITY λ1</div>
             <div className="caur"><span className="cl">V_t/ATR</span><span>{(result?.vol_decay?.ratio || 0).toFixed(4)}</span></div>
             <div className="caur" style={{ borderBottom: 'none' }}><span className="cl">ENTRAP</span><span style={{ color: result?.vol_decay?.entrapped ? 'var(--alert)' : 'var(--t4)' }}>{result?.vol_decay?.entrapped ? 'YES' : 'NO'}</span></div>
          </div>
        </div>
      </div>

      <div className="ctrl">
        <button className="btn" onClick={() => setSourceModalOpen(true)}>DATA SOURCE</button>
        <button className="btn" onClick={() => setSettingsOpen(true)}><Settings size={10} className="inline mr-1"/>SETTINGS</button>
        <button className={`btn btn-auto ${autoMode ? 'active' : ''}`} onClick={() => setAutoMode(!autoMode)}>
          AUTO-TRADE {autoMode ? 'ON' : 'OFF'} ({Math.min(4, autoTradeCount)}/4)
          <span className={`mcp-pill ${autoMode ? 'active' : ''}`}>MCP_NODE</span>
        </button>

        <div className="w-[1px] h-4 bg-zinc-200 mx-1" />

        <button className="btn" style={{ borderColor: 'var(--up)', color: 'var(--up)', fontWeight: 700 }} onClick={() => loadData('bitget')}>◉ LIVE</button>
        
        <label className="btn" style={{ cursor: 'pointer' }}>
          CSV
          <input type="file" className="hidden" accept=".csv,.txt" onChange={loadCSV} />
        </label>

        <button className="btn" onClick={() => loadData('sample')}>SAMPLE</button>
        
        {!isRunning ? (
          <button className="btn btn-g" onClick={toggleRun} disabled={!dataLoaded}>▶ RUN</button>
        ) : (
          <button className="btn btn-r" onClick={toggleRun}>■ STOP</button>
        )}
        
        <button className="btn" onClick={step} disabled={!dataLoaded}>STEP</button>
        <button className="btn" onClick={reset}>RESET</button>
        
        <select className="sel" value={speed} onChange={e => setSpeed(parseInt(e.target.value))}>
          <option value={500}>1x</option>
          <option value={150}>3x</option>
          <option value={50}>10x</option>
          <option value={16}>MAX</option>
        </select>
        
        <span className="flbl">{dataLoaded ? `${source} LOADED` : 'no data loaded'}</span>
        
        <div className="pbar">
           <div className="pbf" style={{ width: `${((result?.bar_index || 0) / (result?.total_bars || 1) * 100).toFixed(0)}%` }}></div>
        </div>
      </div>

      <div className={`ai-drawer ${aiOpen ? 'ai-drawer-open' : ''}`}>
          <div className="ai-chat-header">
              <span className="font-bold text-[10px] flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${isAiLoading ? 'animate-spin text-orange-500' : 'text-blue-500'}`} />
                  GEMINI AI CORE (OFF-CANVAS)
              </span>
              <div className="flex items-center gap-2">
                  <span className="text-[8px] opacity-50 uppercase tracking-widest">L4 INTELLIGENCE LAYER</span>
                  <button onClick={() => setAiOpen(false)} className="p-1 hover:bg-zinc-200 rounded">
                      <ChevronDown size={14} />
                  </button>
              </div>
          </div>
          <div className="ai-chat-messages" ref={chatScrollRef}>
              {chatMessages.length === 0 && (
                  <div className="text-[9px] text-zinc-500 italic p-4 text-center">
                      ESTABLISHING LINK... WAITING FOR INSTRUCTION.
                  </div>
              )}
              {chatMessages.map((m, i) => (
                  <div key={i} className={`ai-msg ${m.role}`}>
                      <span className="role-lbl">{m.role === 'user' ? 'OPERATOR' : 'KERNEL'}:</span>
                      <p className="msg-txt">{m.text}</p>
                  </div>
              ))}
          </div>
          <form className="ai-chat-form mt-auto bg-[#101014] border-t border-zinc-800" onSubmit={onChatSubmit}>
              <input 
                  type="text" 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                  placeholder="ASK SMK KERNEL... (e.g. 'explain λ1' or 'show bias')"
                  className="ai-chat-input"
                  style={{ background: 'transparent' }}
                  disabled={isAiLoading}
              />
              <button type="submit" className="ai-chat-btn" disabled={isAiLoading || !chatInput.trim()}>
                  {isAiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
              </button>
          </form>
      </div>
    </div>
  );
}
