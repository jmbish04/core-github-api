const NUM_SESSIONS = 10000;
const ITERATIONS = 10000;

const mixedSessionsArray: { ws: any; type: 'terminal' | 'control' }[] = [];
const terminalSessionsArray: any[] = [];
const controlSessionsArray: any[] = [];

for (let i = 0; i < NUM_SESSIONS; i++) {
    const ws = { send: () => {} };
    if (i % 2 === 0) {
        mixedSessionsArray.push({ ws, type: 'terminal' });
        terminalSessionsArray.push(ws);
    } else {
        mixedSessionsArray.push({ ws, type: 'control' });
        controlSessionsArray.push(ws);
    }
}

function runBenchmark(name: string, fn: () => void) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(4)} ms`);
}

console.log(`Running benchmarks with ${NUM_SESSIONS} sessions for ${ITERATIONS} iterations...`);

runBenchmark("Array filter (Terminal) - Current Implementation", () => {
    mixedSessionsArray.filter(s => s.type === 'terminal').forEach(s => s.ws.send("test"));
});

runBenchmark("Array filter (Control) - Current Implementation", () => {
    mixedSessionsArray.filter(s => s.type === 'control').forEach(s => s.ws.send("test"));
});

runBenchmark("Array iteration (Terminal) - Proposed Array Implementation", () => {
    terminalSessionsArray.forEach(ws => ws.send("test"));
});

runBenchmark("Array iteration (Control) - Proposed Array Implementation", () => {
    controlSessionsArray.forEach(ws => ws.send("test"));
});

// Using a for loop instead of .forEach
runBenchmark("For loop (Terminal)", () => {
    for (let i = 0; i < terminalSessionsArray.length; i++) {
        terminalSessionsArray[i].send("test");
    }
});

runBenchmark("For loop (Control)", () => {
    for (let i = 0; i < controlSessionsArray.length; i++) {
        controlSessionsArray[i].send("test");
    }
});
