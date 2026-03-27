#!/usr/bin/env python3
"""
container/scripts/port_passthrough.py
Wrangler dev port passthrough manager + diagnostics.

Modes:
  --start     Launch wrangler dev, wait for readiness, print JSON.
  --diagnose  Scan ports/processes and report diagnostics JSON.

Usage examples (from sandbox.exec):
    python3 /scripts/port_passthrough.py --diagnose --port 8787
    python3 /scripts/port_passthrough.py --start --port 8787 --cwd /workspace/repo

Output JSON schema:
{
    "ready":       bool,
    "port":        int,
    "pid":         str | null,
    "url":         str | null,      # only in --start mode if ready
    "errors":      list[str],
    "bound_ports": list[int],
    "processes":   list[{"pid": str, "cmd": str, "port": int | null}],
    "env_vars":    dict,
    "timestamp":   str
}
"""

import argparse
import datetime
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Port 3000 is reserved by the internal Bun server — never expose it.
RESERVED_PORTS = {3000}

# Environment variable overrides we care about for routing diagnosis
RELEVANT_ENV_VARS = [
    "WRANGLER_DEV_PORT",
    "PORT",
    "HOST",
    "COLBY_CONTROL_PORT",
    "BASE_URL",
    "CF_PAGES_URL",
    "NODE_ENV",
    "HOME",
    "PATH",
]


# ---------------------------------------------------------------------------
# Port/process helpers
# ---------------------------------------------------------------------------

def _run(cmd: str, timeout: int = 10, cwd: str | None = None) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=cwd,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 1, "", f"timeout after {timeout}s"
    except Exception as exc:
        return 1, "", str(exc)


def _get_bound_ports() -> list[int]:
    """Return all locally bound TCP ports., trying ss then /proc/net/tcp."""
    ports: list[int] = []

    # Prefer ss
    code, out, _ = _run("ss -tlnp")
    if code == 0:
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 4:
                addr = parts[3]
                if ":" in addr:
                    try:
                        ports.append(int(addr.rsplit(":", 1)[-1]))
                    except ValueError:
                        pass
        return sorted(set(ports))

    # Fallback: /proc/net/tcp
    try:
        with open("/proc/net/tcp") as f:
            for line in f.readlines()[1:]:
                parts = line.split()
                if len(parts) > 1:
                    hex_port = parts[1].split(":")[1]
                    try:
                        ports.append(int(hex_port, 16))
                    except ValueError:
                        pass
    except Exception:
        pass

    return sorted(set(ports))


def _find_wrangler_process() -> dict | None:
    """Find a running wrangler process. Returns {"pid": str, "cmd": str} or None."""
    code, out, _ = _run("ps -eo pid,command --no-headers")
    if code != 0:
        return None
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            pid, cmd = parts
            if "wrangler" in cmd.lower() and "dev" in cmd.lower():
                return {"pid": pid, "cmd": cmd}
    return None


def _get_process_list() -> list[dict]:
    """Return all processes as [{pid, cmd}]."""
    code, out, _ = _run("ps -eo pid,command --no-headers")
    if code != 0:
        return []
    procs = []
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            procs.append({"pid": parts[0], "cmd": parts[1], "port": None})
    return procs


