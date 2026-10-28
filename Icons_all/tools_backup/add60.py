import json, subprocess, sys
S = sys.path[0]
def call(tool, args):
    out = subprocess.run(["python3", f"{S}/tteh.py", "call", tool, json.dumps(args)], capture_output=True, text=True).stdout
    return out
def j(s):
    s = s.strip()
    if s.endswith("IMAGE -> shot.png"): s = s[: -len("IMAGE -> shot.png")]
    return json.loads(s)
game = sys.argv[1]
P = f"/Users/tiennguyen/Documents/Game Mamamy/{game}"
print(call("open_project", {"path": f"{P}/effect.ehproj", "intention": "add 60s text"})[:200])
tree = j(call("get_scene", {"names_only": True, "intention": "find intro"}))
found = {}
def walk(nodes, parent=None):
    for n in nodes:
        found.setdefault(n["name"], (n["guid"], parent, [c["name"] for c in n.get("children", [])]))
        walk(n.get("children", []), n["guid"])
for rg in tree["renderGroups"]: walk(rg["sceneObjects"])
if "Intro60s" in found: print("already has Intro60s"); sys.exit()
ov = found["IntroOverlay"][0]; btn = found["IntroButton"][0]
# CTA = the button's first child
cta = [g for name, (g, p, _) in found.items() if p == btn][0]
bi = j(call("inspect", {"guid": btn, "intention": "button transform"}))
st = [c for c in bi["components"] if c["type"] == "ScreenTransform"][0]
bx, by = st["anchoredPosition"]["x"], st["anchoredPosition"]["y"]; bh = st["sizeDelta"]["y"] * st["scale"]["y"]
# button parent may not be the overlay; assume direct child (checked by printing)
print("overlay", ov, "button", btn, found["IntroButton"][1], "cta", cta, "btn pos", bx, by, bh)
w, h = 300, 300 * 79 / 570
y = by + bh / 2 + 8 + h / 2
r = j(call("edit_by_dsl", {"intention": "60s text above RECORD TO PLAY", "commands": [
    {"commandType": "import_source", "params": {"file_path": f"{P}/Build/guide/hint_60s.png"}, "alias": "tex"},
    {"commandType": "duplicate_object", "params": {"guid": cta}, "alias": "txt"},
    {"commandType": "move_object", "params": {"guid": {"$ref": "txt"}, "parent": ov}},
]}))
tex = r["results"][0]["result"]["guid"]; obj = r["results"][1]["result"]
o = obj["guid"]; stc = [c["guid"] for c in obj["components"] if c["type"] == "ScreenTransform"][0]
img = [c["guid"] for c in obj["components"] if c["type"] == "Image"][0]
r = j(call("edit_by_dsl", {"intention": "place 60s text", "commands": [
    {"commandType": "set_object", "params": {"guid": o, "properties": {"name": "Intro60s"}}},
    {"commandType": "set_component", "params": {"guid": stc, "properties": {"anchoredPosition": {"x": bx, "y": round(y, 1)}, "sizeDelta": {"x": w, "y": round(h, 1)}, "rotation": 0, "scale": {"x": 1, "y": 1}}}},
    {"commandType": "set_component", "params": {"guid": img, "properties": {"texture": {"guid": tex}, "opacity": 1}}},
    {"commandType": "configure_source", "params": {"guid": tex, "properties": {"compressMaxResolution": {"type": "Enum", "data": "Size1024"}, "wrapModeS": {"type": "Enum", "data": "Clamp"}, "wrapModeT": {"type": "Enum", "data": "Clamp"}}}},
    {"commandType": "annotate", "params": {"guid": tex, "annotation": "Text 'CHỌN VIDEO 60S' pink #CF0055 with white outline, above RECORD TO PLAY on the intro"}},
]}))
print([(x["command"], x["status"]) for x in r["results"]], "y", y)
call("capture_preview", {"intention": "check intro"})
subprocess.run(["cp", f"{S}/shot.png", f"{S}/intro_{game[0]}.png"])
