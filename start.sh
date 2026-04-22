#!/bin/bash
# Unified start script for Sovereign Market Kernel

mkdir -p logs
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SESSION_LOG="logs/session_$TIMESTAMP.log"

echo "--- SESSION START: $TIMESTAMP ---" > "$SESSION_LOG"

# Start Python backend in background
echo "[BOOT] Starting Python Backend (Port 8000)..." | tee -a "$SESSION_LOG"
cd chimeria-main/smk_ipda_trading_system
python3 run_backend.py >> "../../$SESSION_LOG" 2>&1 &
PYTHON_PID=$!

# Trap signals to kill Python backend when script exits
trap "kill $PYTHON_PID" SIGINT SIGTERM EXIT

# Start Node server
cd ../..
echo "[BOOT] Starting Node Proxy (Port 3000)..." | tee -a "$SESSION_LOG"
npm run dev-node >> "$SESSION_LOG" 2>&1
