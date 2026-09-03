"""Daily refresh with a process lock, bounded retries and machine-readable status."""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from pipeline_config import ROOT, get_supabase, season

LOGS = ROOT / "logs"

def now():
    return datetime.now(timezone.utc).isoformat()

def steps(node):
    py = sys.executable
    return [
        ("schedule", [py, "components/scripte/fetch_nba_schedule.py"], []),
        ("players", [py, "components/scripte/update_nba_players.py"], []),
        ("game_logs", [py, "components/scripte/fetch_team_game_logs.py"], []),
        ("availability", [py, "components/scripte/injury_test/upsert_team_availability_espn.py", "--limit", "300", "--debug", "0"], ["schedule", "players"]),
        ("predictions", [py, "components/scripte/predict_game_odds_final.py", "--limit", "300"], ["schedule", "players", "game_logs", "availability"]),
    ]

def preflight(node):
    import joblib
    import pandas as pd
    import numpy as np
    import nba_api
    import lxml
    get_supabase().table("GameSchedule").select("nba_game_id").limit(1).execute()
    from predict_game_odds_final import FEATURE_COLS_V3
    for name in ("lr_moneyline_final", "xgb_moneyline_final"):
        model = joblib.load(ROOT / "models" / (name + ".joblib"))
        sample = pd.DataFrame([[0.5] * len(FEATURE_COLS_V3)], columns=FEATURE_COLS_V3)
        if not np.isfinite(model.predict_proba(sample)).all():
            raise RuntimeError(f"Invalid output from {name}")
    subprocess.run([node, "--version"], check=True, capture_output=True)
    print(f"Preflight OK; season {season()}; both models loaded and predicted.", flush=True)

def write_status(status):
    temp = LOGS / "pipeline-status.tmp"
    temp.write_text(json.dumps(status, indent=2), encoding="utf-8")
    temp.replace(LOGS / "pipeline-status.json")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Read-only configuration and model check")
    parser.add_argument("--only", choices=[s[0] for s in steps("node")])
    args = parser.parse_args()
    node = os.environ.get("NODE_EXECUTABLE") or shutil.which("node")
    if not node or not Path(node).is_file():
        raise RuntimeError("Set NODE_EXECUTABLE to the full path of node.exe")
    if args.check:
        preflight(node)
        return 0
    LOGS.mkdir(exist_ok=True)
    import msvcrt
    with (LOGS / "pipeline.lock").open("a+b") as lock:
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print("Another refresh is already running; skipped.")
            return 0
        if not lock.read(1):
            lock.write(b"0")
            lock.flush()
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        logfile = LOGS / f"pipeline-{run_id}.log"
        status = {"started_at": now(), "owner": os.environ.get("PIPELINE_OWNER", "laptop"),
                  "season": season(), "schedule_season": os.environ.get("NBA_SCHEDULE_SEASON", season()),
                  "scope": args.only or "all", "state": "running", "log": str(logfile), "steps": {}}
        write_status(status)
        env = dict(os.environ, PYTHONUTF8="1", PYTHONUNBUFFERED="1")
        env["PYTHONPATH"] = str(ROOT / "components" / "scripte")
        with logfile.open("w", encoding="utf-8") as log:
            try:
                preflight(node)
                for name, cmd, dependencies in steps(node):
                    if args.only and args.only != name:
                        continue
                    if not args.only and any(status["steps"].get(d, {}).get("state") != "success" for d in dependencies):
                        status["steps"][name] = {"state": "skipped", "reason": "dependency failed"}
                        write_status(status)
                        continue
                    result = {"state": "running", "started_at": now()}
                    status["steps"][name] = result
                    write_status(status)
                    for attempt in range(1, 3):
                        log.write(f"\n[{now()}] {name}, attempt {attempt}\n")
                        log.flush()
                        try:
                            child = subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                                                   timeout=1200, creationflags=subprocess.CREATE_NO_WINDOW)
                            result["exit_code"] = child.returncode
                        except subprocess.TimeoutExpired:
                            result["exit_code"] = 124
                        if result["exit_code"] == 0:
                            break
                        if attempt == 1:
                            time.sleep(10)
                    result.update(state="success" if result["exit_code"] == 0 else "failed", finished_at=now())
                    write_status(status)
                status["state"] = "success" if all(s["state"] == "success" for s in status["steps"].values()) else "failed"
            except Exception as exc:
                status["state"] = "failed"
                status["error"] = type(exc).__name__
                log.write(f"Preflight/runtime failed: {type(exc).__name__}: {exc}\n")
            finally:
                status["finished_at"] = now()
                write_status(status)
                if status["state"] == "success" and not args.only:
                    (LOGS / "pipeline-last-success.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
                print(f"Pipeline {status['state']}. Details: {logfile}", flush=True)
        return 0 if status["state"] == "success" else 1

if __name__ == "__main__":
    sys.exit(main())
