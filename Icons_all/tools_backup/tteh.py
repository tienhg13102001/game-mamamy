#!/usr/bin/env python3
"""tteh.py call <tool> [@args.json | 'json'] ; tteh.py list"""
import json, sys, urllib.request, base64
URL = "http://localhost:9101/mcp"
H = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
def post(body, sid=None):
    h = dict(H)
    if sid: h["mcp-session-id"] = sid
    r = urllib.request.urlopen(urllib.request.Request(URL, json.dumps(body).encode(), h), timeout=600)
    sid = r.headers.get("mcp-session-id") or sid
    txt = r.read().decode()
    out = None
    for line in txt.splitlines():
        if line.startswith("data:"):
            out = json.loads(line[5:])
    if out is None and txt.strip():
        out = json.loads(txt)
    return out, sid
def session():
    _, sid = post({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "c", "version": "1"}}})
    try: post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    except Exception: pass
    return sid
if __name__ == "__main__":
    sid = session()
    if sys.argv[1] == "list":
        r, _ = post({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, sid)
        for t in r["result"]["tools"]:
            print("##", t["name"], "-", t.get("description", "")[:300].replace("\n", " "))
        sys.exit()
    a = sys.argv[3] if len(sys.argv) > 3 else "{}"
    args = json.load(open(a[1:])) if a.startswith("@") else json.loads(a)
    r, _ = post({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": sys.argv[2], "arguments": args}}, sid)
    res = r.get("result", r)
    for c in res.get("content", []):
        if c.get("type") == "image":
            open("shot.png", "wb").write(base64.b64decode(c["data"])); print("IMAGE -> shot.png")
        else:
            print(str(c.get("text", c))[:2000000])
    if not res.get("content"): print(json.dumps(res)[:5000])
