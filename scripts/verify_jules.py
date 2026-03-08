
import requests
import os
import json
import sys

# Configuration
API_URL = os.environ.get("BASE_URL", "http://localhost:8787")
API_KEY = os.environ.get("WORKER_API_KEY", "test-key")

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def test_standards():
    print(f"Testing GET {API_URL}/api/standards...")
    try:
        res = requests.get(f"{API_URL}/api/standards", headers=headers)
        if res.status_code == 200:
            print("✅ Standards API: OK")
            print("Preview:", res.text[:100])
        else:
            print(f"❌ Standards API Failed: {res.status_code} - {res.text}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        sys.exit(1)

def test_invoke():
    print(f"Testing POST {API_URL}/api/jules/invoke...")
    payload = {
        "prompt": "Verify this test invocation.",
        "repo": {
            "owner": "test-owner",
            "name": "test-repo",
            "branch": "main"
        },
        "force_overseer": False,
        "session_id": "test-verification-session"
    }
    
    try:
        # We expect a 500 or 400 because we don't have real secrets/DB in local dev usually 
        # unless running with `wrangler dev`.
        # But if valid, it might start.
        res = requests.post(f"{API_URL}/api/jules/invoke", json=payload, headers=headers)
        
        if res.status_code == 200:
            print("✅ Jules Invoke: OK")
            print(json.dumps(res.json(), indent=2))
        elif res.status_code == 500:
            print(f"⚠️ Jules Invoke: Server Error (Expected if DB/Secrets missing locally)")
            print(res.text)
        else:
            print(f"❌ Jules Invoke Failed: {res.status_code} - {res.text}")
            
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    test_standards()
    test_invoke()
