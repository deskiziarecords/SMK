import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const serverLogPath = path.join(LOG_DIR, 'server.log');
const tradeLogPath = path.join(LOG_DIR, 'trades_simulator.json');

export function logServer(message: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(serverLogPath, entry);
  console.log(entry.trim());
}

export function saveTradeLog(trades: any[]) {
  fs.writeFileSync(tradeLogPath, JSON.stringify(trades, null, 2));
}

export function getLogs() {
    if (!fs.existsSync(serverLogPath)) return "";
    return fs.readFileSync(serverLogPath, 'utf8');
}
