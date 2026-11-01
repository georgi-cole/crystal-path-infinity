"""Network-free regression tests for the plan/bootstrap safety boundaries."""

from __future__ import annotations

import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import bootstrap_github as bootstrap
from validate_plan import PlanError, validate_plan


def example_plan() -> dict:
    return {
        "schema_version": 1,
        "source": {"repository": "georgi-cole/bbmobilenew-source", "commit": "a" * 40},
        "repository": {"owner": "georgi-cole", "name": "crystal-path-infinity", "private": False,
                       "description": "Standalone mobile planning repository."},
        "milestones": [{"id": "M0", "title": "Foundation", "description": "Validated product contract."}],
        "labels": [{"name": "priority:P0", "color": "B60205", "description": "Required before release."}],
        "issues": [{"id": "CPI-001", "title": "Freeze rules", "priority": "P0", "area": "foundation",
                    "size": "S", "milestone": "M0", "depends_on": [],
                    "body": "## Scope\n\nRecord all rules.\n\n## Acceptance\n\n- [ ] Specify boundaries and expected behavior."
                            "\n\n## Validation\n\nReview the examples against the source."}],
    }


class RejectAllApi:
    def call(self, *args, **kwargs):
        raise AssertionError("No GitHub operation should happen before this guard.")


class PlanTests(unittest.TestCase):
    def test_forward_dependencies_are_rejected(self):
        plan = example_plan()
        issue = copy.deepcopy(plan["issues"][0])
        issue["id"] = "CPI-002"
        plan["issues"].append(issue)
        plan["issues"][0]["depends_on"] = ["CPI-002"]
        with self.assertRaisesRegex(PlanError, "earlier"):
            validate_plan(plan)

    def test_exact_target_is_required(self):
        for field, value in (("owner", "someone-else"), ("name", "other-game")):
            plan = example_plan()
            plan["repository"][field] = value
            with self.assertRaises(PlanError):
                validate_plan(plan)

    def test_visibility_requires_a_real_boolean(self):
        for invalid in (None, 0, 1, "true", "false", []):
            with self.subTest(private=invalid):
                plan = example_plan()
                plan["repository"]["private"] = invalid
                with self.assertRaisesRegex(PlanError, "explicit boolean"):
                    validate_plan(plan)

    def test_default_dry_run_never_calls_gh(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "planning").mkdir()
            (root / "README.md").write_text("# Planning\n", encoding="utf-8")
            for private in (False, True):
                with self.subTest(private=private):
                    plan = example_plan()
                    plan["repository"]["private"] = private
                    (root / "planning/backlog.json").write_text(json.dumps(plan), encoding="utf-8")
                    with patch.object(bootstrap, "ROOT", root), patch.object(bootstrap.subprocess, "run") as run:
                        output = io.StringIO()
                        with redirect_stdout(output):
                            self.assertEqual(bootstrap.main([]), 0)
                        run.assert_not_called()
                        receipt = json.loads(output.getvalue())
                        self.assertEqual(receipt["network_calls"], 0)
                        self.assertEqual(receipt["mode"], "dry_run")
                        self.assertEqual(receipt["visibility"], "private" if private else "public")


