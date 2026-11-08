#!/usr/bin/env python3
"""Export the current manuscript, release manifests, and two Core examples.

    python3 scripts/sync-release-assets.py ../topobench_arxiv/arxiv ../topobench

Requires Pillow and Poppler's pdftotext. Benchmark files are only read. The
manifests identify inputs and source locations; they do not include full images.
"""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image

SITE = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main(paper: Path, benchmark: Path):
    data = paper / "data"
    core = [json.loads(line) for line in (data / "core_manifest.jsonl").read_text().splitlines()]
    extended = [json.loads(line) for line in (data / "extended_manifest.jsonl").read_text().splitlines()]
    counts = json.loads((data / "release_counts.json").read_text())
    assert len(core) == counts["core"] and len(extended) == counts["extended"]
    assert not ({r["input_sha256"] for r in core} & {r["input_sha256"] for r in extended})

    manuscript = paper / "arxiv.pdf"
    abstract = subprocess.check_output(
        ["pdftotext", "-f", "1", "-l", "1", str(manuscript), "-"], text=True
    )
    assert "Core Set of 3,900" in abstract and "Extended Set of 8,780" in abstract

    examples = {}
    assets = SITE / "public/media/tasks"
    for task, label, stem in (("separation_objects", "Assembly", "assembly-core"),
                              ("order_bead_string", "Bead", "bead-core")):
        entry = next(r for r in core if r["task"] == task and r["level"] == "Easy")
        source = benchmark / entry["source"]
        row = json.loads(source.read_text().splitlines()[entry["source_line"] - 1])
        raw = json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        assert digest(raw) == entry["record_sha256"], f"Changed source record: {row['id']}"
        media = []
        for i, (relative, expected) in enumerate(zip(row["images"], entry["image_sha256"], strict=True)):
            image_path = source.parent / relative
            assert digest(image_path.read_bytes()) == expected, f"Changed image: {image_path}"
            suffix = "" if i == 0 else f"-{chr(96 + i)}"
            name = f"{stem}{suffix}.webp"
            with Image.open(image_path) as image:
                image.convert("RGB").save(assets / name, "WEBP", quality=90, method=6)
                media.append({"src": f"/media/tasks/{name}", "width": image.width, "height": image.height})
        item = {"source": {"id": row["id"], "level": "Core Easy", "manifest": "/release/core_manifest.jsonl.gz"},
                "media": media[:1]}
        if label == "Assembly":
            assert len(media) == 6 and row["gt_answer"] in "ABCDE"
            item["prompt"] = "Which pair of subassemblies exactly reconstructs the complete object? Choose A, B, C, D, or E."
            item["options"] = [{"label": letter, "image": image["src"], "width": image["width"],
                                "height": image["height"], "correct": letter == row["gt_answer"]}
                               for letter, image in zip("ABCDE", media[1:], strict=True)]
        else:
            item["prompt"] = "Start at the bead circled in white, follow the indicated direction along the string, and list all bead colours in order."
            item["answer"] = row["gt_answer"]
        examples[label] = item

    release = SITE / "public/release"
    release.mkdir(exist_ok=True)
    for name in ("core_manifest.jsonl", "extended_manifest.jsonl"):
        (release / f"{name}.gz").write_bytes(gzip.compress((data / name).read_bytes(), mtime=0))
    for name in ("release_counts.json", "extended_results.json"):
        shutil.copyfile(data / name, release / name)
    (SITE / "public/paper").mkdir(exist_ok=True)
    shutil.copyfile(manuscript, SITE / "public/paper/mindtopo-current.pdf")
    (SITE / "src/data/examples.json").write_text(json.dumps(examples, indent=2) + "\n")
    print("Exported current manuscript, release manifests, Extended results, and verified Core examples.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
