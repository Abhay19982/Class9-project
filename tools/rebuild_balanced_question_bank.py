"""Rebuild the static quiz bank with stricter variety controls.

The app reads data/questions.json directly on Netlify. This script keeps a small
set of the existing calculation questions, caps repeated stems, then fills the
bank with syllabus-topic questions that have static explanations.
"""

from __future__ import annotations

import csv
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "questions.json"
OUT_CSV = ROOT.parent / "generated_question_bank" / "NCERT_Class_9_10_5000_Balanced_Question_Bank.csv"
SOURCE_CSV = ROOT.parent / "generated_question_bank" / "NCERT_Class_9_10_5000_Syllabus_Question_Bank.csv"
TARGET_COUNT = 5000
SUBJECT_TARGET = {"Maths": 2500, "Science": 2500}
PATTERN_CAP = 3


ANGLE_STEMS = [
    "Which statement best explains {topic} as used in {chapter}?",
    "A student is revising {chapter}. Which note about {topic} is accurate?",
    "Which classroom example correctly connects to {topic}?",
    "Which mistake should be avoided while applying {topic}?",
    "Which observation would support the idea of {topic}?",
    "Which step is most useful when solving a question on {topic}?",
    "Which comparison correctly describes {topic}?",
    "Which conclusion follows from the NCERT idea of {topic}?",
    "Which choice gives the clearest meaning of {topic}?",
    "Which statement would help identify {topic} in a problem?",
    "Which use of {topic} is most appropriate in {chapter}?",
    "Which reason correctly supports the answer in a question on {topic}?",
    "Which option is the best quick check for {topic}?",
    "Which statement separates {topic} from a nearby misconception?",
    "In a test question from {chapter}, what should you remember about {topic}?",
    "Which learner response shows correct understanding of {topic}?",
    "Which teacher hint would be most helpful for {topic}?",
    "Which sentence can be used as a reliable summary of {topic}?",
]

SCENARIO_LABELS = [
    "accuracy",
    "method",
    "diagram",
    "data",
    "definition",
    "application",
    "reasoning",
    "shortcut",
    "error-check",
    "experiment",
    "revision",
    "comparison",
    "proof",
    "observation",
    "case-study",
    "lab-work",
    "homework",
    "exam",
    "activity",
    "concept-map",
    "stepwise",
    "diagnostic",
    "challenge",
    "recall",
    "interpretation",
    "prediction",
    "inference",
    "analysis",
    "correction",
    "summary",
    "practice",
    "extension",
    "verification",
    "estimation",
    "classification",
    "model",
    "graph",
    "table",
    "unit-check",
    "real-life",
    "boundary",
    "condition",
    "example",
    "non-example",
    "selection",
    "review",
    "diagnosis",
    "reflection",
    "connection",
    "transfer",
]


MATH_METHOD_WORDS = {
    "hcf": "break the numbers into common divisors or use Euclid's division idea",
    "euclid": "apply division repeatedly until the remainder becomes zero",
    "polynomial": "use substitution, factorisation, identities, or the zero relation as needed",
    "linear": "translate the condition into an equation and check the ordered pair or solution",
    "quadratic": "bring the equation to standard form and use factorisation, formula, or discriminant",
    "ap": "use the first term, common difference, and term formula carefully",
    "statistics": "organise the data first, then calculate the required measure",
    "probability": "compare favourable outcomes with total equally likely outcomes",
    "trigonometry": "use standard ratios, identities, and the given angle condition",
    "triangle": "use the given geometry relation before calculating lengths or angles",
}


SCIENCE_METHOD_WORDS = {
    "motion": "connect distance, displacement, speed, velocity, acceleration, and time correctly",
    "force": "relate change in motion to force and use Newton's laws carefully",
    "sound": "connect vibration, medium, frequency, amplitude, and wave speed",
    "light": "trace rays using reflection or refraction rules",
    "electricity": "use the relation between current, potential difference, resistance, and energy",
    "atom": "connect atomic number, mass number, electrons, protons, and neutrons",
    "matter": "use particle nature, purity, and changes of state correctly",
    "cell": "connect the cell part with its function",
    "tissue": "identify the tissue by structure and function",
    "health": "connect cause, prevention, immunity, and treatment appropriately",
    "acid": "use indicators, pH, neutralisation, and salt formation",
    "metal": "connect properties, reactivity, extraction, and corrosion",
    "carbon": "use bonding, functional groups, and reactions of carbon compounds",
}


def normalize_pattern(text: str) -> str:
    pattern = re.sub(r"\d+(?:\.\d+)?", "{n}", text)
    pattern = re.sub(r"\s+", " ", pattern).strip().casefold()
    return pattern


def clean(value: object) -> str:
    return str(value or "").strip()


def class_num(value: object) -> str:
    raw = clean(value).upper()
    if raw in {"IX", "9", "CLASS 9"}:
        return "9"
    if raw in {"X", "10", "CLASS 10"}:
        return "10"
    return raw


