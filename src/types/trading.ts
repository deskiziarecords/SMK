
export interface ClosedTrade {
    id: number;
    side: 'buy' | 'sell';
    price: number;
    closePrice: number;
    lots: number;
    pips: number;
    profit: number;
    commission: number;
    closedAt: number | string;
    venue: string;
}

export interface TradeSummary {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netProfit: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
}
