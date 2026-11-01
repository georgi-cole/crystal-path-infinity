#!/usr/bin/env python3
"""Review or apply the Crystal Path: Infinity GitHub planning setup.

Default: local dry run, no network. With --apply, use the existing authenticated
GitHub CLI session; credentials are never requested, read or printed by this code.
No app implementation, store deployment, collaborator grants or billing changes.
Existing repository visibility is verified against the plan and never changed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from validate_plan import PlanError, ROOT, TARGET_OWNER, TARGET_REPOSITORY, load_plan

REPO = f"{TARGET_OWNER}/{TARGET_REPOSITORY}"
API_BASE = f"repos/{REPO}"
MARKER_FILE = "planning/backlog.json"
STATE_FILE = ".bootstrap-state.json"
RECEIPT_FILE = ".bootstrap-receipt.json"
ROOT_FILES = {"README.md", "LICENSE", ".gitignore", ".editorconfig", "SECURITY.md", "CONTRIBUTING.md"}
DIRECTORIES = {"docs", "planning", "scripts", ".github"}
EXTENSIONS = {".md", ".json", ".py", ".yml", ".yaml", ".toml", ".txt", ".svg"}
SETTINGS = {
    "has_issues": True,
    "has_wiki": False,
    "allow_squash_merge": True,
    "allow_merge_commit": False,
    "allow_rebase_merge": False,
    "delete_branch_on_merge": True,
    "allow_auto_merge": False,
}


class BootstrapError(RuntimeError):
    pass


class ApiError(BootstrapError):
    def __init__(self, method: str, path: str, status: int | None):
        self.status = status
        super().__init__(f"GitHub {method} {path.split('?')[0]} failed"
                         + (f" (HTTP {status})." if status else "."))


class GitHub:
    def call(self, path: str, method: str = "GET", data: Any = None) -> Any:
        command = ["gh", "api", "--hostname", "github.com", "--method", method,
                   "-H", "Accept: application/vnd.github+json", path]
        if data is not None:
            command.extend(["--input", "-"])
        completed = subprocess.run(command, input=json.dumps(data) if data is not None else None,
                                   capture_output=True, text=True, check=False)
        if completed.returncode:
            match = re.search(r"HTTP\s+(\d{3})", completed.stderr)
            # Deliberately do not print raw gh output, headers, authentication or process environment.
            raise ApiError(method, path, int(match.group(1)) if match else None)
        if not completed.stdout.strip():
            return None
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise BootstrapError(f"GitHub returned unexpected JSON for {path.split('?')[0]}.") from error

    def pages(self, path: str) -> list[dict[str, Any]]:
        result = []
        delimiter = "&" if "?" in path else "?"
        for page in range(1, 1001):
            items = self.call(f"{path}{delimiter}per_page=100&page={page}")
            if not isinstance(items, list):
                raise BootstrapError("Expected a paginated array from GitHub.")
            result.extend(items)
            if len(items) < 100:
                return result
        raise BootstrapError("Unexpectedly large repository; refusing unbounded pagination.")


def git_blob_sha(content: str) -> str:
    raw = content.encode("utf-8")
    return hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()


def collect_files(root: Path) -> dict[str, str]:
    output: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        parts = relative.parts
        if not parts or parts[0] not in (ROOT_FILES | DIRECTORIES):
            continue
        if any(part in {"__pycache__", ".git", "node_modules"} for part in parts):
            continue
        if path.is_symlink():
            raise BootstrapError(f"Symlinks are not allowed in the planning upload: {relative}")
        if not path.is_file():
            continue
        if (len(parts) > 1 and relative.as_posix() != ".github/CODEOWNERS"
                and (path.suffix not in EXTENSIONS or path.name.startswith("."))):
            continue
        if path.name in {STATE_FILE, RECEIPT_FILE}:
            continue
        if path.stat().st_size > 1_000_000:
            raise BootstrapError(f"Planning file exceeds 1 MB: {relative}")
        try:
            output[relative.as_posix()] = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise BootstrapError(f"Planning file is not UTF-8 text: {relative}") from error
    if "README.md" not in output or MARKER_FILE not in output:
        raise BootstrapError("README.md and planning/backlog.json are required before bootstrap.")
    if sum(len(value.encode("utf-8")) for value in output.values()) > 5_000_000:
        raise BootstrapError("Planning upload exceeds the 5 MB safety limit.")
    return output


def write_local_json(root: Path, name: str, payload: Any) -> None:
    target = root / name
    temp = target.with_suffix(target.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(target)


def read_state(root: Path) -> dict[str, Any]:
    path = root / STATE_FILE
    if not path.exists():
        return {}
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
        return content if isinstance(content, dict) else {}
    except (OSError, json.JSONDecodeError) as error:
        raise BootstrapError("Local bootstrap state is unreadable; inspect it before resuming.") from error


def verify_repository(repo: dict[str, Any], expected_private: bool) -> None:
    if type(expected_private) is not bool:
        raise BootstrapError("Expected repository visibility must be an explicit boolean.")
    if (repo.get("full_name") != REPO or repo.get("owner", {}).get("login") != TARGET_OWNER
            or repo.get("fork") or repo.get("archived")):
        raise BootstrapError("Target must be the unarchived, non-fork repository " + REPO + ".")
    if repo.get("private") is not expected_private:
        visibility = "private" if expected_private else "public"
        raise BootstrapError(f"Target visibility must match the explicit plan: {visibility}. "
                             "This script never changes existing repository visibility.")


def head_and_tree(api: GitHub, branch: str) -> tuple[str, str, dict[str, dict[str, Any]]]:
    ref = api.call(f"{API_BASE}/git/ref/heads/{quote(branch, safe='')}")
    head = ref["object"]["sha"]
    commit = api.call(f"{API_BASE}/git/commits/{head}")
    tree_sha = commit["tree"]["sha"]
    tree = api.call(f"{API_BASE}/git/trees/{tree_sha}?recursive=1")
    if tree.get("truncated"):
        raise BootstrapError("Repository tree is truncated; refusing an incomplete ownership check.")
    return head, tree_sha, {entry["path"]: entry for entry in tree["tree"] if entry["type"] != "tree"}


def read_remote_text(api: GitHub, sha: str) -> str:
    blob = api.call(f"{API_BASE}/git/blobs/{sha}")
    if blob.get("encoding") != "base64":
        raise BootstrapError("Unexpected blob encoding while checking repository ownership.")
    try:
        return base64.b64decode(blob["content"]).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as error:
        raise BootstrapError("Remote planning marker is not valid UTF-8.") from error


def check_marker(api: GitHub, entries: dict[str, Any], plan: dict[str, Any]) -> bool:
    if MARKER_FILE not in entries:
        return False
    try:
        marker = json.loads(read_remote_text(api, entries[MARKER_FILE]["sha"]))
    except json.JSONDecodeError as error:
        raise BootstrapError("Remote planning marker is invalid JSON.") from error
    if not isinstance(marker, dict):
        raise BootstrapError("Remote planning marker is not a JSON object.")
    if marker.get("repository") != plan["repository"] or marker.get("source") != plan["source"]:
        raise BootstrapError("Existing repository marker does not match this product/source plan.")
    return True


def standard_readme(text: str, description: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines in [[f"# {TARGET_REPOSITORY}"], [f"# {TARGET_REPOSITORY}", description.strip()]]


def publish_files(api: GitHub, files: dict[str, str], initial_head: str, tree_sha: str,
                  entries: dict[str, Any], replace_initial_readme: bool) -> str:
    changes = []
    for path, content in files.items():
        previous = entries.get(path)
        if previous and previous.get("sha") == git_blob_sha(content) and previous.get("mode") == "100644":
            continue
        if previous and not (path == "README.md" and replace_initial_readme):
            raise BootstrapError(f"Remote file differs: {path}. Refusing to overwrite it; review changes in a PR.")
        changes.append({"path": path, "type": "blob", "mode": "100644", "content": content})
    if not changes:
        return initial_head
    tree = api.call(f"{API_BASE}/git/trees", "POST", {"base_tree": tree_sha, "tree": changes})
    commit = api.call(f"{API_BASE}/git/commits", "POST", {
        "message": "docs: initialize Crystal Path Infinity mobile plan and backlog",
        "tree": tree["sha"], "parents": [initial_head],
    })
    # Check again immediately before the fast-forward-only update. A later concurrent
    # commit also causes GitHub to reject this ref update, because it is not our parent.
    current = api.call(f"{API_BASE}/git/ref/heads/main")["object"]["sha"]
    if current != initial_head:
        raise BootstrapError("main moved during bootstrap; no branch was overwritten. Re-run after review.")
    api.call(f"{API_BASE}/git/refs/heads/main", "PATCH", {"sha": commit["sha"], "force": False})
    verified = api.call(f"{API_BASE}/git/ref/heads/main")["object"]["sha"]
    if verified != commit["sha"]:
        raise BootstrapError("Published commit could not be verified as main's current head.")
    return verified


def issue_marker(iid: str) -> str:
    return f"<!-- crystal-path-infinity:{iid} -->"


def index_issues(issues: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    found = {}
    for issue in issues:
        if "pull_request" in issue:
            continue
        markers = re.findall(r"<!-- crystal-path-infinity:(CPI-\d{3}) -->", issue.get("body") or "")
        title_ids = re.findall(r"^\[(CPI-\d{3})\]", issue.get("title") or "")
        if not markers and title_ids:
            raise BootstrapError(f"Issue #{issue['number']} uses {title_ids[0]} without our marker; inspect it manually.")
        if len(markers) > 1:
            raise BootstrapError(f"Issue #{issue['number']} has multiple planning markers.")
        if not markers:
            continue
        iid = markers[0]
        if iid in found:
            raise BootstrapError(f"Multiple GitHub issues claim {iid}; resolve duplication before resuming.")
        found[iid] = issue
    return found


def issue_labels(issue: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    available = {label["name"] for label in plan["labels"]}
    desired = [f"priority:{issue['priority']}", f"area:{issue['area']}", "type:task"]
    return list(dict.fromkeys(issue.get("labels", []) + [label for label in desired if label in available]))


def render_issue(issue: dict[str, Any], known: dict[str, dict[str, Any]]) -> str:
    dependencies = ", ".join(f"[#{known[iid]['number']} — {iid}]({known[iid]['html_url']})"
                             for iid in issue["depends_on"]) or "Няма предходни зависимости."
    return (f"{issue_marker(issue['id'])}\n\n{issue['body'].rstrip()}\n\n"
            f"## Планиране\n\nПриоритет: **{issue['priority']}** · Размер: **{issue['size']}**"
            f" · Етап: **{issue['milestone']}**\n\nЗависимости: {dependencies}\n\n"
            "Източник на плана: `planning/backlog.json`. Размерите са относителни, не обещание за срок.\n")


def apply_setup(root: Path, plan: dict[str, Any], files: dict[str, str], *, adopt_initial: bool = False,
                api: GitHub | None = None) -> dict[str, Any]:
    api = api or GitHub()
    receipt: dict[str, Any] = {"repository": REPO, "status": "in_progress", "created": [],
                             "verified": [], "warnings": [], "issues": {}, "pending": []}
    try:
        if api.call("user").get("login") != TARGET_OWNER:
            raise BootstrapError(f"The active gh account must be {TARGET_OWNER}; no changes were made.")
        state = read_state(root)
        created = False
        try:
            repo = api.call(API_BASE)
        except ApiError as error:
            if error.status != 404:
                raise
            # A 404 can also mean inaccessible. Authenticated ownership is checked above;
            # a conflicting existing name will be rejected rather than overwritten.
            repo = api.call("user/repos", "POST", {
                "name": TARGET_REPOSITORY, "description": plan["repository"]["description"],
                "private": plan["repository"]["private"], "auto_init": True,
                "has_issues": True, "has_wiki": False,
            })
            created = True
            receipt["created"].append("repository")
            state = {"repository": REPO, "repository_id": repo["id"], "created_by_bootstrap": True}
            write_local_json(root, STATE_FILE, state)
        verify_repository(repo, plan["repository"]["private"])
        branch = repo["default_branch"]
        try:
            head, tree_sha, entries = head_and_tree(api, branch)
        except ApiError as error:
            if error.status in {404, 409}:
                raise BootstrapError("Repository has no initial commit. Add its initial README in GitHub, "
                                     "then use --adopt-initial if it matches the documented empty scaffold.") from error
            raise
        marked = check_marker(api, entries, plan)
        owned_initial = (state.get("repository") == REPO and state.get("repository_id") == repo["id"]
                         and state.get("created_by_bootstrap") is True)
        initial_readme = (set(entries) == {"README.md"}
                          and standard_readme(read_remote_text(api, entries["README.md"]["sha"]),
                                              plan["repository"]["description"]))
        if not marked and not ((created or owned_initial or adopt_initial) and initial_readme):
            raise BootstrapError("Existing repository is not a matching marked plan or an untouched initial "
                                 "README scaffold. Refusing to overwrite it.")
        if branch != "main":
            # No branch deletion; a new main points at the exact verified initial commit.
            try:
                main_head = api.call(f"{API_BASE}/git/ref/heads/main")["object"]["sha"]
                if main_head != head:
                    raise BootstrapError("Existing main differs from the default branch; manual review required.")
            except ApiError as error:
                if error.status != 404:
                    raise
                api.call(f"{API_BASE}/git/refs", "POST", {"ref": "refs/heads/main", "sha": head})
            api.call(API_BASE, "PATCH", {"default_branch": "main"})
        receipt["commit"] = publish_files(api, files, head, tree_sha, entries, not marked and initial_readme)
        receipt["verified"].append("planning_commit_on_main")
        # Only routine settings for this verified planning repository are changed.
        api.call(API_BASE, "PATCH", SETTINGS)
        actual = api.call(API_BASE)
        verify_repository(actual, plan["repository"]["private"])
        if actual.get("default_branch") != "main" or any(actual.get(key) != value for key, value in SETTINGS.items()):
            raise BootstrapError("One or more requested repository settings did not verify.")
        receipt["verified"].append("repository_settings")
        try:
            permissions = {"default_workflow_permissions": "read", "can_approve_pull_request_reviews": False}
            api.call(f"{API_BASE}/actions/permissions/workflow", "PUT", permissions)
            actual_permissions = api.call(f"{API_BASE}/actions/permissions/workflow")
            if any(actual_permissions.get(key) != value for key, value in permissions.items()):
                raise BootstrapError("Actions permissions could not be verified.")
            receipt["verified"].append("read_only_actions_permissions")
        except ApiError as error:
            if error.status not in {403, 404, 422}:
                raise
            receipt["pending"].append("Actions read-only permissions: apply/verify in GitHub Settings; API unavailable.")
        existing_labels = {label["name"]: label for label in api.pages(f"{API_BASE}/labels")}
        for label in plan["labels"]:
            if label["name"] not in existing_labels:
                item = api.call(f"{API_BASE}/labels", "POST", label)
                if item.get("name") != label["name"]:
                    raise BootstrapError("Label creation did not return the expected label.")
                receipt["created"].append("label:" + label["name"])
            elif (existing_labels[label["name"]].get("color", "").lower() != label["color"].lower()
                  or existing_labels[label["name"]].get("description") != label["description"]):
                receipt["warnings"].append("Preserved existing label metadata: " + label["name"])
        existing_milestones = api.pages(f"{API_BASE}/milestones?state=all")
        milestone_numbers = {}
        for milestone in plan["milestones"]:
            marker = f"<!-- crystal-path-infinity:milestone:{milestone['id']} -->"
            matches = [item for item in existing_milestones if marker in (item.get("description") or "")]
            if len(matches) > 1:
                raise BootstrapError(f"Duplicate milestones for {milestone['id']}.")
            if not matches:
                if any(item["title"] == milestone["title"] for item in existing_milestones):
                    raise BootstrapError(f"Unmarked milestone title collision: {milestone['title']}.")
                matches = [api.call(f"{API_BASE}/milestones", "POST", {
                    "title": milestone["title"], "description": marker + "\n\n" + milestone["description"],
                })]
                receipt["created"].append("milestone:" + milestone["id"])
            milestone_numbers[milestone["id"]] = matches[0]["number"]
        known = index_issues(api.pages(f"{API_BASE}/issues?state=all"))
        for issue in plan["issues"]:
            iid = issue["id"]
            if iid not in known:
                item = api.call(f"{API_BASE}/issues", "POST", {
                    "title": f"[{iid}] {issue['title']}", "body": render_issue(issue, known),
                    "labels": issue_labels(issue, plan), "milestone": milestone_numbers[issue["milestone"]],
                })
                if issue_marker(iid) not in (item.get("body") or "") or not item.get("html_url"):
                    raise BootstrapError(f"{iid}: creation response could not be verified.")
                known[iid] = item
                receipt["created"].append("issue:" + iid)
            receipt["issues"][iid] = {"number": known[iid]["number"], "url": known[iid]["html_url"],
                                       "state": known[iid]["state"]}
        verified_issues = index_issues(api.pages(f"{API_BASE}/issues?state=all"))
        if any(iid not in verified_issues for iid in receipt["issues"]):
            raise BootstrapError("Some planned issues were absent from final readback.")
        receipt["verified"].append(f"all_{len(plan['issues'])}_issues_present")
        receipt["pending"].append("Branch protection/ruleset: configure after CI is available and plan support is verified.")
        receipt["repository_url"] = actual["html_url"]
        receipt["status"] = "complete_with_pending_settings" if receipt["pending"] else "complete"
        write_local_json(root, RECEIPT_FILE, receipt)
        return receipt
    except (BootstrapError, OSError, KeyError, TypeError) as error:
        receipt["status"] = "partial_or_blocked"
        receipt["error"] = str(error) if isinstance(error, BootstrapError) else type(error).__name__
        write_local_json(root, RECEIPT_FILE, receipt)
        raise BootstrapError(receipt["error"] + f" Progress is recorded in {RECEIPT_FILE}; rerun safely after fixing access/conflicts.") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Perform the reviewed GitHub mutations using gh.")
    parser.add_argument("--adopt-initial", action="store_true", help="Allow only the target matching the manifest visibility and containing the standard initial README.")
    args = parser.parse_args(argv)
    try:
        plan = load_plan(ROOT / MARKER_FILE)
        files = collect_files(ROOT)
        if not args.apply:
            print(json.dumps({
                "mode": "dry_run", "network_calls": 0, "repository": REPO,
                "visibility": "private" if plan["repository"]["private"] else "public",
                "files": sorted(files), "milestones": [item["id"] for item in plan["milestones"]],
                "labels": [item["name"] for item in plan["labels"]],
                "issues": [item["id"] for item in plan["issues"]], "settings": SETTINGS,
                "actions_permissions": "read; workflow PR approvals disabled",
                "pending": ["Branch protection requires supported plan and a passing CI context."],
                "apply_command": "python3 scripts/bootstrap_github.py --apply",
                "note": "No repository, commit, label, milestone or issue has been created by this dry run.",
            }, indent=2, ensure_ascii=False))
            return 0
        if shutil.which("gh") is None:
            raise BootstrapError("GitHub CLI (gh) is required for --apply. Dry run does not require it.")
        result = apply_setup(ROOT, plan, files, adopt_initial=args.adopt_initial)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (BootstrapError, PlanError) as error:
        print(f"Bootstrap stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