def row_from_csv(index: int, row: dict[str, str]) -> dict:
    correct = clean(row.get("Correct Option")).upper()
    options = [
        {"identifier": letter, "content": clean(row.get(f"Option {letter}"))}
        for letter in "ABCD"
    ]
    correct_answer = clean(row.get("Correct Answer"))
    if correct in "ABCD" and correct_answer not in [option["content"] for option in options]:
        correct_answer = options["ABCD".index(correct)]["content"]
    cls = class_num(row.get("Class"))
    subject = clean(row.get("Subject"))
    return {
        "question_id": f"source-{index:05d}",
        "exam": f"NCERT Class {cls}",
        "class": cls,
        "subject": subject,
        "chapter": clean(row.get("Chapter")),
        "topic": clean(row.get("Topic")),
        "year": None,
        "difficulty": clean(row.get("Difficulty")).lower() or "medium",
        "type": "mcq",
        "question": clean(row.get("Question")),
        "options": options,
        "correct_options": [correct],
        "answer": correct,
        "correct_answer": correct_answer,
        "explanation": clean(row.get("Answer Explanation")),
    }


def load_existing() -> list[dict]:
    if SOURCE_CSV.exists():
        with SOURCE_CSV.open(newline="", encoding="utf-8-sig") as handle:
            return [row_from_csv(index, row) for index, row in enumerate(csv.DictReader(handle), start=1)]
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def keep_varied_existing(rows: list[dict]) -> list[dict]:
    kept: list[dict] = []
    pattern_counts: Counter[str] = Counter()
    subject_counts: Counter[str] = Counter()
    for row in rows:
        question = clean(row.get("question"))
        if question.startswith("For ") and "choose the correct statement" in question:
            continue
        subject = clean(row.get("subject"))
        if subject_counts[subject] >= SUBJECT_TARGET.get(subject, 0):
            continue
        pattern = normalize_pattern(question)
        if pattern_counts[pattern] >= PATTERN_CAP:
            continue
        pattern_counts[pattern] += 1
        subject_counts[subject] += 1
        kept.append(row)
    return kept


def topic_inventory(rows: list[dict]) -> list[dict]:
    by_topic: dict[tuple[str, str, str, str], list[str]] = defaultdict(list)
    for row in rows:
        key = (
            clean(row.get("class")),
            clean(row.get("subject")),
            clean(row.get("chapter")),
            clean(row.get("topic")),
        )
        answer = clean(row.get("correct_answer"))
        if answer and not re.fullmatch(r"[-+]?\d+(?:\.\d+)?(?:/\d+)?", answer):
            by_topic[key].append(answer)

    topics = []
    for (cls, subject, chapter, topic), facts in sorted(by_topic.items()):
        useful_facts = [fact for fact in dict.fromkeys(facts) if 4 <= len(fact) <= 120]
        topics.append(
            {
                "class": cls,
                "subject": subject,
                "chapter": chapter,
                "topic": topic,
                "facts": useful_facts or [fallback_fact(subject, chapter, topic)],
            }
        )
    return topics


def fallback_fact(subject: str, chapter: str, topic: str) -> str:
    method = method_hint(subject, chapter, topic)
    return f"{topic} is handled by using the key idea from {chapter}: {method}."


def method_hint(subject: str, chapter: str, topic: str) -> str:
    text = f"{chapter} {topic}".casefold()
    source = MATH_METHOD_WORDS if subject == "Maths" else SCIENCE_METHOD_WORDS
    for key, value in source.items():
        if key in text:
            return value
    if subject == "Maths":
        return "write the known information clearly and apply the correct formula or theorem"
    return "link the observation with the correct concept, cause, and result"


def option_set(topic: str, chapter: str, correct: str, subject: str, angle_index: int) -> list[str]:
    wrong_sets = [
        [
            f"It can be answered by memorising only the chapter name {chapter}.",
            f"It means the opposite of the standard idea of {topic}.",
            f"It is unrelated to the conditions given in the question.",
        ],
        [
            f"The final answer should be chosen before reading the data.",
            f"Only the largest number or longest word should be selected.",
            f"The topic is useful only for definitions and never for problem solving.",
        ],
        [
            f"All options become correct if the question belongs to {chapter}.",
            f"The diagram, data, or condition can be ignored.",
            f"The rule changes every time the numbers or wording changes.",
        ],
        [
            f"The safest method is to guess from familiar words.",
            f"One should use an unrelated formula from another chapter.",
            f"The answer is correct if it sounds scientific or mathematical.",
        ],
    ]
    options = [correct] + wrong_sets[angle_index % len(wrong_sets)]
    random.shuffle(options)
    return options


def explanation(question: str, correct: str, subject: str, chapter: str, topic: str) -> str:
    hint = method_hint(subject, chapter, topic)
    return (
        "Understanding the question:\n"
        f"- The question checks the topic \"{topic}\" from \"{chapter}\".\n\n"
        "Key idea:\n"
        f"- Use this idea: {hint}.\n\n"
        "Why the answer is correct:\n"
        f"- {correct}\n"
        "- The other options either ignore the given condition, use an unrelated idea, "
        "or describe a common misconception.\n\n"
        "Final answer:\n"
        f"- {correct}"
    )