class BootstrapGuards(unittest.TestCase):
    def test_actual_visibility_matches_explicit_plan(self):
        for private in (False, True):
            with self.subTest(private=private):
                repo = {"full_name": bootstrap.REPO, "owner": {"login": "georgi-cole"},
                        "private": private, "fork": False, "archived": False}
                bootstrap.verify_repository(repo, private)

    def test_wrong_actual_visibility_stops_before_remote_mutations(self):
        class FakeApi:
            def __init__(self, actual_private):
                self.actual_private = actual_private
                self.calls = []

            def call(self, path, method="GET", data=None):
                self.calls.append((path, method))
                if path == "user":
                    return {"login": "georgi-cole"}
                if path == bootstrap.API_BASE:
                    return {"full_name": bootstrap.REPO, "owner": {"login": "georgi-cole"},
                            "private": self.actual_private, "fork": False, "archived": False}
                raise AssertionError(path)

        for private in (False, True):
            with self.subTest(private=private), tempfile.TemporaryDirectory() as directory:
                plan = example_plan()
                plan["repository"]["private"] = private
                api = FakeApi(not private)
                with self.assertRaisesRegex(bootstrap.BootstrapError, "visibility must match"):
                    bootstrap.apply_setup(Path(directory), plan, {}, api=api)
                self.assertTrue(all(method == "GET" for _, method in api.calls))

    def test_new_repository_creation_uses_planned_visibility(self):
        class FakeApi:
            def __init__(self):
                self.creation = None

            def call(self, path, method="GET", data=None):
                if path == "user":
                    return {"login": "georgi-cole"}
                if path == bootstrap.API_BASE and method == "GET":
                    raise bootstrap.ApiError(method, path, 404)
                if path == "user/repos" and method == "POST":
                    self.creation = data
                    return {"id": 1, "full_name": bootstrap.REPO, "owner": {"login": "georgi-cole"},
                            "private": data["private"], "fork": False, "archived": False,
                            "default_branch": "main"}
                raise AssertionError(path)

        for private in (False, True):
            with self.subTest(private=private), tempfile.TemporaryDirectory() as directory:
                plan = example_plan()
                plan["repository"]["private"] = private
                api = FakeApi()
                with patch.object(bootstrap, "head_and_tree", side_effect=bootstrap.BootstrapError("Stop after creation")):
                    with self.assertRaisesRegex(bootstrap.BootstrapError, "Stop after creation"):
                        bootstrap.apply_setup(Path(directory), plan, {}, api=api)
                self.assertIs(api.creation["private"], private)

    def test_duplicate_issue_identity_is_rejected(self):
        body = bootstrap.issue_marker("CPI-001")
        issues = [{"number": 1, "title": "First", "body": body},
                  {"number": 2, "title": "Second", "body": body}]
        with self.assertRaisesRegex(bootstrap.BootstrapError, "Multiple"):
            bootstrap.index_issues(issues)

    def test_unmarked_title_is_not_claimed_as_ours(self):
        with self.assertRaisesRegex(bootstrap.BootstrapError, "without our marker"):
            bootstrap.index_issues([{"number": 5, "title": "[CPI-001] User issue", "body": "User text."}])

    def test_existing_remote_edit_is_not_overwritten(self):
        with self.assertRaisesRegex(bootstrap.BootstrapError, "Refusing to overwrite"):
            bootstrap.publish_files(RejectAllApi(), {"docs/PLAN.md": "New content"}, "head", "tree",
                                    {"docs/PLAN.md": {"sha": "different", "mode": "100644"}}, False)

    def test_concurrent_head_move_never_updates_ref(self):
        class FakeApi:
            def __init__(self):
                self.mutations = []

            def call(self, path, method="GET", data=None):
                if method != "GET":
                    self.mutations.append((path, method))
                if path.endswith("/git/trees"):
                    return {"sha": "new-tree"}
                if path.endswith("/git/commits"):
                    return {"sha": "new-commit"}
                if path.endswith("/git/ref/heads/main"):
                    return {"object": {"sha": "another-commit"}}
                raise AssertionError(path)

        api = FakeApi()
        with self.assertRaisesRegex(bootstrap.BootstrapError, "main moved"):
            bootstrap.publish_files(api, {"docs/PLAN.md": "Plan"}, "old-head", "old-tree", {}, False)
        self.assertFalse(any("/refs/" in path for path, _ in api.mutations))

    def test_idempotent_commit_does_not_make_api_calls(self):
        content = "# Same plan\n"
        result = bootstrap.publish_files(
            RejectAllApi(), {"README.md": content}, "current-head", "tree",
            {"README.md": {"sha": bootstrap.git_blob_sha(content), "mode": "100644"}}, False,
        )
        self.assertEqual(result, "current-head")

    def test_dependency_uses_real_issue_number(self):
        issue = example_plan()["issues"][0]
        issue["id"] = "CPI-002"
        issue["depends_on"] = ["CPI-001"]
        body = bootstrap.render_issue(issue, {"CPI-001": {"number": 42, "html_url": "https://github.com/a/b/issues/42"}})
        self.assertIn("[#42 — CPI-001](https://github.com/a/b/issues/42)", body)
        self.assertIn(bootstrap.issue_marker("CPI-002"), body)


if __name__ == "__main__":
    unittest.main()
