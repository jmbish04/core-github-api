// Benchmark script for Supervisor WebSocket broadcasting

// A lightweight mock to simulate WebSocket instances
class MockWebSocket {
    accept() {}
    send(data: string) {}
    addEventListener(event: string, callback: Function) {}
    close() {}
}

// Legacy Supervisor behavior (using filter and forEach)
class LegacySupervisor {
    sessions: { ws: MockWebSocket; type: 'terminal' | 'control' }[] = [];

    handleSession(ws: MockWebSocket, type: 'terminal' | 'control') {
        const session = { ws, type };
        this.sessions.push(session);
    }

    broadcast(msg: string) {
        this.sessions.filter(s => s.type === 'terminal').forEach(s => s.ws.send(msg));
    }

    broadcastEvent(event: any) {
        const payload = JSON.stringify(event);
        this.sessions.filter(s => s.type === 'control').forEach(s => s.ws.send(payload));
    }
}

// Optimized Supervisor behavior (using direct arrays and for loops)
class OptimizedSupervisor {
    terminalSessions: MockWebSocket[] = [];
    controlSessions: MockWebSocket[] = [];

    handleSession(ws: MockWebSocket, type: 'terminal' | 'control') {
        if (type === 'terminal') {
            this.terminalSessions.push(ws);
        } else {
            this.controlSessions.push(ws);
        }
    }

    broadcast(msg: string) {
        for (let i = 0; i < this.terminalSessions.length; i++) {
            this.terminalSessions[i].send(msg);
        }
    }

    broadcastEvent(event: any) {
        const payload = JSON.stringify(event);
        for (let i = 0; i < this.controlSessions.length; i++) {
            this.controlSessions[i].send(payload);
        }
    }
}

function runBenchmark() {
    console.log("Setting up benchmarks...");
    const legacy = new LegacySupervisor();
    const optimized = new OptimizedSupervisor();

    const NUM_TERMINAL = 10000;
    const NUM_CONTROL = 1000;
    const NUM_ITERATIONS = 100;

    for (let i = 0; i < NUM_TERMINAL; i++) {
        const ws = new MockWebSocket();
        legacy.handleSession(ws, 'terminal');
        optimized.handleSession(ws, 'terminal');
    }
    for (let i = 0; i < NUM_CONTROL; i++) {
        const ws = new MockWebSocket();
        legacy.handleSession(ws, 'control');
        optimized.handleSession(ws, 'control');
    }

    console.log(`\nBenchmarking Terminal Broadcast (${NUM_TERMINAL} sessions, ${NUM_ITERATIONS} iterations):`);

    // Warmup
    for(let i=0; i<5; i++) {
        legacy.broadcast("warmup");
        optimized.broadcast("warmup");
    }

    const startLegacyTerminal = performance.now();
    for(let i=0; i<NUM_ITERATIONS; i++) {
        legacy.broadcast("benchmark message");
    }
    const endLegacyTerminal = performance.now();
    console.log(`  Legacy   (filter+forEach): ${(endLegacyTerminal - startLegacyTerminal).toFixed(2)}ms`);

    const startOptTerminal = performance.now();
    for(let i=0; i<NUM_ITERATIONS; i++) {
        optimized.broadcast("benchmark message");
    }
    const endOptTerminal = performance.now();
    console.log(`  Optimized (direct for-loop): ${(endOptTerminal - startOptTerminal).toFixed(2)}ms`);

    console.log(`\nBenchmarking Control Broadcast (${NUM_CONTROL} sessions, ${NUM_ITERATIONS} iterations):`);

    const eventData = { type: "benchmark", data: "test" };

    const startLegacyControl = performance.now();
    for(let i=0; i<NUM_ITERATIONS; i++) {
        legacy.broadcastEvent(eventData);
    }
    const endLegacyControl = performance.now();
    console.log(`  Legacy   (filter+forEach): ${(endLegacyControl - startLegacyControl).toFixed(2)}ms`);

    const startOptControl = performance.now();
    for(let i=0; i<NUM_ITERATIONS; i++) {
        optimized.broadcastEvent(eventData);
    }
    const endOptControl = performance.now();
    console.log(`  Optimized (direct for-loop): ${(endOptControl - startOptControl).toFixed(2)}ms`);
}

runBenchmark();
