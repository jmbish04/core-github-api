# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "requests",
#     "playwright",
#     "python-dotenv",
# ]
# ///
import os
import sys
import time
import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

# Load environment variables
load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://core-github-api.hacolby.workers.dev")
# Try to get key from env, otherwise warn. The user can export it or put in .env
WORKER_API_KEY = os.getenv("WORKER_API_KEY") or os.getenv("CORE_GITHUB_API_KEY")

def log(msg, type="INFO"):
    print(f"[{type}] {msg}")

def test_api_health():
    url = f"{BASE_URL}/healthz"
    log(f"Testing API Health: {url}")
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            log("API Health Check PASSED", "SUCCESS")
            return True
        else:
            log(f"API Health Check FAILED: {response.status_code} - {response.text}", "ERROR")
            return False
    except Exception as e:
        log(f"API Health Check ERROR: {e}", "ERROR")
        return False

def test_api_config():
    if not WORKER_API_KEY:
        log("Skipping API Config test - WORKER_API_KEY not found", "WARN")
        return True # specific auth test skipped but overall flow continues
    
    url = f"{BASE_URL}/api/config"
    log(f"Testing API Config (Auth): {url}")
    headers = {"x-api-key": WORKER_API_KEY}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            log("API Config Check PASSED", "SUCCESS")
            return True
        else:
            log(f"API Config Check FAILED: {response.status_code} - {response.text}", "ERROR")
            return False
    except Exception as e:
        log(f"API Config Check ERROR: {e}", "ERROR")
        return False

def test_frontend_rendering():
    log("Testing Frontend Rendering with Playwright...")
    
    # Check for Cloudflare Browser Render Token (User requested feature)
    # Note: Connecting to CF Browser Rendering from local python is non-trivial without a specific WSS endpoint.
    # We will default to local headless for reliability, but log the token if present.
    cf_token = os.getenv("CLOUDFLARE_BROWSER_RENDER_TOKEN")
    if cf_token:
        log(f"CLOUDFLARE_BROWSER_RENDER_TOKEN found. (Remote rendering implementation pending specific WSS endpoint - failing back to local)", "INFO")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        log(f"Navigating to {BASE_URL}...")
        try:
            response = page.goto(BASE_URL, timeout=30000)
            if not response.ok:
                log(f"Frontend Load FAILED: {response.status} {response.status_text}", "ERROR")
                browser.close()
                return False
            
            # Wait for content
            page.wait_for_load_state("networkidle")
            title = page.title()
            log(f"Page Title: {title}", "INFO")
            
            # Take a screenshot
            os.makedirs("tests/e2e/screenshots", exist_ok=True)
            screenshot_path = "tests/e2e/screenshots/homepage.png"
            page.screenshot(path=screenshot_path)
            log(f"Screenshot saved to {screenshot_path}", "INFO")
            
            log("Frontend Rendering PASSED", "SUCCESS")
            browser.close()
            return True
        except Exception as e:
            log(f"Frontend Rendering ERROR: {e}", "ERROR")
            browser.close()
            return False

def main():
    log("Starting End-to-End Tests for Core GitHub API Worker...")
    
    results = {
        "api_health": test_api_health(),
        "api_config": test_api_config(),
        "frontend": test_frontend_rendering()
    }
    
    failed = [k for k, v in results.items() if not v]
    
    if failed:
        log(f"Tests Failed: {', '.join(failed)}", "ERROR")
        sys.exit(1)
    else:
        log("All Tests Passed!", "SUCCESS")
        sys.exit(0)

if __name__ == "__main__":
    main()
