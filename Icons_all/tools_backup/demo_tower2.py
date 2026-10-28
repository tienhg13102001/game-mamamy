import sys
p="/Users/tiennguyen/Documents/Game Mamamy/1 - Filter - Mamamy Tower 19 Challenge/Assets/Scripts/MamamyTowerGame.ts"
s=open(p).read()
if 'DEMO-TEMP' in s:
    i=s.index('    // DEMO-TEMP start'); j=s.index('    // DEMO-TEMP end\n')+len('    // DEMO-TEMP end\n'); s=s[:i]+s[j:]
    i=s.index('  // DEMO-TEMP fields'); j=s.index('  // DEMO-TEMP fields end\n')+len('  // DEMO-TEMP fields end\n'); s=s[:i]+s[j:]
mode=sys.argv[1]
if mode!='off':
    s=s.replace("    if (!this.initOnce()) return;\n", f"""    if (!this.initOnce()) return;
    // DEMO-TEMP start
    this.demoT += dt;
    if (this.state === "INTRO" && this.demoT > 4.5 && !this.demoGo) {{ this.demoGo = true; this.onRecordStart(); }}
    if (this.state === "RESULT" && !this.demoInResult) {{ this.demoInResult = true; this.demoRound++; }}
    if (this.state !== "RESULT") this.demoInResult = false;
    if (this.state === "AIMING" && this.held && this.heldAnim >= 1 && this.popupT < 0) {{
      const plan = [{mode}];
      const loseAt = plan[Math.min(this.demoRound, plan.length - 1)];
      this.demoWait -= dt;
      const n = this.floors.length;
      const tx = n > 0 ? this.floors[n - 1].cx : this.swingCenterX;
      if (this.demoErr > 9000) this.demoErr = n >= loseAt ? (tx > this.swingCenterX ? -1 : 1) * 140 : (Math.random() * 2 - 1) * 12;
      if (this.demoWait <= 0 && Math.abs(this.clawX - (tx + this.demoErr)) < 7) {{
        this.drop(); this.demoWait = 0.3 + Math.random() * 0.7; this.demoErr = 99999;
      }}
    }}
    // DEMO-TEMP end
""",1)
    s=s.replace("  private inited: boolean = false;\n","""  // DEMO-TEMP fields
  private demoT: number = 0;
  private demoGo: boolean = false;
  private demoWait: number = 0.6;
  private demoErr: number = 99999;
  private demoRound: number = 0;
  private demoInResult: boolean = false;
  // DEMO-TEMP fields end
  private inited: boolean = false;
""",1)
open(p,'w').write(s)
print('DEMO-TEMP' in s)
