import { useEffect, useRef, memo } from 'react';

function TradingViewWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    
    // Clear any existing widgets
    container.current.innerHTML = '';
    
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "width": "100%",
      "height": "100%",
      "currencies": [
        "EUR",
        "USD",
        "JPY",
        "GBP",
        "CHF",
        "AUD",
        "CAD",
        "NZD",
        "CNY"
      ],
      "isTransparent": false,
      "colorTheme": "dark",
      "locale": "en",
      "backgroundColor": "#0d0d0f"
    });
    
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget h-full w-full";
    container.current.appendChild(widgetContainer);
    container.current.appendChild(script);
  }, []);

  return (
    <div className="tradingview-widget-container h-full w-full bg-[#0d0d0f]" ref={container}>
      <div className="tradingview-widget-copyright absolute bottom-2 left-2 opacity-50 hover:opacity-100 z-50">
        <a href="https://www.tradingview.com/markets/currencies/cross-rates-overview-heat-map/" rel="noopener nofollow" target="_blank">
            <span className="text-blue-500 text-[10px]">Forex Heatmap</span>
        </a>
        <span className="text-zinc-500 text-[10px]"> by TradingView</span>
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
