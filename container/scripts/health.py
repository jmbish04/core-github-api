#!/usr/bin/env python3
"""
container/scripts/health.py
Sandbox container health runner.

Run from the host via:
    sandbox.exec("python3 /scripts/health.py")
    sandbox.exec("python3 /scripts/health.py --check exec,fs,git")

Outputs a single-line JSON to stdout:
{
    "success": true,
    "checks": {
        "exec": {"status": "ok", "latency_ms": 12},
        "fs":   {"status": "ok", "latency_ms": 5, "detail": "write+read+delete ok"},
        "git":  {"status": "ok", "latency_ms": 23, "version": "git version 2.x"},
        "proc": {"status": "ok", "latency_ms": 8, "count": 14},
        "net":  {"status": "ok", "latency_ms": 11, "open_ports": [8788, 8080]}
    },
    "timestamp": "2026-03-27T10:00:00Z"
}
"""

import argparse
import datetime
import json
import os
import shutil
import socket
import subprocess
import sys
import time


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: str, timeout: int = 10) -> tuple[int, str, str]:
    """Run a shell command, return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 1, "", f"timeout after {timeout}s"
    except Exception as exc:
        return 1, "", str(exc)


def _timed(fn):
    """Return (result_dict, latency_ms)."""
    start = time.monotonic()
    res = fn()
    ms = round((time.monotonic() - start) * 1000)
    res["latency_ms"] = ms
    return res


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

def check_exec() -> dict:
    code, out, err = _run("echo health-ok")
    if code != 0 or "health-ok" not in out:
        return {"status": "fail", "error": err or f"unexpected output: {out!r}"}
    return {"status": "ok"}


def check_fs() -> dict:
    path = "/tmp/_sandbox_health_check.tmp"
    content = f"health-{int(time.time())}"
    try:
        with open(path, "w") as f:
            f.write(content)
        with open(path) as f:
            read_back = f.read()
        os.remove(path)
        if read_back != content:
            return {"status": "fail", "error": f"content mismatch: {read_back!r}"}
        return {"status": "ok", "detail": "write+read+delete ok"}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}


def check_git() -> dict:
    code, out, err = _run("git --version")
    if code != 0:
        return {"status": "fail", "error": err or "git not found"}
    return {"status": "ok", "version": out}


def check_proc() -> dict:
    """List running processes — tries psutil, falls back to /proc."""
    try:
        import psutil  # type: ignore
        procs = [p.name() for p in psutil.process_iter(["name"]) if p.info.get("name")]
        return {"status": "ok", "count": len(procs)}
    except ImportError:
        pass

    # Fallback: count /proc/<pid> directories
    try:
        pids = [d for d in os.listdir("/proc") if d.isdigit()]
        return {"status": "ok", "count": len(pids), "detail": "fallback via /proc"}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}


def check_net() -> dict:
    """Detect listening TCP ports via ss or /proc/net/tcp."""
    open_ports: list[int] = []

    # Try ss
    code, out, _ = _run("ss -tlnp")
    if code == 0:
        for line in out.splitlines()[1:]:  # skip header
            parts = line.split()
            if len(parts) >= 4:
                addr = parts[3]  # e.g. 0.0.0.0:8788
                if ":" in addr:
                    try:
                        port = int(addr.rsplit(":", 1)[-1])
                        if port not in open_ports:
                            open_ports.append(port)
                    except ValueError:
                        pass
    else:
        # Fallback: /proc/net/tcp
        try:
            with open("/proc/net/tcp") as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if parts and len(parts) > 1:
                        local_addr = parts[1]
                        hex_port = local_addr.split(":")[1]
                        port = int(hex_port, 16)
                        if port not in open_ports:
                            open_ports.append(port)
        except Exception:
            pass

    return {"status": "ok", "open_ports": sorted(open_ports)}


# ---------------------------------------------------------------------------
# Check registry
# ---------------------------------------------------------------------------

ALL_CHECKS = {
    "exec": check_exec,
    "fs":   check_fs,
    "git":  check_git,
    "proc": check_proc,
    "net":  check_net,
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Sandbox container health check")
    parser.add_argument(
        "--check",
        default="all",
        help="Comma-separated list of checks to run, or 'all'. "
             f"Available: {', '.join(ALL_CHECKS)}",
    )
    args = parser.parse_args()

    # Resolve which checks to run
    if args.check.strip().lower() == "all":
        selected = list(ALL_CHECKS.keys())
    else:
        selected = [c.strip() for c in args.check.split(",") if c.strip() in ALL_CHECKS]
        unknown = [c.strip() for c in args.check.split(",") if c.strip() not in ALL_CHECKS]
        if unknown:
            sys.stderr.write(f"[health.py] Unknown checks ignored: {unknown}\n")

    results: dict[str, dict] = {}
    for name in selected:
        results[name] = _timed(ALL_CHECKS[name])

    overall_success = all(v.get("status") == "ok" for v in results.values())

    output = {
        "success": overall_success,
        "checks": results,
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    print(json.dumps(output))
    sys.exit(0 if overall_success else 1)


if __name__ == "__main__":
    main()
