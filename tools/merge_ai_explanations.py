#!/usr/bin/env python3
"""Merge exported browser AI explanations into data/questions.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 tools/merge_ai_explanations.py path/to/class9-ai-explanations.json")
        return 2

    root = Path(__file__).resolve().parents[1]
    questions_path = root / "data" / "questions.json"
    export_path = Path(sys.argv[1]).expanduser().resolve()

    questions = json.loads(questions_path.read_text())
    exported = json.loads(export_path.read_text())
    exported_items = exported.get("explanations", exported)

    if not isinstance(exported_items, list):
        raise SystemExit("Export file must contain an explanations list.")

    explanations_by_id = {
        str(item.get("question_id", "")).strip(): str(item.get("explanation", "")).strip()
        for item in exported_items
        if str(item.get("question_id", "")).strip() and str(item.get("explanation", "")).strip()
    }

    changed = 0
    for question in questions:
        explanation = explanations_by_id.get(str(question.get("question_id", "")).strip())
        if explanation and question.get("explanation") != explanation:
            question["explanation"] = explanation
            changed += 1

    questions_path.write_text(json.dumps(questions, ensure_ascii=False, separators=(",", ":")))
    print(f"exported_explanations={len(explanations_by_id)}")
    print(f"updated_questions={changed}")
    print(f"questions_total={len(questions)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
