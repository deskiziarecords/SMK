/**
 * quimeria-sdk-examples.js
 * ========================
 * Usage examples for every endpoint in the QUIMERIA HYPERION API.
 * Import the SDK and copy-paste what you need.
 */

import { QuimeriaClient } from './quimeria-sdk.js';

const q = new QuimeriaClient('http://localhost:8000', { debug: true });
// For remote: new QuimeriaClient('https://mt.itimbre.com')

// ═══════════════════════════════════════════════════════════
// 1. HEALTH & STATUS
// ═══════════════════════════════════════════════════════════

// Ping
const pong = await q.ping();
// { status: 'ok', pipeline_ready: true }

// Full pipeline status
const status = await q.status();
// { modules: {...}, bars_loaded: 300, cursor: 0, ... }


// ═══════════════════════════════════════════════════════════
// 2. LOAD DATA
// ═══════════════════════════════════════════════════════════

// Built-in synthetic sample (300 bars EURUSD 5M)
await q.loadSample();

// CSV from file (browser)
const file = document.querySelector('input[type=file]').files[0];
const text = await file.text();
await q.loadCSV(text, file.name, 'mt5');   // sourceHint: 'mt4'|'mt5'|'tradingview'|'auto'

// Bitget historical
await q.loadBitget({
  apiKey:      '',           // optional for public data
  apiSecret:   '',
  symbol:      'EURUSDT',
  granularity: '5m',         // '1m'|'5m'|'15m'|'1h'|'4h'
  limit:       300
});

// OANDA
await q.loadOanda({
  token:       'YOUR_TOKEN',
  accountId:   '123-456-7890123-001',
  instrument:  'EUR_USD',
  granularity: 'M5',
  count:       300
});


// ═══════════════════════════════════════════════════════════
// 3. BACKTEST STREAM — /ws/stream
// ═══════════════════════════════════════════════════════════

// Every bar fires onBar with the full SMK payload:
// {
//   bar:          { time, open, high, low, close, volume },
//   bar_index:    42,
//   total_bars:   300,
//   amd:          { state, prev, changed, R_MASTER },
//   bias:         { bias },
//   dealing_range:{ high, low, eq, zone, coherence },
//   session:      { name, killzone, status },
//   ipda_phase:   { phase },
//   fusion:       { p_fused, confidence, regime, active_lambdas },
//   veto:         { decision, reasons },
//   vol_decay:    { ratio, entrapped, stasis, energy },
//   kl:           { score, stable },
//   topology:     { h1_score, fractured },
//   harmonic:     { inverted, phase_diff, trap },
//   mandra:       { open, delta_e },
//   manipulation: { active, score, level },
//   fvg:          { active, count, recent },
//   ob:           { active, count, recent },
//   vol_profile:  { zones },
//   swings:       { count },
//   displacement: { is_disp },
//   sensors:      [{ id, name, score, active }, ...],
//   execution:    { action, is_armed, direction, stop_loss_price,
//                   take_profit_price, lot_size, kelly_size,
//                   risk_pips, rr_ratio, delta_e, pattern, dominant, reason }
// }

await q.loadSample();

q.stream.onBar  = (d) => {
  console.log(`[${d.bar_index}] AMD:${d.amd?.state} p=${d.fusion?.p_fused?.toFixed(3)} VETO:${d.veto?.decision}`);
};
q.stream.onDone  = () => console.log('Backtest complete');
q.stream.onError = (msg) => console.error('SMK error:', msg);
q.stream.onOrder = (event, order) => console.log('Order:', event, order);

await q.stream.connect();
await q.stream.run({ speed: 50 });    // 50ms per bar = 10x
// await q.stream.step();             // step one bar
// await q.stream.stop();             // pause
// await q.stream.reset();            // back to bar 0


// ═══════════════════════════════════════════════════════════
// 4. LIVE FEED — Bitget polling /ws/live
// ═══════════════════════════════════════════════════════════

q.live.onBar   = (d) => console.log('[LIVE BAR]', d.bar.close);
q.live.onOpen  = ()  => console.log('[LIVE] connected');
q.live.onClose = ()  => console.log('[LIVE] disconnected');

await q.live.start({ symbol: 'EURUSDT', granularity: '5m', apiKey: '' });
// await q.live.stop();
const liveStatus = await q.live.status();


// ═══════════════════════════════════════════════════════════
// 5. MT5 LIVE TELEMETRY — /ws/telemetry
// ═══════════════════════════════════════════════════════════
// Receives bars pushed by apps/live_eurusd.py → /telemetry/push

q.mt5.onBar   = (d) => console.log('[MT5 BAR]', d.bar?.close);
q.mt5.onOpen  = ()  => console.log('[MT5] connected to telemetry bridge');
q.mt5.onClose = ()  => console.log('[MT5] disconnected');

await q.mt5.connect();
// q.mt5.disconnect();

// Push a bar manually (for custom MT5 integrations)
await q.mt5.push({
  type: 'bar',
  data: {
    bar: { time: Date.now()/1000, open: 1.08, high: 1.085, low: 1.079, close: 1.082, volume: 1000 },
    bar_index: 0,
    total_bars: 1
  }
});


