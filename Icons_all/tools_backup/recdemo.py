import json, subprocess, sys, time, shutil, re
S = sys.path[0]
def call(tool, args):
    return subprocess.run(["python3", f"{S}/tteh.py", "call", tool, json.dumps(args)], capture_output=True, text=True).stdout
def j(s):
    s = s.strip().replace("IMAGE -> shot.png", "").strip()
    return json.loads(s)
game, mode, out = sys.argv[1], sys.argv[2], sys.argv[3]
P = f"/Users/tiennguyen/Documents/Game Mamamy/{game}"
print(call("open_project", {"path": f"{P}/effect.ehproj", "intention": "record demo"})[:120])
gm = None; comp = None
if mode != "tower":
    tree = j(call("get_scene", {"names_only": True, "intention": "find GameManager"}))
    gm = [o["guid"] for rg in tree["renderGroups"] for o in rg["sceneObjects"] if o["name"] == "GameManager"][0]
    info = j(call("inspect", {"guid": gm, "intention": "script component"}))
    comp = [c["guid"] for c in info["components"] if "demoMode" in json.dumps(c)][0]
    print(call("edit_by_dsl", {"intention": "demo on", "commands": [{"commandType": "set_component", "params": {"guid": comp, "properties": {"demoMode": int(mode)}}}]})[:300])
r = call("interact_by_dsl", {"intention": "record demo", "commands": [{"commandType": "reset_preview"}, {"commandType": "record_preview_video_mp4", "params": {"duration_seconds": 60}}]})
m = re.search(r'(/var/folders[^"]*?\.mp4|/[^"]*?\.mp4)', r); print(r[:400])
time.sleep(6)
shutil.copy(m.group(1), out)
if comp:
    print(call("edit_by_dsl", {"intention": "demo off", "commands": [{"commandType": "set_component", "params": {"guid": comp, "properties": {"demoMode": 0}}}]})[:300])
print(call("save_project", {"intention": "save"})[:150])
