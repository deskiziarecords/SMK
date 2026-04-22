#!/bin/bash
# Start Python backend in background
cd chimeria-main/smk_ipda_trading_system
python3 run_backend.py > backend.log 2>&1 &
PYTHON_PID=$!

# Trap signals to kill Python backend when script exits
trap "kill $PYTHON_PID" SIGINT SIGTERM EXIT

# Start Node server
cd ../..
npm run dev-node
