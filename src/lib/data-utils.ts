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
        const volume = 500 + Math.random() * 500;
        const buyRatio = close >= open ? 0.5 + Math.random() * 0.3 : 0.2 + Math.random() * 0.3;
        const buyVolume = volume * buyRatio;
        const sellVolume = volume - buyVolume;
        const delta = buyVolume - sellVolume;

        bars.push({ 
            time: t, 
            open, 
            high, 
            low, 
            close, 
            volume, 
            buyVolume, 
            sellVolume, 
            delta 
        });
        p = close;
        t += 300;
    }
    return bars;
}

export function generateOrderBook(price: number): any {
    const bids = [];
    const asks = [];
    let bidPrice = price - 0.0001;
    let askPrice = price + 0.0001;
    
    let totalBid = 0;
    let totalAsk = 0;

    for (let i = 0; i < 10; i++) {
        const bidVol = 10 + Math.random() * 50;
        const askVol = 10 + Math.random() * 50;
        const bidDelta = (Math.random() - 0.5) * bidVol * 0.6;
        const askDelta = (Math.random() - 0.5) * askVol * 0.6;
        
        totalBid += bidVol;
        totalAsk += askVol;
        
        bids.push({ price: bidPrice, volume: bidVol, total: totalBid, delta: bidDelta });
        asks.push({ price: askPrice, volume: askVol, total: totalAsk, delta: askDelta });
        
        bidPrice -= 0.0001;
        askPrice += 0.0001;
    }

    return {
        bids,
        asks,
        timestamp: Date.now()
    };
}
