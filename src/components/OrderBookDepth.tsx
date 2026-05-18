import React from 'react';
import { Activity } from 'lucide-react';
import { OrderBook } from '../types/smk';

interface OrderBookDepthProps {
  data: OrderBook | null;
}

const OrderBookDepth: React.FC<OrderBookDepthProps> = ({ data: orderBook }) => {
  if (!orderBook) return <div className="p-4 text-center text-zinc-500">Connecting to order book...</div>;

  const maxTotal = Math.max(
    orderBook.bids[orderBook.bids.length - 1]?.total || 0,
    orderBook.asks[orderBook.asks.length - 1]?.total || 0
  );

  const maxDelta = Math.max(
    ...orderBook.bids.map(b => Math.abs(b.delta || 0)),
    ...orderBook.asks.map(a => Math.abs(a.delta || 0)),
    1 // prevent div by zero
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f] font-mono text-[9px]">
      <div className="grid grid-cols-4 px-2 py-1 border-b border-zinc-800 text-zinc-500 font-bold uppercase">
        <span>Price</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Delta</span>
        <span className="text-right">Total</span>
      </div>
      
      <div className="flex-1 flex flex-col-reverse overflow-hidden">
        {/* ASKS (Sells) */}
        <div className="flex flex-col-reverse">
          {orderBook.asks.map((ask, i) => (
            <div key={`ask-${i}`} className="relative grid grid-cols-4 px-2 py-0.5 hover:bg-zinc-800/30 group">
              <div 
                className="absolute inset-y-0 bg-red-900/10 pointer-events-none transition-all" 
                style={{ width: `${(ask.total! / maxTotal) * 100}%`, left: 'auto', right: 0 }}
              />
              <span className="text-red-500/80 z-10">{ask.price.toFixed(5)}</span>
              <span className="text-right text-zinc-300 z-10">{ask.volume.toFixed(1)}</span>
              <div className="flex justify-end items-center pr-1 gap-1 z-10">
                <div 
                    className={`h-1 rounded-full ${(ask.delta || 0) >= 0 ? 'bg-green-500/40' : 'bg-red-500/40'}`} 
                    style={{ width: `${(Math.abs(ask.delta || 0) / maxDelta) * 30}px` }}
                />
                <span className={`text-[8px] ${(ask.delta || 0) >= 0 ? 'text-green-500/60' : 'text-red-500/60'}`}>
                    {(ask.delta || 0).toFixed(1)}
                </span>
              </div>
              <span className="text-right text-zinc-500 z-10">{ask.total?.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <div className="h-4 flex items-center justify-center bg-zinc-900/50 border-y border-zinc-900 text-zinc-500 text-[8px] font-bold">
          <Activity className="w-2 h-2 mr-1 text-zinc-600" />
          SPREAD: {(orderBook.asks[0].price - orderBook.bids[0].price).toFixed(5)}
        </div>

        {/* BIDS (Buys) */}
        <div className="flex flex-col">
          {orderBook.bids.map((bid, i) => (
            <div key={`bid-${i}`} className="relative grid grid-cols-4 px-2 py-0.5 hover:bg-zinc-800/30 group">
              <div 
                className="absolute inset-y-0 bg-green-900/10 pointer-events-none transition-all" 
                style={{ width: `${(bid.total! / maxTotal) * 100}%`, left: 'auto', right: 0 }}
              />
              <span className="text-green-500/80 z-10">{bid.price.toFixed(5)}</span>
              <span className="text-right text-zinc-300 z-10">{bid.volume.toFixed(1)}</span>
              <div className="flex justify-end items-center pr-1 gap-1 z-10">
                <div 
                    className={`h-1 rounded-full ${(bid.delta || 0) >= 0 ? 'bg-green-500/40' : 'bg-red-500/40'}`} 
                    style={{ width: `${(Math.abs(bid.delta || 0) / maxDelta) * 30}px` }}
                />
                <span className={`text-[8px] ${(bid.delta || 0) >= 0 ? 'text-green-500/60' : 'text-red-500/60'}`}>
                    {(bid.delta || 0).toFixed(1)}
                </span>
              </div>
              <span className="text-right text-zinc-500 z-10">{bid.total?.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderBookDepth;