def build_topic_question(topic_row: dict, angle_index: int, serial: int) -> dict:
    fact = topic_row["facts"][angle_index % len(topic_row["facts"])]
    cls = topic_row["class"]
    subject = topic_row["subject"]
    chapter = topic_row["chapter"]
    topic = topic_row["topic"]
    stem = ANGLE_STEMS[angle_index % len(ANGLE_STEMS)].format(chapter=chapter, topic=topic)
    if angle_index >= len(ANGLE_STEMS):
        label = SCENARIO_LABELS[(angle_index // len(ANGLE_STEMS)) % len(SCENARIO_LABELS)]
        stem = f"{stem} Use the {label} classroom situation."
    options = option_set(topic, chapter, fact, subject, angle_index)
    identifiers = "ABCD"
    correct_option = identifiers[options.index(fact)]
    return {
        "question_id": f"syllabus-balanced-2026-{serial:05d}",
        "exam": f"NCERT Class {cls}",
        "class": cls,
        "subject": subject,
        "chapter": chapter,
        "topic": topic,
        "year": None,
        "difficulty": ["easy", "medium", "hard"][angle_index % 3],
        "type": "mcq",
        "question": stem,
        "options": [
            {"identifier": identifier, "content": content}
            for identifier, content in zip(identifiers, options)
        ],
        "correct_options": [correct_option],
        "answer": correct_option,
        "correct_answer": fact,
        "explanation": explanation(stem, fact, subject, chapter, topic),
    }


def resequence(rows: list[dict]) -> list[dict]:
    for index, row in enumerate(rows, start=1):
        row["question_id"] = f"syllabus-balanced-2026-{index:05d}"
    return rows


def validate(rows: list[dict]) -> None:
    if len(rows) != TARGET_COUNT:
        raise ValueError(f"Expected {TARGET_COUNT}, got {len(rows)}")
    question_texts = [row["question"].strip().casefold() for row in rows]
    if len(set(question_texts)) != len(question_texts):
        raise ValueError("Duplicate question text found")
    ids = [row["question_id"] for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate question id found")
    for row in rows:
        options = [option["content"].strip() for option in row["options"]]
        if len(options) != 4 or len(set(options)) != 4:
            raise ValueError(f"Bad options for {row['question_id']}")
        if row["correct_answer"] not in options:
            raise ValueError(f"Correct answer missing in options for {row['question_id']}")
        if not row.get("explanation"):
            raise ValueError(f"Missing explanation for {row['question_id']}")


def write_csv(rows: list[dict]) -> None:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "S.No",
        "Class",
        "Subject",
        "Book/Stream",
        "Chapter",
        "Topic",
        "Difficulty",
        "Question",
        "Option A",
        "Option B",
        "Option C",
        "Option D",
        "Correct Option",
        "Correct Answer",
        "Answer Explanation",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, row in enumerate(rows, start=1):
            options = {option["identifier"]: option["content"] for option in row["options"]}
            writer.writerow(
                {
                    "S.No": index,
                    "Class": "IX" if row["class"] == "9" else "X",
                    "Subject": row["subject"],
                    "Book/Stream": row["subject"],
                    "Chapter": row["chapter"],
                    "Topic": row["topic"],
                    "Difficulty": row["difficulty"].title(),
                    "Question": row["question"],
                    "Option A": options["A"],
                    "Option B": options["B"],
                    "Option C": options["C"],
                    "Option D": options["D"],
                    "Correct Option": row["answer"],
                    "Correct Answer": row["correct_answer"],
                    "Answer Explanation": row["explanation"],
                }
            )


def main() -> None:
    random.seed(20260415)
    existing = load_existing()
    kept = keep_varied_existing(existing)
    topics = topic_inventory(existing)
    rows = list(kept)
    angle_by_topic: Counter[tuple[str, str, str, str]] = Counter()
    seen_questions = {row["question"].strip().casefold() for row in rows}
    topics_by_subject = {
        subject: [topic for topic in topics if topic["subject"] == subject]
        for subject in SUBJECT_TARGET
    }

    for subject, target in SUBJECT_TARGET.items():
        topic_index = 0
        subject_rows = [row for row in rows if row["subject"] == subject]
        while len(subject_rows) < target:
            subject_topics = topics_by_subject[subject]
            topic_row = subject_topics[topic_index % len(subject_topics)]
            key = (
                topic_row["class"],
                topic_row["subject"],
                topic_row["chapter"],
                topic_row["topic"],
            )
            angle = angle_by_topic[key]
            angle_by_topic[key] += 1
            candidate = build_topic_question(topic_row, angle, len(rows) + 1)
            question_key = candidate["question"].strip().casefold()
            if question_key not in seen_questions:
                rows.append(candidate)
                subject_rows.append(candidate)
                seen_questions.add(question_key)
            topic_index += 1

    rows = resequence(rows[:TARGET_COUNT])
    validate(rows)
    DATA_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(rows)

    patterns = Counter(normalize_pattern(row["question"]) for row in rows)
    print(f"wrote {len(rows)} questions")
    print(f"largest repeated normalized stem: {patterns.most_common(1)[0]}")
    print(f"csv: {OUT_CSV}")


if __name__ == "__main__":
    main()
