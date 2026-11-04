#!/usr/bin/env python3
"""Export playable benchmark instances for the planning games.

    python3 scripts/build-game-instances.py /path/to/MindTopo

Reads environments/<env>/output/question.jsonl from the MindTopo code repo (the
instances the planning harness runs) and writes public/games/<game>.json with
the first PER_LEVEL seeds of each difficulty. Each record keeps the engine's own
reset_config, so the browser rebuilds exactly the benchmark board.
"""

import json
import sys
from pathlib import Path

PER_LEVEL = 40
# Untangle exports every hard seed so build-untangle-solutions.ts can scan all of them for the oracle.
PER_LEVEL_OVERRIDES = {("untangle", "hard"): None}

GAMES = {
    "pipe": "continuity_pipe",
    "onestroke": "separation_one_stroke",
    "swap": "order_swap_2d_puzzle",
    "chatnoir": "enclosure_chat_noir",
    "untangle": "knots_untangle",
}


def optimal_steps(game, meta):
    state = meta.get("initial_state", {})
    if game == "pipe":
        return state.get("solutionTicks")
    if game == "onestroke":
        return meta.get("solution_length")
    if game == "swap":
        return state.get("reset_config", {}).get("theoreticalMinSteps")
    return None


def main(repo: Path) -> int:
    out_dir = Path(__file__).resolve().parent.parent / "public" / "games"
    out_dir.mkdir(parents=True, exist_ok=True)
    for game, env in GAMES.items():
        rows = [json.loads(line) for line in (repo / "environments" / env / "output" / "question.jsonl").open() if line.strip()]
        picked = []
        for level in ("easy", "medium", "hard"):
            level_rows = sorted((r for r in rows if r["meta_info"].get("difficulty") == level), key=lambda r: r["meta_info"].get("seed", 0))
            limit = PER_LEVEL_OVERRIDES.get((game, level), PER_LEVEL)
            for r in level_rows[:limit]:
                meta = r["meta_info"]
                config = meta["initial_state"]["reset_config"]
                if config is None:
                    raise SystemExit(f"{r['id']}: missing reset_config")
                picked.append({
                    "id": r["id"],
                    "difficulty": level,
                    "budget": meta["max_actions_per_traj"],
                    "optimal": optimal_steps(game, meta),
                    "config": config,
                })
        path = out_dir / f"{game}.json"
        path.write_text(json.dumps({"source": f"{env}/output/question.jsonl", "instances": picked}, separators=(",", ":")))
        print(f"{path.name}: {len(picked)} instances, {path.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
