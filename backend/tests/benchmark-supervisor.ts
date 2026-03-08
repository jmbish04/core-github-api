import { performance } from 'node:perf_hooks';

// Simulate WebSocket mock
class MockWebSocket {
  messages: any[] = [];
  send(data: any) {
    this.messages.push(data);
  }
}

const numTerminals = 5000;
const numControls = 5000;
const numIterations = 1000;

// Set up mock data
const mixedSessions: { ws: MockWebSocket; type: 'terminal' | 'control' }[] = [];
const terminalSessions: MockWebSocket[] = [];
const controlSessions: MockWebSocket[] = [];

for (let i = 0; i < numTerminals; i++) {
  const ws = new MockWebSocket();
  mixedSessions.push({ ws, type: 'terminal' });
  terminalSessions.push(ws);
}

for (let i = 0; i < numControls; i++) {
  const ws = new MockWebSocket();
  mixedSessions.push({ ws, type: 'control' });
  controlSessions.push(ws);
}

const msg = "Test log message";
const event = { type: 'status', status: 'running' };

function benchmarkLegacyTerminal() {
  for (let i = 0; i < numIterations; i++) {
    mixedSessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
  }
}

function benchmarkLegacyControl() {
  for (let i = 0; i < numIterations; i++) {
    const payload = JSON.stringify(event);
    mixedSessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
  }
}

function benchmarkOptimizedTerminal() {
  for (let i = 0; i < numIterations; i++) {
    for (let j = 0; j < terminalSessions.length; j++) {
      terminalSessions[j].send(msg);
    }
  }
}

function benchmarkOptimizedControl() {
  for (let i = 0; i < numIterations; i++) {
    const payload = JSON.stringify(event);
    for (let j = 0; j < controlSessions.length; j++) {
      controlSessions[j].send(payload);
    }
  }
}

console.log(`Benchmarking Supervisor Broadcasting (${numTerminals} terminal, ${numControls} control, ${numIterations} iterations)`);
console.log('--------------------------------------------------');

const t0 = performance.now();
benchmarkLegacyTerminal();
const t1 = performance.now();
console.log(`Legacy Terminal (filter/forEach): ${(t1 - t0).toFixed(2)} ms`);

const t2 = performance.now();
benchmarkOptimizedTerminal();
const t3 = performance.now();
console.log(`Optimized Terminal (direct for loop): ${(t3 - t2).toFixed(2)} ms`);

console.log(`Speedup (Terminal): ${((t1 - t0) / (t3 - t2)).toFixed(2)}x`);

console.log('--------------------------------------------------');

const c0 = performance.now();
benchmarkLegacyControl();
const c1 = performance.now();
console.log(`Legacy Control (filter/forEach): ${(c1 - c0).toFixed(2)} ms`);

const c2 = performance.now();
benchmarkOptimizedControl();
const c3 = performance.now();
console.log(`Optimized Control (direct for loop): ${(c3 - c2).toFixed(2)} ms`);

console.log(`Speedup (Control): ${((c1 - c0) / (c3 - c2)).toFixed(2)}x`);