def _probe_port(port: int, timeout: float = 1.0) -> bool:
    """Return True if something is accepting connections on localhost:port."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def _http_check(port: int) -> dict:
    """Curl localhost:<port>/ and return status info."""
    code, out, err = _run(
        f"curl -sf -o /dev/null -w '%{{http_code}}' http://localhost:{port}/ --max-time 3",
        timeout=5,
    )
    if code == 0:
        return {"reachable": True, "http_status": out}
    return {"reachable": False, "error": err or f"exit {code}"}


def _env_snapshot() -> dict:
    return {k: os.environ.get(k, "") for k in RELEVANT_ENV_VARS}


# ---------------------------------------------------------------------------
# --diagnose mode
# ---------------------------------------------------------------------------

def diagnose(port: int) -> dict:
    errors: list[str] = []
    bound = _get_bound_ports()
    proc_list = _get_process_list()
    wrangler_proc = _find_wrangler_process()
    port_ready = _probe_port(port)
    http_info = _http_check(port) if port_ready else {"reachable": False, "error": "port not open"}

    if port in RESERVED_PORTS:
        errors.append(f"Port {port} is reserved by the Bun internal server — choose a different port.")

    if not port_ready:
        errors.append(f"Port {port} is not accepting connections (no process listening?)")

    if wrangler_proc is None:
        errors.append("No wrangler dev process found in process list.")

    return {
        "ready": port_ready and len(errors) == 0,
        "port": port,
        "pid": wrangler_proc["pid"] if wrangler_proc else None,
        "url": None,
        "errors": errors,
        "bound_ports": bound,
        "processes": [p for p in proc_list if "wrangler" in p["cmd"].lower() or str(port) in p["cmd"]],
        "http_check": http_info,
        "env_vars": _env_snapshot(),
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---------------------------------------------------------------------------
# --start mode
# ---------------------------------------------------------------------------

def start_wrangler_dev(port: int, cwd: str | None, extra_env: dict | None = None) -> dict:
    errors: list[str] = []

    if port in RESERVED_PORTS:
        return {
            "ready": False,
            "port": port,
            "pid": None,
            "url": None,
            "errors": [f"Port {port} is reserved by the Bun server. Use 8787 or 8080 instead."],
            "bound_ports": _get_bound_ports(),
            "processes": [],
            "env_vars": _env_snapshot(),
            "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    # If wrangler is already running on this port, return immediately
    if _probe_port(port):
        existing = _find_wrangler_process()
        return {
            "ready": True,
            "port": port,
            "pid": existing["pid"] if existing else None,
            "url": f"http://localhost:{port}",
            "errors": [],
            "bound_ports": _get_bound_ports(),
            "processes": [existing] if existing else [],
            "env_vars": _env_snapshot(),
            "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    # Resolve working directory
    work_dir = Path(cwd).resolve() if cwd else Path.cwd()
    if not work_dir.exists():
        errors.append(f"Working directory not found: {work_dir}")

    env = {**os.environ}
    if extra_env:
        env.update(extra_env)
    env["PORT"] = str(port)
    env["WRANGLER_DEV_PORT"] = str(port)

    # Start wrangler dev detached
    wrangler_cmd = f"wrangler dev --port {port} --local"
    try:
        proc = subprocess.Popen(
            wrangler_cmd,
            shell=True,
            cwd=str(work_dir),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        pid = str(proc.pid)
    except Exception as exc:
        errors.append(f"Failed to start wrangler dev: {exc}")
        return {
            "ready": False,
            "port": port,
            "pid": None,
            "url": None,
            "errors": errors,
            "bound_ports": _get_bound_ports(),
            "processes": [],
            "env_vars": _env_snapshot(),
            "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    # Poll for readiness (up to 30s)
    ready = False
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        time.sleep(1)
        if _probe_port(port):
            ready = True
            break

    if not ready:
        errors.append(f"wrangler dev did not bind to port {port} within 30 seconds.")
        # Try to kill the hung process
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            pass

    return {
        "ready": ready,
        "port": port,
        "pid": pid if ready else None,
        "url": f"http://localhost:{port}" if ready else None,
        "errors": errors,
        "bound_ports": _get_bound_ports(),
        "processes": [{"pid": pid, "cmd": wrangler_cmd, "port": port}] if ready else [],
        "env_vars": _env_snapshot(),
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wrangler dev port passthrough manager & diagnostics"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--start", action="store_true", help="Start wrangler dev and wait for port readiness")
    group.add_argument("--diagnose", action="store_true", help="Diagnose port/process state and return JSON report")

    parser.add_argument("--port", type=int, default=8787, help="Target port (default: 8787)")
    parser.add_argument("--cwd", type=str, default=None, help="Working directory for wrangler dev")
    args = parser.parse_args()

    if args.port in RESERVED_PORTS:
        sys.stderr.write(f"[port_passthrough.py] WARNING: port {args.port} is reserved. Use 8787 or 8080.\n")

    if args.diagnose:
        result = diagnose(args.port)
    else:
        result = start_wrangler_dev(args.port, args.cwd)

    print(json.dumps(result))
    sys.exit(0 if result.get("ready") else 1)


if __name__ == "__main__":
    main()
