import { useState, useEffect, useRef } from 'react';

// Only symbols that QUIMERIA's λ sensors use
const QUIMERIA_SYMBOLS = [
  { id: 'DXY', name: 'DXY', pair: 'USDX', weight: 0.60, color: '#2563eb' },      // λ₇ primary
  { id: 'EURUSD', name: 'EUR/USD', pair: 'EURUSD', weight: 0.00, color: '#888' }, // Target
  { id: 'SPX', name: 'S&P 500', pair: 'SPX', weight: 0.20, color: '#10b981' },    // λ₇ risk regime
  { id: 'GOLD', name: 'Gold', pair: 'XAUUSD', weight: 0.05, color: '#f59e0b' },    // λ₇ commodity
  { id: 'BTC', name: 'Bitcoin', pair: 'BTCUSD', weight: 0.05, color: '#ef4444' },  // Risk proxy
  { id: 'US10Y', name: '10Y Yield', pair: 'US10Y', weight: 0.10, color: '#8b5cf6' }, // λ₇ carry
];

interface PriceData {
  symbol: string;
  price: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

export function QuimeriaTicker({ onUpdate }: { onUpdate?: (data: any) => void }) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [lambdaScore, setLambdaScore] = useState(0.72);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Single WebSocket connection for real-time crypto/forex proxies
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!Array.isArray(data)) return;

      const updates: Record<string, PriceData> = {};
      data.forEach((ticker: any) => {
        const symbol = ticker.s;
        let quimeriaId: string | null = null;
        
        if (symbol === 'EURUSDT') quimeriaId = 'EURUSD';
        else if (symbol === 'BTCUSDT') quimeriaId = 'BTC';
        else if (symbol === 'XAUUSDT') quimeriaId = 'GOLD';
        
        if (quimeriaId) {
          const price = parseFloat(ticker.c);
          const cp = parseFloat(ticker.P); // 24h change percent
          
          updates[quimeriaId] = {
            symbol: quimeriaId,
            price,
            changePercent: cp,
            direction: cp > 0 ? 'up' : cp < 0 ? 'down' : 'flat'
          };
        }
      });

      if (Object.keys(updates).length > 0) {
        setPrices(prev => ({ ...prev, ...updates }));
      }
    };

    // Manual Macro Update (Simulating for tickers not available on Binance WS)
    const updateMacro = () => {
      setPrices(prev => ({
        ...prev,
        'DXY': { symbol: 'DXY', price: 105.23 + (Math.random() * 0.1 - 0.05), changePercent: -0.22, direction: 'down' },
        'SPX': { symbol: 'SPX', price: 4500.12 + (Math.random() * 2 - 1), changePercent: 0.45, direction: 'up' },
        'US10Y': { symbol: 'US10Y', price: 4.25 + (Math.random() * 0.01 - 0.005), changePercent: 0.12, direction: 'up' }
      }));
      setLambdaScore(0.65 + (Math.random() * 0.15));
    };

    updateMacro();
    const interval = setInterval(updateMacro, 5000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  const getRegime = () => {
    const dxy = prices['DXY'];
    const spx = prices['SPX'];
    if (dxy?.direction === 'down' && spx?.direction === 'up') return { label: 'RISK-ON', color: '#10b981' };
    if (dxy?.direction === 'up' && spx?.direction === 'down') return { label: 'RISK-OFF', color: '#ef4444' };
    return { label: 'NEUTRAL', color: '#888' };
  };

  const regime = getRegime();

  useEffect(() => {
    // Push macro state to backend kernel
    const syncMacro = async () => {
      try {
        await fetch('/api/smk/macro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            regime: regime.label,
            lambdaScore,
            dxyTrend: prices['DXY']?.direction || 'flat'
          })
        });
      } catch (err) {
        console.warn('Macro sync failed:', err);
      }
    };
    
    syncMacro();
    
    // Bubble up to parent
    onUpdate?.({
        dxy: prices['DXY']?.price || 105,
        spx: prices['SPX']?.price || 4500,
        gold: prices['GOLD']?.price || 2300,
        vix: 15,
        riskRegime: regime.label as any
    });
  }, [regime.label, lambdaScore, prices['DXY']?.direction, prices['DXY']?.price, prices['SPX']?.price, prices['GOLD']?.price]);

  return (
    <div className="quimeria-ticker">
      <div className="ticker-scroll">
        {QUIMERIA_SYMBOLS.map(sym => {
          const data = prices[sym.id];
          return (
            <div key={sym.id} className="ticker-item" style={{ borderLeftColor: sym.color }}>
              <span className="ticker-symbol" style={{ color: sym.color }}>
                {sym.name}
              </span>
              <span className="ticker-price">
                {data?.price?.toLocaleString(undefined, { 
                  minimumFractionDigits: sym.id === 'BTC' ? 0 : 2,
                  maximumFractionDigits: sym.id === 'BTC' ? 0 : 2 
                }) || '---'}
              </span>
              {data && (
                <span className={`ticker-change ${data.direction}`}>
                  {data.direction === 'up' ? '▲' : data.direction === 'down' ? '▼' : '●'}
                  {Math.abs(data.changePercent).toFixed(1)}%
                </span>
              )}
              {sym.weight > 0 && (
                <span className="ticker-lambda">
                  λ{sym.weight >= 0.6 ? '₇' : sym.weight >= 0.2 ? '₈' : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="macro-monitor">
        <div className="regime-tag" style={{ color: regime.color, borderColor: `${regime.color}40` }}>
          {regime.label}
        </div>
        <div className="lambda-score-tag">
          <span className="ls-label">λ₇:</span>
          <span className="ls-val">{lambdaScore.toFixed(2)}</span>
        </div>
      </div>

      <style>{`
        .quimeria-ticker {
          background: #050507;
          border-bottom: 1px solid #1a1a1f;
          display: flex;
          align-items: center;
          height: 26px;
          overflow: hidden;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          flex-shrink: 0;
        }
        .ticker-scroll {
          flex: 1;
          display: flex;
          gap: 12px;
          overflow-x: auto;
          scrollbar-width: none;
          padding: 0 10px;
          align-items: center;
        }
        .ticker-scroll::-webkit-scrollbar { display: none; }
        .ticker-item {
          display: flex;
          align-items: center;
          gap: 5px;
          padding-left: 6px;
          border-left: 2px solid;
          white-space: nowrap;
          height: 14px;
        }
        .ticker-symbol { font-weight: 800; font-size: 8.5px; opacity: 0.9; }
        .ticker-price { color: #f0f0f0; font-variant-numeric: tabular-nums; font-weight: 500; }
        .ticker-change { font-size: 8px; font-weight: 700; padding: 0 4px; border-radius: 1px; }
        .ticker-change.up { color: #10b981; }
        .ticker-change.down { color: #ef4444; }
        .ticker-change.flat { color: #888; }
        .ticker-lambda { font-size: 7px; color: #555; font-weight: 900; margin-left: 2px; }

        .macro-monitor {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          height: 100%;
          background: #0d0d0f;
          border-left: 1px solid #1a1a1f;
        }
        .regime-tag {
          font-size: 8px;
          font-weight: 800;
          padding: 1px 6px;
          border: 1px solid;
          border-radius: 2px;
          letter-spacing: 0.5px;
        }
        .lambda-score-tag {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #2563eb15;
          padding: 1px 6px;
          border-radius: 2px;
          border: 1px solid #2563eb30;
        }
        .ls-label { font-size: 8px; color: #2563eb; font-weight: 800; }
        .ls-val { font-size: 9px; color: #f0f0f0; font-weight: 700; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
