import { OHLCV } from '../types/smk';

export function generateSyntheticData(n = 300): OHLCV[] {
    const bars: OHLCV[] = [];
    let p = 1.1050;
    let t = Math.floor(Date.now() / 1000) - n * 300;
    for (let i = 0; i < n; i++) {
        const phase = i < n * 0.25 ? 0 : i < n * 0.45 ? 1 : i < n * 0.75 ? 2 : 3;
        const trend = [0.0, 0.0001, 0.0005, -0.0002][phase];
        const noise = [0.0002, 0.0004, 0.0008, 0.0003][phase];
        const open = p;
        const close = open + (Math.random() - 0.5) * noise + trend;
        const high = Math.max(open, close) + Math.random() * 0.0003;
        const low = Math.min(open, close) - Math.random() * 0.0003;
        bars.push({ time: t, open, high, low, close, volume: 500 + Math.random() * 500 });
        p = close;
        t += 300;
    }
    return bars;
}
