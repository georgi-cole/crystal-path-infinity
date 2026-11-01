#!/usr/bin/env python3
"""Validate the planning manifest without dependencies or network access."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TARGET_OWNER = "georgi-cole"
TARGET_REPOSITORY = "crystal-path-infinity"


class PlanError(ValueError):
    """A plan cannot safely be consumed."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise PlanError(message)


def nonblank(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_plan(plan: Any) -> dict[str, Any]:
    require(isinstance(plan, dict), "The manifest must be a JSON object.")
    require(plan.get("schema_version") == 1, "schema_version must be 1.")
    repo = plan.get("repository", {})
    require(isinstance(repo, dict), "repository must be an object.")
    require(repo.get("owner") == TARGET_OWNER, "Unexpected repository owner.")
    require(repo.get("name") == TARGET_REPOSITORY, "Unexpected repository name.")
    require(type(repo.get("private")) is bool, "repository.private must be an explicit boolean.")
    require(nonblank(repo.get("description")), "Repository description is required.")
    source = plan.get("source", {})
    require(isinstance(source, dict), "source must be an object.")
    require(
        source.get("repository") == "georgi-cole/bbmobilenew-source",
        "Unexpected source repository.",
    )
    require(
        isinstance(source.get("commit"), str)
        and re.fullmatch(r"[0-9a-f]{40}", source["commit"]) is not None,
        "source.commit must be a pinned, full Git commit SHA.",
    )
    milestones = plan.get("milestones")
    require(isinstance(milestones, list) and bool(milestones), "milestones is required.")
    milestone_ids: set[str] = set()
    milestone_titles: set[str] = set()
    for milestone in milestones:
        require(isinstance(milestone, dict), "Each milestone must be an object.")
        mid = milestone.get("id")
        require(isinstance(mid, str) and re.fullmatch(r"M\d+", mid) is not None,
                "Invalid milestone ID.")
        require(mid not in milestone_ids, f"Duplicate milestone ID: {mid}.")
        require(nonblank(milestone.get("title")), f"{mid}: title is required.")
        require(milestone["title"] not in milestone_titles,
                f"Duplicate milestone title: {milestone['title']}.")
        require(nonblank(milestone.get("description")), f"{mid}: description is required.")
        milestone_ids.add(mid)
        milestone_titles.add(milestone["title"])
    labels = plan.get("labels")
    require(isinstance(labels, list), "labels must be an array.")
    label_names: set[str] = set()
    for label in labels:
        require(isinstance(label, dict), "Each label must be an object.")
        name = label.get("name")
        require(nonblank(name), "Each label needs a name.")
        require(name not in label_names, f"Duplicate label: {name}.")
        require(isinstance(label.get("color"), str)
                and re.fullmatch(r"[0-9A-Fa-f]{6}", label["color"]) is not None,
                f"{name}: color must be a six-character hex value without #.")
        require(nonblank(label.get("description")), f"{name}: description is required.")
        require(len(label["description"]) <= 100, f"{name}: label description exceeds 100 characters.")
        label_names.add(name)
    issues = plan.get("issues")
    require(isinstance(issues, list) and bool(issues), "issues is required.")
    positions: dict[str, int] = {}
    for index, issue in enumerate(issues):
        require(isinstance(issue, dict), "Each issue must be an object.")
        iid = issue.get("id")
        require(isinstance(iid, str) and re.fullmatch(r"CPI-\d{3}", iid) is not None,
                "Issue IDs must use CPI-001 format.")
        require(iid not in positions, f"Duplicate issue ID: {iid}.")
        positions[iid] = index
        require(nonblank(issue.get("title")), f"{iid}: title is required.")
        require(len(issue["title"]) < 230, f"{iid}: title is too long for GitHub.")
        require(isinstance(issue.get("priority"), str) and issue["priority"] in {"P0", "P1", "P2"},
                f"{iid}: invalid priority.")
        require(nonblank(issue.get("area")), f"{iid}: area is required.")
        require(isinstance(issue.get("size"), str) and issue["size"] in {"XS", "S", "M", "L", "XL"},
                f"{iid}: invalid size.")
        require(isinstance(issue.get("milestone"), str) and issue["milestone"] in milestone_ids,
                f"{iid}: unknown milestone.")
        require(isinstance(issue.get("depends_on"), list), f"{iid}: depends_on must be an array.")
        require(all(isinstance(dep, str) for dep in issue["depends_on"]),
                f"{iid}: dependency IDs must be strings.")
        require(len(issue["depends_on"]) == len(set(issue["depends_on"])),
                f"{iid}: duplicate dependencies.")
        require(nonblank(issue.get("body")) and len(issue["body"].strip()) >= 100,
                f"{iid}: provide a substantive issue body with acceptance and validation criteria.")
        require(len(issue["body"]) < 60000, f"{iid}: body is too long for GitHub.")
        if "labels" in issue:
            require(isinstance(issue["labels"], list), f"{iid}: labels must be an array.")
            require(all(isinstance(label, str) and label in label_names for label in issue["labels"]),
                    f"{iid}: unknown explicit label.")
    # Earlier dependencies enforce a topological order and rule out cycles.
    for issue in issues:
        iid = issue["id"]
        for dependency in issue["depends_on"]:
            require(dependency in positions, f"{iid}: unknown dependency {dependency}.")
            require(positions[dependency] < positions[iid],
                    f"{iid}: {dependency} must appear earlier (forward/cyclic dependency).")
    return plan


def load_plan(path: Path) -> dict[str, Any]:
    try:
        return validate_plan(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        raise PlanError(f"Cannot read valid JSON manifest: {path}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", nargs="?", type=Path, default=ROOT / "planning/backlog.json")
    args = parser.parse_args()
    try:
        plan = load_plan(args.manifest)
    except PlanError as error:
        parser.exit(1, f"Plan validation failed: {error}\n")
    print(f"Plan valid: {len(plan['issues'])} issues, {len(plan['milestones'])} milestones, "
          f"{len(plan['labels'])} labels; dependencies are ordered and acyclic.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
