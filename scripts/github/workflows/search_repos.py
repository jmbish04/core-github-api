import urllib.parse

def search_broad_workers():
    """Searches for ANY valid worker config file using correct URL formatting."""
    
    # 1. Define the raw query
    raw_query = 'compatibility_date path:/(wrangler\\.jsonc|wrangler\\.toml)/'
    
    # 2. Encode the query (handles spaces, slashes, and regex chars correctly)
    encoded_query = urllib.parse.quote(raw_query)
    
    # 3. Construct the URL - THE '?' IS CRITICAL
    # Note: sort and order are parameters, not part of the query string itself
    url = f"https://api.github.com{encoded_query}&sort=indexed&order=desc&per_page=30"
    
    print(f"🌊 Casting wide net with encoded query: {raw_query}")
    
    try:
        res = requests.get(url, headers=HEADERS, timeout=30)
        
        if res.status_code != 200:
            print(f"❌ Error: {res.status_code} - {res.text}")
            return []
            
        items = res.json().get('items', [])
        results = []
        seen_repos = set()

        print(f"🔍 Analyzing {len(items)} raw hits...")

        for item in items:
            repo = item['repository']
            name = repo['full_name']
            
            # Skip duplicates and forks to keep the list high quality
            if name in seen_repos or repo.get('fork'): 
                continue
            seen_repos.add(name)
            
            print(f"   👉 Inspecting: {name}...")
            
            stack_tags = analyze_stack(name)
            
            results.append({
                "name": name,
                "url": repo['html_url'],
                "description": repo.get('description', 'No description'),
                "detected_stack": stack_tags,
                "config_file": item['name'],
                "discovered_at": datetime.now(timezone.utc).isoformat()
            })
            time.sleep(1) # Sleep to avoid GitHub secondary rate limits

        return results

    except Exception as e:
        print(f"❌ Fatal Request Error: {e}")
        return []
