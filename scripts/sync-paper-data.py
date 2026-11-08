#!/usr/bin/env python3
"""Regenerate src/data/paper.json from the arXiv manuscript sources.

Every number on the site comes from this file, so refreshing the page after a
results update is one command:

    python3 scripts/sync-paper-data.py ../topobench_arxiv/arxiv

The argument is the paper's arXiv directory. The script parses the tables listed
in SOURCES plus data/release_counts.json, cross-checks them, and exits non-zero
if anything disagrees, so a stale or half-edited result never reaches the page
silently.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SOURCES = {
    "main": "tables/01_new_dataset_table.tex",
    "easy": "tables/04_easy_level_human.tex",
    "difficulty": "tables/03_difficulty_results.tex",
    "training": "tables/02_rl_sft_results.tex",
    "errors_reasoning": "tables/04_error_analysis_reasoning.tex",
    "errors_planning": "tables/04_error_analysis_planning.tex",
    "probing": "tables/03interleaved_probing.tex",
    "cv": "tables/03_cv_metric_results.tex",
}

# Column order shared by the main, Easy and difficulty tables.
TASKS = [
    "2D Maze", "3D Maze", "Pipe", "Assembly", "One Stroke", "Bead", "Origami Point",
    "Swap", "Sheep", "Hole", "Chat Noir", "Knots", "Untangle",
]

# Read off figures/07_error_breakdown_per_task.pdf (a plot, not a table).
GENERATION_AUDIT = {
    "image": {"generator": "GPT-Image-2", "tasks": ["Sheep", "2D Maze", "One Stroke"], "total": 464,
              "errors": {"Dynamics": 95, "Invariant": 92, "Consistency": 68}},
    "video": {"generator": "Wan2.2-I2V-A14B", "tasks": ["One Stroke", "Untangle"], "total": 119,
              "errors": {"Dynamics": 116, "Invariant": 93, "Consistency": 90}},
}

DECIMAL = re.compile(r"\d+\.\d+")


def read_tex(path: Path) -> str:
    """Return the file with full-line and trailing comments removed."""
    lines = []
    for line in path.read_text().splitlines():
        line = re.sub(r"(?<!\\)%.*$", "", line)
        if line.strip():
            lines.append(line)
    return "\n".join(lines)


def strip_tex(cell: str) -> str:
    cell = re.sub(r"\\(textbf|textit|emph)\{([^}]*)\}", r"\2", cell)
    return re.sub(r"\s+", " ", cell).strip()


def last_decimal(cell: str):
    found = DECIMAL.findall(cell)
    return float(found[-1]) if found else None


def score_rows(tex: str, n_values: int):
    """Rows shaped `& Name & v1 & ... & vn \\` (leading spacer column)."""
    rows = {}
    for chunk in tex.split("\\\\"):
        cells = chunk.split("&")
        if len(cells) != n_values + 2:
            continue
        name = strip_tex(cells[1])
        values = [last_decimal(c) for c in cells[2:]]
        if name and all(v is not None for v in values):
            rows[name] = values
    return rows


def parse_main(tex):
    rows = score_rows(tex, len(TASKS) + 2)
    return {name: {"tasks": v[:13], "reason": v[13], "plan": v[14]} for name, v in rows.items()}


def parse_difficulty(tex):
    out = {}
    for table in re.findall(r"\\begin\{tabularx\}(.*?)\\end\{tabularx\}", tex, re.S):
        tasks = re.findall(r"\\[PI]Task\{([^}]*)\}", table)
        for name, values in score_rows(table, 2 * len(tasks)).items():
            for i, task in enumerate(tasks):
                out.setdefault(name, {})[task] = {"easy": values[2 * i], "hard": values[2 * i + 1]}
    return out


def parse_training(tex):
    tasks = re.findall(r"\\resulttaskheader\{([^}]*)\}", tex)
    rows = {}
    for chunk in tex.split("\\\\"):
        cells = [c.strip() for c in chunk.split("&")]
        if len(cells) != len(tasks) + 1:
            continue
        name = strip_tex(cells[0].split("\n")[-1])
        if name in ("Training", ""):
            continue
        rows[name] = [last_decimal(c) for c in cells[1:]]
    return {"tasks": tasks, "rows": rows}


def parse_errors(tex):
    out = {}
    for chunk in tex.split("\\\\"):
        cells = [c.strip() for c in chunk.split("&")]
        m = re.match(r"(?:.*\n)?\s*(\d)\.\s+(.+)$", cells[0], re.S)
        if len(cells) != 7 or not m:
            continue
        counts = [int(cells[i]) for i in (1, 3, 5)]
        out[m.group(2).strip()] = {"Gemini-3.1-Pro": counts[0], "InternVL3.5-241B": counts[1], "Combined": counts[2]}
    return out


def parse_probing(tex):
    out = []
    for table in re.findall(r"\\begin\{tabularx\}(.*?)\\end\{tabularx\}", tex, re.S):
        tasks = re.findall(r"\\resulttaskheader\{([^}]*)\}", table)
        band = None
        for chunk in table.split("\\\\"):
            head = re.search(r"\\blockheadcols\{\d+\}\{([^}]*)\}", chunk)
            if head:
                band = head.group(1).strip()
                chunk = chunk[head.end():]
            cells = chunk.split("&")
            if len(cells) != len(tasks) + 1 or band is None:
                continue
            planner = strip_tex(cells[0].split("\n")[-1])
            for task, cell in zip(tasks, cells[1:]):
                out.append({"condition": band, "planner": planner, "task": task, "success": last_decimal(cell)})
    return out


def parse_cv(tex):
    out = {}
    for block in re.findall(r"\\begin\{tabular\*\}(.*?)\\end\{tabular\*\}", tex, re.S):
        task = re.search(r"\\textit\{([^}]*)\}", block).group(1)
        for chunk in block.split("\\\\"):
            cells = chunk.split("&")
            name = cells[0].strip().split("\n")[-1].strip()
            if not re.match(r"^[A-Z][\w.\-]+(-[\w.]+)*$", name) or len(cells) < 6:
                continue
            nums = [float(x) for x in re.findall(r"\$(\d+\.\d+)\$", chunk)]
            out.setdefault(task, {})[name] = {"finalStateSuccess": nums[-2], "processValid": nums[-1]}
    return out


def main(root: Path) -> int:
    tex = {key: read_tex(root / rel) for key, rel in SOURCES.items()}
    release_path = root / "data/release_counts.json"
    release_counts = json.loads(release_path.read_text())
    main_rows = parse_main(tex["main"])
    easy_rows = parse_main(tex["easy"])
    difficulty = parse_difficulty(tex["difficulty"])

    problems = []
    expected_core = len(TASKS) * 300
    if release_counts.get("core") != expected_core:
        problems.append(
            f"release Core count {release_counts.get('core')} != {expected_core} "
            f"({len(TASKS)} tasks x 300)"
        )
    if release_counts.get("extended", 0) <= 0:
        problems.append("release Extended count is missing or non-positive")
    models = [m for m in main_rows if m != "Random Chance"]
    for model in models:
        all_scores = main_rows[model]["tasks"]
        for i, task in enumerate(TASKS):
            cell = difficulty.get(model, {}).get(task)
            if cell is None:
                problems.append(f"{model} / {task}: missing from difficulty tables")
                continue
            if abs((cell["easy"] + cell["hard"]) / 2 - all_scores[i]) > 0.02:
                problems.append(f"{model} / {task}: (easy+hard)/2 != main table {all_scores[i]}")
            if abs(cell["easy"] - easy_rows[model]["tasks"][i]) > 0.005:
                problems.append(f"{model} / {task}: difficulty easy != Easy-level table")
        for key, idx in (("reason", [0, 1, 3, 5, 6, 8, 9, 11]), ("plan", [2, 4, 7, 10, 12])):
            mean = sum(all_scores[i] for i in idx) / len(idx)
            if abs(mean - main_rows[model][key]) > 0.02:
                problems.append(f"{model}: computed {key} mean {mean:.2f} != table {main_rows[model][key]}")

    if problems:
        print("Paper tables disagree; not writing paper.json:", *problems, sep="\n  ")
        return 1

    try:
        commit = subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"

    data = {
        "source": {
            "paper": "arXiv manuscript (arxiv/)",
            "commit": commit,
            "tables": SOURCES,
            "releaseCounts": "data/release_counts.json",
        },
        "release": {
            "core": release_counts["core"],
            "extended": release_counts["extended"],
            "deduplicationScope": release_counts["deduplication_scope"],
        },
        "tasks": TASKS,
        "models": [
            {
                "name": model,
                "group": "proprietary" if i < 7 else "open-weight",
                "all": main_rows[model]["tasks"],
                "easy": easy_rows[model]["tasks"],
                "hard": [difficulty[model][t]["hard"] for t in TASKS],
            }
            for i, model in enumerate(models)
        ],
        "random": main_rows["Random Chance"]["tasks"],
        "humanEasy": easy_rows["Human"]["tasks"],
        "training": parse_training(tex["training"]),
        "errors": {"reasoning": parse_errors(tex["errors_reasoning"]),
                   "planning": parse_errors(tex["errors_planning"])},
        "probing": parse_probing(tex["probing"]),
        "videoVerifier": parse_cv(tex["cv"]),
        "generationAudit": GENERATION_AUDIT,
    }

    out = Path(__file__).resolve().parent.parent / "src" / "data" / "paper.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out} "
          f"({len(models)} models, paper commit {commit})")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
