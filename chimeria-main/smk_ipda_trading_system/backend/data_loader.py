import pandas as pd
import numpy as np
from datetime import datetime
import os

def parse_historical_csv(file_path: str):
    """
    Parses historical CSV. 
    Specifically handles: UTC,Open,High,Low,Close,Volume
    Date format: 24.03.2026 12:00:00.000 UTC
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Historical data file not found: {file_path}")

    # Read with flexible parsing
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        # Try with different delimiter if needed
        df = pd.read_csv(file_path, sep=None, engine='python')
    
    # Normalize column names
    col_map = {c.lower(): c for c in df.columns}
    
    time_col = next((c for c in df.columns if c.upper() in ['UTC', 'TIME', 'DATETIME', 'DATE']), None)
    open_col = next((c for c in df.columns if c.lower() == 'open'), None)
    high_col = next((c for c in df.columns if c.lower() == 'high'), None)
    low_col = next((c for c in df.columns if c.lower() == 'low'), None)
    close_col = next((c for c in df.columns if c.lower() == 'close'), None)
    vol_col = next((c for c in df.columns if 'VOL' in c.upper()), None)

    if not all([time_col, open_col, high_col, low_col, close_col]):
        raise ValueError(f"Missing required OHLC columns. Found: {list(df.columns)}")

    def parse_date(val):
        if isinstance(val, (int, float)):
            return int(val / 1000) if val > 1e10 else int(val)
        
        s = str(val).strip()
        # Remove ' UTC' if present
        s = s.replace(' UTC', '').replace('Z', '')
        
        FMTS = [
            '%d.%m.%Y %H:%M:%S.%f',
            '%d.%m.%Y %H:%M:%S',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S',
            '%Y.%m.%d %H:%M:%S'
        ]
        
        for fmt in FMTS:
            try:
                dt = datetime.strptime(s, fmt)
                return int(dt.timestamp())
            except ValueError:
                continue
        
        # Fallback to pandas parser
        try:
            return int(pd.to_datetime(s).timestamp())
        except:
            return 0

    df['time'] = df[time_col].apply(parse_date)
    df = df[df['time'] > 0]
    
    df = df.rename(columns={
        open_col: 'open',
        high_col: 'high',
        low_col: 'low',
        close_col: 'close',
        vol_col: 'volume' if vol_col else 'vol'
    })
    
    if 'vol' in df.columns and 'volume' not in df.columns:
        df = df.rename(columns={'vol': 'volume'})
    elif 'volume' not in df.columns:
        df['volume'] = 100.0

    df = df.sort_values('time')
    return df[['time', 'open', 'high', 'low', 'close', 'volume']].to_dict('records')
