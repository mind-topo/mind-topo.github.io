#!/usr/bin/env python3
"""Export playable planning boards from the exact MindTopo Core manifest.

    python3 scripts/build-game-instances.py \
      /path/to/topobench /path/to/topobench_arxiv/arxiv

For each planning task, exports the first 40 manifest entries from Core Easy and
Core Hard. Source-file, record, and model-input hashes are verified before any
site JSON is written. The benchmark checkout is read-only.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys


PER_LEVEL = 40
GAMES = {
    "pipe": "continuity_pipe",
    "onestroke": "separation_one_stroke",
    "swap": "order_swap_2d_puzzle",
    "chatnoir": "enclosure_chat_noir",
    "untangle": "knots_untangle",
}


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode()).hexdigest()


def clean_reset(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: clean_reset(val)
            for key, val in value.items()
            if key not in {"seed", "difficulty", "targetDifficulty"}
        }
    if isinstance(value, list):
        return [clean_reset(val) for val in value]
    return value


def source_bytes(benchmark: Path, source: str) -> bytes:
    if source.startswith("git:"):
        _, commit, relative = source.split(":", 2)
        return subprocess.check_output(
            ["git", "show", f"{commit}:{relative}"], cwd=benchmark
        )
    return (benchmark / source).read_bytes()


def input_hash(row: dict) -> str:
    meta = row["meta_info"]
    initial = meta["initial_state"]
    state = {key: val for key, val in initial.items() if key != "generatorInfo"}
    return digest({
        "initial_state": clean_reset(state),
        "action_budget": meta.get("max_actions_per_traj"),
    })


def optimal_steps(game: str, meta: dict) -> int | None:
    state = meta.get("initial_state", {})
    if game == "pipe":
        return state.get("solutionTicks")
    if game == "onestroke":
        return meta.get("solution_length")
    if game == "swap":
        return state.get("reset_config", {}).get("theoreticalMinSteps")
    return None


def main(benchmark: Path, paper: Path) -> int:
    data = paper / "data"
    release = json.loads((data / "release_counts.json").read_text())
    manifest = [json.loads(line) for line in (data / "core_manifest.jsonl").read_text().splitlines()]
    out_dir = Path(__file__).resolve().parent.parent / "public" / "games"
    out_dir.mkdir(parents=True, exist_ok=True)

    source_cache: dict[str, list[dict]] = {}
    for game, task in GAMES.items():
        selected = []
        for level in ("Easy", "Hard"):
            entries = [r for r in manifest if r["task"] == task and r["level"] == level]
            if len(entries) != 150:
                raise SystemExit(f"{task}/{level}: expected 150 manifest rows, found {len(entries)}")
            for entry in entries[:PER_LEVEL]:
                source = entry["source"]
                if source not in source_cache:
                    raw = source_bytes(benchmark, source)
                    expected = release["source_sha256"].get(source)
                    actual = hashlib.sha256(raw).hexdigest()
                    if actual != expected:
                        raise SystemExit(f"{source}: SHA256 {actual} != release {expected}")
                    source_cache[source] = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
                rows = source_cache[source]
                row = rows[entry["source_line"] - 1]
                if row["id"] != entry["id"]:
                    raise SystemExit(f"{source}:{entry['source_line']}: ID changed")
                if digest(row) != entry["record_sha256"]:
                    raise SystemExit(f"{task}/{row['id']}: record hash changed")
                if input_hash(row) != entry["input_sha256"]:
                    raise SystemExit(f"{task}/{row['id']}: input hash changed")

                meta = row["meta_info"]
                initial = meta["initial_state"]
                config = initial.get("reset_config")
                if not config:
                    raise SystemExit(f"{task}/{row['id']}: missing reset_config")
                exported = {
                    "id": row["id"],
                    "difficulty": level.lower(),
                    "sourceDifficulty": meta.get("difficulty"),
                    "budget": meta["max_actions_per_traj"],
                    "optimal": optimal_steps(game, meta),
                    "config": config,
                    "solution": None if game == "untangle" else [],
                    "inputSha256": entry["input_sha256"],
                    "source": source,
                    "sourceLine": entry["source_line"],
                }
                if game == "untangle":
                    exported["expectedState"] = {
                        "gridSize": initial["gridSize"],
                        "ropes": [{
                            "s": rope["startHole"]["id"],
                            "e": rope["endHole"]["id"],
                            "c": rope["color"],
                        } for rope in initial["ropes"]],
                        "signature": initial.get("generatorInfo", {}).get("signature"),
                        "visualCrossings": initial.get("visualCrossings"),
                        "logicalCrossings": initial.get("logicalCrossings"),
                    }
                selected.append(exported)

        path = out_dir / f"{game}.json"
        payload = {
            "source": {
                "manifest": "arxiv/data/core_manifest.jsonl",
                "benchmarkCommit": release["benchmark_commit"],
                "task": task,
                "perLevel": PER_LEVEL,
            },
            "instances": selected,
        }
        path.write_text(json.dumps(payload, separators=(",", ":")))
        levels = {level: sum(x["difficulty"] == level for x in selected) for level in ("easy", "hard")}
        print(f"{path.name}: {levels}, {path.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