// ═══════════════════════════════════════════════════════════
// 6. ORDERS & HYPERION ORDERBOOKING
// ═══════════════════════════════════════════════════════════

// List open orders (AutoFill engine)
const open = await q.orders.getOpen();
// { count: 2, orders: [{id, symbol, side, type, qty, filled, price, status, tags}] }

// Order book state
const book = await q.orders.getBook('EURUSD');
// { bid, ask, spread_bps, imbalance, liquid, spoofing_detected }

// Cancel all orders
await q.orders.cancelAll();
await q.orders.cancelAll('EURUSD');  // by symbol

// Replace / chase an order
await q.orders.replace('order-id-123', 1.08250, 0.02);

// Hyperion orderbook status
const hypStatus = await q.orders.hypStatus('EURUSD');

// Open a Hyperion booked trade
const trade = await q.orders.hypOpen({
  symbol: 'EURUSD',
  side:   'buy',
  lots:   0.01,
  price:  1.08200,
  venue:  'paper'        // 'paper' | 'mt5_demo'
});

// Close a position
await q.orders.hypClose(trade.position.id, 1.08250);
await q.orders.hypClose(null, 1.08250);   // close ALL positions

// Sync quote (updates book + fires AutoFill matching)
await q.orders.hypQuote('EURUSD', 1.08200);

// Direct Hyperion order via AutoFill
await q.orders.hypOrder({ symbol: 'EURUSD', side: 'sell', lots: 0.01 });


// ═══════════════════════════════════════════════════════════
// 7. EXECUTION ENGINE — AEGIS BRIDGE
// ═══════════════════════════════════════════════════════════

// Status
const exeStatus = await q.execution.status();
// { slm_available, aegis_available, enabled, capital }

// Session stats from StopLossManager
const exeStats = await q.execution.stats();

// Reconfigure
await q.execution.configure({
  capital:      50000,
  riskPerTrade: 0.005,    // 0.5% per trade
  nVenues:      1,
  kellyLimit:   0.02,
  enabled:      true
});


// ═══════════════════════════════════════════════════════════
// 8. GRID
// ═══════════════════════════════════════════════════════════

const gridStatus = await q.grid.status();
await q.grid.control('start');
await q.grid.control('stop');


// ═══════════════════════════════════════════════════════════
// 9. PLUGINS
// ═══════════════════════════════════════════════════════════

// List all forensic plugins
const plugins = await q.plugins.list();
// { plugins: [{name, enabled, ...}], errors: {} }

// Enable specific plugins
await q.plugins.enable(['MarketRhythm', 'MarketVision', 'KineticExecutioner']);


// ═══════════════════════════════════════════════════════════
// 10. MODULE TOGGLES
// ═══════════════════════════════════════════════════════════

// Disable heavy modules for faster backtest
await q.configModules(['topology', 'kl', 'harmonic']);

// Re-enable everything
await q.configModules([]);


// ═══════════════════════════════════════════════════════════
// 11. LOGS
// ═══════════════════════════════════════════════════════════

const logFiles = await q.logs.list();
// { log_dir: '...', files: [{name, size}, ...] }

const events = await q.logs.read('events.log', 50);
const veto   = await q.logs.read('veto.log',   50);
const trades = await q.logs.read('trades.log', 50);


// ═══════════════════════════════════════════════════════════
// 12. FULL PIPELINE EXAMPLE — load → stream → trade on signal
// ═══════════════════════════════════════════════════════════

async function runPipeline() {
  const q = new QuimeriaClient('http://localhost:8000');

  // 1. Load data
  const loaded = await q.loadSample();
  console.log(`Loaded ${loaded.count} bars from ${loaded.source}`);

  // 2. Wire execution config
  await q.execution.configure({ capital: 10000, riskPerTrade: 0.01 });

  // 3. Stream bars and trade on signal
  let trades = 0;

  q.stream.onBar = async (d) => {
    const exe    = d.execution;
    const fusion = d.fusion;

    // Only trade if execution engine is armed AND veto is clear
    if (exe?.action === 'TRADE' && exe?.is_armed && d.veto?.decision === 'Proceed') {
      const side = exe.direction === 1 ? 'buy' : 'sell';
      console.log(`[SIGNAL] ${side.toUpperCase()} | p=${fusion?.p_fused?.toFixed(3)} | SL=${exe.stop_loss_price?.toFixed(5)} TP=${exe.take_profit_price?.toFixed(5)} RR=${exe.rr_ratio?.toFixed(2)}R`);

      try {
        await q.orders.hypOpen({
          symbol: 'EURUSD',
          side,
          lots:   exe.lot_size || 0.01,
          price:  d.bar.close,
          venue:  'paper'
        });
        trades++;
      } catch (e) {
        console.warn('Order rejected:', e.message);
      }
    }

    // Close on halt
    if (d.veto?.decision === 'Halt' && trades > 0) {
      await q.orders.hypClose(null, d.bar.close);
      trades = 0;
      console.log('[HALT] All positions closed');
    }
  };

  q.stream.onDone = async () => {
    console.log('=== BACKTEST COMPLETE ===');
    const stats = await q.execution.stats();
    console.log('Stats:', stats);
  };

  await q.stream.connect();
  await q.stream.run({ speed: 16 }); // MAX speed
}

runPipeline().catch(console.error);
