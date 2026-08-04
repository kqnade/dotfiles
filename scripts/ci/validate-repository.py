#!/usr/bin/env python3

"""Validate repository-wide invariants enforced by CI."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def tracked_files() -> list[Path]:
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    )
    return [
        ROOT / name.decode()
        for name in output.split(b"\0")
        if name and (ROOT / name.decode()).is_file()
    ]


def strip_json_comments(text: str) -> str:
    output: list[str] = []
    index = 0
    in_string = False
    escaped = False
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""

        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            output.append(char)
            index += 1
        elif char == "/" and next_char == "/":
            index += 2
            while index < len(text) and text[index] != "\n":
                index += 1
        elif char == "/" and next_char == "*":
            end = text.find("*/", index + 2)
            if end == -1:
                fail("unterminated block comment in JSONC")
            output.append("\n" * text[index : end + 2].count("\n"))
            index = end + 2
        else:
            output.append(char)
            index += 1
    return "".join(output)


with tempfile.TemporaryDirectory() as temp_dir:
    fake_home = Path(temp_dir) / "home"
    fake_bin = Path(temp_dir) / "bin"
    fake_home.mkdir()
    fake_bin.mkdir()
    codex_stub = fake_bin / "codex"
    codex_stub.write_text("#!/bin/sh\nexit 0\n")
    codex_stub.chmod(0o755)
    herdr_stub = fake_bin / "herdr"
    herdr_stub.write_text(
        "#!/bin/sh\n"
        'test "$1 $2 $3" = "integration install codex" || exit 1\n'
        'test -d "$HOME/.codex" || exit 42\n'
    )
    herdr_stub.chmod(0o755)
    configure_env = dict(os.environ)
    configure_env.update(
        HOME=str(fake_home),
        PATH=f"{fake_bin}:/usr/bin:/bin",
    )
    configure_result = subprocess.run(
        ["bash", str(ROOT / "scripts/configure-herdr.sh")],
        cwd=ROOT,
        env=configure_env,
        check=False,
    )
    if configure_result.returncode != 0:
        fail("Herdr setup must initialize Codex's config directory")


claude_repository_guard = (
    ROOT / "dot_claude/hooks/executable_authorize-repository.sh"
)


def run_claude_repository_guard(
    repository: Path, event_name: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(claude_repository_guard)],
        cwd=repository,
        input=json.dumps(
            {
                "cwd": str(repository),
                "hook_event_name": event_name,
                "prompt": "test",
            }
        ),
        text=True,
        capture_output=True,
        check=False,
    )


def create_test_repository(
    parent: Path, name: str, remote_url: str | None
) -> Path:
    repository = parent / name
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(repository)],
        check=True,
    )
    if remote_url is not None:
        subprocess.run(
            [
                "git",
                "-C",
                str(repository),
                "config",
                "remote.origin.url",
                remote_url,
            ],
            check=True,
        )
    return repository


with tempfile.TemporaryDirectory() as temp_dir:
    test_root = Path(temp_dir)
    allowed_repository = create_test_repository(
        test_root,
        "allowed-repository",
        "git@github.com:livesense-inc/example.git",
    )
    allowed_prompt = run_claude_repository_guard(
        allowed_repository, "UserPromptSubmit"
    )
    if allowed_prompt.returncode != 0:
        fail("Claude must be available in livesense-inc repositories")

    jobtalk_repository = create_test_repository(
        test_root,
        "jobtalk-repository",
        "https://github.com/jobtalk/example.git",
    )
    jobtalk_prompt = run_claude_repository_guard(
        jobtalk_repository, "UserPromptSubmit"
    )
    if jobtalk_prompt.returncode != 0:
        fail("Claude must be available in jobtalk repositories")

    livesense_https_repository = create_test_repository(
        test_root,
        "livesense-https-repository",
        "https://github.com/livesense-inc/example.git",
    )
    livesense_https_prompt = run_claude_repository_guard(
        livesense_https_repository, "UserPromptSubmit"
    )
    if livesense_https_prompt.returncode != 0:
        fail("Claude repository authorization must support GitHub HTTPS remotes")

    jobtalk_ssh_repository = create_test_repository(
        test_root,
        "jobtalk-ssh-repository",
        "git@github.com:jobtalk/example.git",
    )
    jobtalk_ssh_prompt = run_claude_repository_guard(
        jobtalk_ssh_repository, "UserPromptSubmit"
    )
    if jobtalk_ssh_prompt.returncode != 0:
        fail("Claude repository authorization must support GitHub SSH remotes")

    allowed_tool = run_claude_repository_guard(
        allowed_repository, "PreToolUse"
    )
    if allowed_tool.returncode != 0:
        fail("Claude tools must be available in authorized repositories")

    denied_repositories = {
        "unapproved owner": create_test_repository(
            test_root,
            "unapproved-owner",
            "git@github.com:kqnade/dotfiles.git",
        ),
        "misleading repository name": create_test_repository(
            test_root,
            "misleading-name",
            "git@github.com:someone-else/jobtalk.git",
        ),
        "missing origin": create_test_repository(
            test_root,
            "missing-origin",
            None,
        ),
    }
    non_repository = test_root / "not-a-repository"
    non_repository.mkdir()
    denied_repositories["non-Git directory"] = non_repository

    for description, repository in denied_repositories.items():
        denied_prompt = run_claude_repository_guard(
            repository, "UserPromptSubmit"
        )
        if denied_prompt.returncode != 2:
            fail(f"Claude must reject {description}")
        if "authorized only" not in denied_prompt.stderr:
            fail(f"Claude rejection must explain its repository boundary: {description}")

    denied_tool = run_claude_repository_guard(
        denied_repositories["unapproved owner"], "PreToolUse"
    )
    if denied_tool.returncode != 2:
        fail("Claude tools must be blocked in unauthorized repositories")

    launcher_home = test_root / "launcher-home"
    launcher_hooks = launcher_home / ".claude/hooks"
    launcher_hooks.mkdir(parents=True)
    launcher_guard = launcher_hooks / "authorize-repository.sh"
    launcher_guard.write_bytes(claude_repository_guard.read_bytes())
    launcher_guard.chmod(0o755)
    launcher_bin = test_root / "launcher-bin"
    launcher_bin.mkdir()
    launcher_stub = launcher_bin / "claude"
    launcher_stub.write_text("#!/bin/sh\nexit 0\n")
    launcher_stub.chmod(0o755)
    launcher_env = dict(os.environ)
    launcher_env.update(
        HOME=str(launcher_home),
        PATH=f"{launcher_bin}:/usr/bin:/bin",
        GITHUB_PERSONAL_ACCESS_TOKEN="test-token",
    )
    unauthorized_launch = subprocess.run(
        [
            "zsh",
            "-c",
            f"source {ROOT / 'dot_config/zsh/functions/claude.zsh'}; claude --version",
        ],
        cwd=denied_repositories["unapproved owner"],
        env=launcher_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if unauthorized_launch.returncode == 0:
        fail("Claude launcher must reject unauthorized repositories before startup")

    authorized_launch = subprocess.run(
        [
            "zsh",
            "-c",
            f"source {ROOT / 'dot_config/zsh/functions/claude.zsh'}; claude --version",
        ],
        cwd=allowed_repository,
        env=launcher_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if authorized_launch.returncode != 0:
        fail("Claude launcher must start in authorized repositories")


removed_paths = (
    ".chezmoitemplates/ai-voice.md",
    "Brew" + "file",
    "Dnffile",
    "scoop" + "file.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1.tmpl",
    "run_onchange_install-" + "scoop-packages.ps1.tmpl",
    "run_onchange_setup-" + "msys2.ps1.tmpl",
    "run_onchange_setup-xdg-env.ps1.tmpl",
    "docs/setup-" + "windows.md",
    "scripts/install-linux.sh",
    "dot_config/project-maker",
    "dot_config/zsh/" + "agent-mail.zsh",
    "dot_claude/agents/frontend-designer.md",
    "dot_claude/CLAUDE.md.tmpl",
    "dot_claude/hooks/executable_auto-test.sh",
    "dot_claude/skills/catchup/SKILL.md",
    "dot_codex/AGENTS.md.tmpl",
    "dot_config/opencode/AGENTS.md.tmpl",
    "dot_config/opencode/plugins/claude-rules.ts",
    "dot_kimi-code/AGENTS.md.tmpl",
    "dot_kimi-code/mcp.json",
    "run_onchange_before_install-" + "mcp-agent-mail.sh.tmpl",
    "run_onchange_before_install-" + "mcp-agent-mail.ps1.tmpl",
    "run_onchange_after_configure-" + "agent-mail.sh.tmpl",
    "run_onchange_after_configure-" + "agent-mail.ps1.tmpl",
)
for relative in removed_paths:
    if (ROOT / relative).exists():
        fail(f"removed integration still exists: {relative}")

for required in (
    "install.sh",
    "mise.toml",
    "mise.lock",
    "scripts/lib/runtime.sh",
    "dot_config/nvim/init.lua",
    "dot_config/nvim/lua/core/keymaps.lua",
    "dot_config/nvim/lua/modules/configs/editor/skkeleton.lua",
    "dot_local/bin/executable_op",
    "dot_local/bin/executable_ssh",
    "dot_local/bin/executable_ssh-add",
    "dot_local/bin/executable_yaskkserv2-serve.tmpl",
    "dot_config/mise/conf.d/wsl.toml.tmpl",
):
    if not (ROOT / required).is_file():
        fail(f"required v2 file is missing: {required}")

for todo in (ROOT / ".dev/todo").glob("*.md"):
    if todo.name == "README.md":
        continue
    todo_text = todo.read_text()
    todo_items = re.findall(r"^- \[([ xX])\]", todo_text, re.MULTILINE)
    if re.search(r"^- 状態:.*完了", todo_text, re.MULTILINE) or (
        todo_items and all(item.casefold() == "x" for item in todo_items)
    ):
        fail(f"completed work item must be removed from .dev/todo: {todo.name}")

for required in (".dev/memory/README.md",):
    if not (ROOT / required).is_file():
        fail(f"context and memory boundary file is missing: {required}")

claude_rules = list((ROOT / "dot_claude/rules").glob("*.md"))
if claude_rules:
    fail(f"legacy Claude rules remain: {[path.name for path in claude_rules]}")

claude_agents = list((ROOT / "dot_claude/agents").glob("*.md"))
if claude_agents:
    fail(f"legacy Claude agents remain: {[path.name for path in claude_agents]}")

expected_agent_skills = {
    "assumption-pruning",
    "context-handoff",
    "evidence-review",
    "herdr",
    "peer-consultation",
    "prose-proofreading",
    "security-audit",
    "test-driven-development",
    "using-workflow-skills",
}

agent_skills_root = ROOT / "dot_agents/skills"
agent_skills = {path.name for path in agent_skills_root.iterdir() if path.is_dir()}
if agent_skills != expected_agent_skills:
    fail(
        "canonical agent skill set differs from the reviewed set: "
        f"expected {sorted(expected_agent_skills)}, got {sorted(agent_skills)}"
    )

combined_skill_description_size = 0
for skill_name in expected_agent_skills:
    skill_file = agent_skills_root / skill_name / "SKILL.md"
    if not skill_file.is_file():
        fail(f"canonical agent skill is missing SKILL.md: {skill_name}")
    skill_text = skill_file.read_text()
    if not skill_text.startswith("---\n"):
        fail(f"agent skill frontmatter is missing: {skill_name}")
    skill_parts = skill_text.split("---\n", 2)
    if len(skill_parts) != 3:
        fail(f"agent skill frontmatter is not closed: {skill_name}")
    skill_frontmatter = skill_parts[1]
    skill_frontmatter_keys = re.findall(
        r"^([A-Za-z0-9_-]+):", skill_frontmatter, re.MULTILINE
    )
    if skill_frontmatter_keys != ["name", "description"]:
        fail(
            "agent skill frontmatter must contain only name and description "
            f"in that order: {skill_name} has {skill_frontmatter_keys}"
        )
    if not re.search(rf"^name: {re.escape(skill_name)}$", skill_text, re.MULTILINE):
        fail(f"agent skill name must match its directory: {skill_name}")
    if not re.search(r"^description:", skill_text, re.MULTILINE):
        fail(f"agent skill description is missing: {skill_name}")
    skill_description = skill_frontmatter.partition("description:")[2].strip()
    if not skill_description:
        fail(f"agent skill description is empty: {skill_name}")
    if len(skill_description) > 1024:
        fail(f"agent skill description exceeds 1024 characters: {skill_name}")
    combined_skill_description_size += len(skill_description)

if combined_skill_description_size > 8000:
    fail(
        "combined agent skill descriptions exceed the Codex discovery budget: "
        f"{combined_skill_description_size} characters"
    )

claude_skill_links = {path.name for path in (ROOT / "dot_claude/skills").iterdir()}
expected_claude_skill_links = {
    f"symlink_{skill_name}" for skill_name in expected_agent_skills
}
if claude_skill_links != expected_claude_skill_links:
    fail(
        "Claude skill links differ from the canonical agent skill set: "
        f"expected {sorted(expected_claude_skill_links)}, "
        f"got {sorted(claude_skill_links)}"
    )

for skill_name in expected_agent_skills:
    link_source = ROOT / "dot_claude/skills" / f"symlink_{skill_name}"
    expected_target = f"../../.agents/skills/{skill_name}\n"
    if link_source.read_text() != expected_target:
        fail(f"Claude skill link must target the canonical skill: {skill_name}")

tdd_skill = (agent_skills_root / "test-driven-development/SKILL.md").read_text()
for required_tdd_phrase in (
    "test list",
    "exactly one",
    "expected reason",
    "List → Red → Green → Refactor",
):
    if required_tdd_phrase not in tdd_skill:
        fail(f"TDD skill is missing t-wada workflow evidence: {required_tdd_phrase}")

effect_contracts = {
    "assumption-pruning": ("remove one assumption", "displaced complexity"),
    "context-handoff": ("export mode", "import mode", "provenance"),
    "evidence-review": ("change review", "dependency update", "independent evidence model"),
    "security-audit": ("attack surface", "coverage ledger", "source commit"),
}
for skill_name, required_phrases in effect_contracts.items():
    skill_text = (agent_skills_root / skill_name / "SKILL.md").read_text()
    for required_phrase in required_phrases:
        phrase_pattern = r"\s+".join(re.escape(part) for part in required_phrase.split())
        if not re.search(phrase_pattern, skill_text, re.IGNORECASE):
            fail(f"{skill_name} is missing its effect contract: {required_phrase}")

trust_contracts = {
    "context-handoff": (
        "current worktree",
        "repository-owned",
        "provenance",
        "freshness",
        "another worktree",
    ),
    "evidence-review": (
        "repository-owned",
        "current code",
        "another worktree",
        "legacy",
    ),
    "security-audit": (
        "canonical audit history",
        "not proof of safety",
        "source commit",
        "another worktree",
    ),
}
for evidence_skill_name, required_phrases in trust_contracts.items():
    evidence_skill = (
        agent_skills_root / evidence_skill_name / "SKILL.md"
    ).read_text()
    for required_phrase in required_phrases:
        phrase_pattern = r"\s+".join(re.escape(part) for part in required_phrase.split())
        if not re.search(phrase_pattern, evidence_skill, re.IGNORECASE):
            fail(
                f"{evidence_skill_name} is missing its tiered trust contract: "
                f"{required_phrase}"
            )

context_handoff_contract = (
    agent_skills_root / "context-handoff/SKILL.md"
).read_text()
for required_context_phrase in (
    "content-addressed",
    "Write the handoff last",
    "Never store a known credential",
    "Pin the handoff's own content hash",
    "context-snapshot/v1",
    "raw, uncompressed",
    "Capture the source snapshot before writing managed state",
):
    context_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_context_phrase.split()
    )
    if not re.search(context_phrase_pattern, context_handoff_contract):
        fail(f"context handoff checkpoint contract is incomplete: {required_context_phrase}")

security_audit_contract = (agent_skills_root / "security-audit/SKILL.md").read_text()
for required_security_phrase in (
    "audit run IDs not yet indexed",
    "Never update the ledger first",
    "monotonic publish order",
):
    security_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_security_phrase.split()
    )
    if not re.search(security_phrase_pattern, security_audit_contract):
        fail(f"security audit checkpoint contract is incomplete: {required_security_phrase}")

evidence_review_contract = (agent_skills_root / "evidence-review/SKILL.md").read_text()
for required_review_phrase in (
    "Bind the review and final disposition to this snapshot hash",
    "establish causality",
    "classification explains provenance only",
    "Regeneration or equivalent resolver evidence is required",
    "affected supported target without equivalent current evidence",
    "any unresolved `blocking-defect` yields `changes required`",
):
    review_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_review_phrase.split()
    )
    if not re.search(review_phrase_pattern, evidence_review_contract):
        fail(f"evidence review disposition contract is incomplete: {required_review_phrase}")

workflow_skill = (agent_skills_root / "using-workflow-skills/SKILL.md").read_text()
for required_workflow_phrase in (
    "one canonical owner",
    "User and system instructions take precedence",
    "test-driven-development",
    "evidence-review",
):
    if required_workflow_phrase not in workflow_skill:
        fail(f"workflow routing guardrail is incomplete: {required_workflow_phrase}")

routed_skill_names = re.findall(
    r"^\|[^|]+\| `([^`]+)` \|$", workflow_skill, re.MULTILINE
)
expected_routed_skill_names = expected_agent_skills - {"using-workflow-skills"}
if len(routed_skill_names) != len(set(routed_skill_names)):
    fail(f"workflow routing guardrail has duplicate owners: {routed_skill_names}")
if set(routed_skill_names) != expected_routed_skill_names:
    fail(
        "workflow routing guardrail differs from the canonical skills: "
        f"expected {sorted(expected_routed_skill_names)}, "
        f"got {sorted(routed_skill_names)}"
    )

workflow_state_script = (
    agent_skills_root / "using-workflow-skills/scripts/workflow-state-root"
)
if not workflow_state_script.is_file() or not os.access(workflow_state_script, os.X_OK):
    fail("workflow-state resolver must exist and be executable")

workflow_state_digest = (
    agent_skills_root / "using-workflow-skills/scripts/workflow-state-digest"
)
if not workflow_state_digest.is_file() or not os.access(workflow_state_digest, os.X_OK):
    fail("external workflow-state identity digest must exist and be executable")

local_dev_ignore = (
    agent_skills_root / "using-workflow-skills/scripts/ensure-local-dev-ignore"
)
if not local_dev_ignore.is_file() or not os.access(local_dev_ignore, os.X_OK):
    fail("company repository local .dev ignore helper must exist and be executable")

workflow_state_candidates = (
    agent_skills_root / "using-workflow-skills/scripts/workflow-state-candidates"
)
if not workflow_state_candidates.is_file() or not os.access(
    workflow_state_candidates, os.X_OK
):
    fail("workflow-state candidate discovery must exist and be executable")

workflow_state_writer = (
    agent_skills_root / "using-workflow-skills/scripts/workflow-state-write"
)
if not workflow_state_writer.is_file() or not os.access(workflow_state_writer, os.X_OK):
    fail("workflow-state writer must exist and be executable")

context_path_script = agent_skills_root / "context-handoff/scripts/context-path"
if not context_path_script.is_file() or not os.access(context_path_script, os.X_OK):
    fail("context handoff path resolver must exist and be executable")

context_candidates_script = agent_skills_root / "context-handoff/scripts/context-candidates"
if not context_candidates_script.is_file() or not os.access(
    context_candidates_script, os.X_OK
):
    fail("context handoff candidate discovery must exist and be executable")

state_home_template = ROOT / "dot_config/agent-workflows/state-home.tmpl"
if state_home_template.exists():
    fail("repository .dev is the default; managed external state-home must be removed")

workflow_state_reference = (
    agent_skills_root / "using-workflow-skills/references/persistent-state.md"
).read_text()
for required_state_phrase in (
    "Claude automatic memory is disabled",
    "current Git worktree",
    "repository-owned",
    "provenance",
    "freshness",
    "another worktree",
    "livesense-inc",
    "jobtalk",
    "AGENT_WORKFLOW_STATE_HOME",
):
    state_phrase_pattern = r"\s+".join(
        re.escape(part) for part in required_state_phrase.split()
    )
    if not re.search(state_phrase_pattern, workflow_state_reference):
        fail(f"workflow-state contract is incomplete: {required_state_phrase}")

if re.search(
    r"every\s+record\s+is\s+(?:\*\*)?untrusted\s+evidence",
    workflow_state_reference,
    re.IGNORECASE,
):
    fail(
        "current-worktree repository-owned workflow state must not be "
        "blanket-distrusted"
    )

agents_instructions = (ROOT / "AGENTS.md").read_text()
if re.search(
    r"saved\s+records\s+remain\s+untrusted\s+evidence",
    agents_instructions,
    re.IGNORECASE,
):
    fail("AGENTS.md must distinguish current-worktree .dev from imported evidence")

state_skill_resolvers = {
    "context-handoff": "scripts/context-path --ensure",
    "security-audit": "workflow-state-root --ensure",
}
for state_skill_name, expected_resolver in state_skill_resolvers.items():
    state_skill = (agent_skills_root / state_skill_name / "SKILL.md").read_text()
    if expected_resolver not in state_skill:
        fail(f"{state_skill_name} must use its workflow-state resolver")

with tempfile.TemporaryDirectory() as temp_dir:
    state_test_physical_root = Path(temp_dir) / "physical"
    state_test_physical_root.mkdir()
    state_test_root = Path(temp_dir) / "logical"
    state_test_root.symlink_to(state_test_physical_root, target_is_directory=True)
    state_test_repo = state_test_root / "repo"
    state_test_xdg = state_test_root / "state"
    state_test_config = state_test_root / "config"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(state_test_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/owner/repository.git",
        ],
        check=True,
    )
    state_test_env = dict(os.environ)
    state_test_env["XDG_STATE_HOME"] = str(state_test_xdg)
    state_test_env["XDG_CONFIG_HOME"] = str(state_test_config)
    state_test_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    ordinary_exclude = state_test_repo / ".git/info/exclude"
    ordinary_exclude_before = ordinary_exclude.read_bytes()

    unresolved_state = Path(
        subprocess.check_output(
            [str(workflow_state_script)], cwd=state_test_repo, env=state_test_env, text=True
        ).strip()
    )
    if unresolved_state != state_test_repo.resolve() / ".dev":
        fail("workflow-state resolver must default to the current worktree's .dev")
    if unresolved_state.exists():
        fail("workflow-state resolver must not write without --ensure")

    resolved_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if not resolved_state.is_dir():
        fail("workflow-state resolver did not create the repository state directory")
    if resolved_state.stat().st_mode & 0o077:
        fail("workflow-state repository directory must not grant group/other access")
    if ordinary_exclude.read_bytes() != ordinary_exclude_before:
        fail("ordinary repositories must not receive a local .dev ignore rule")

    state_test_subdir = state_test_repo / "nested" / "directory"
    state_test_subdir.mkdir(parents=True)
    nested_state = subprocess.check_output(
        [str(workflow_state_script)], cwd=state_test_subdir, env=state_test_env, text=True
    ).strip()
    if nested_state != str(resolved_state):
        fail("workflow-state identity must be stable from repository subdirectories")

    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "-c",
            "user.name=validator",
            "-c",
            "user.email=validator@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        ],
        check=True,
    )
    state_test_worktree = state_test_root / "worktree"
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "worktree",
            "add",
            "-q",
            "-b",
            "state-test",
            str(state_test_worktree),
        ],
        check=True,
    )
    worktree_state = subprocess.check_output(
        [str(workflow_state_script)],
        cwd=state_test_worktree,
        env=state_test_env,
        text=True,
    ).strip()
    if worktree_state != str(state_test_worktree.resolve() / ".dev"):
        fail("each linked worktree must resolve its own repository-local .dev")

    main_task_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--ensure", "--task", "cross-client-task"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    worktree_task_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--task", "cross-client-task"],
            cwd=state_test_worktree,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if main_task_context == worktree_task_context:
        fail("linked worktrees must not share the same .dev context record")
    if main_task_context.name != worktree_task_context.name:
        fail("explicit task keys must keep the same filename across worktrees")
    if main_task_context.exists() or not main_task_context.parent.is_dir():
        fail("context path resolver must create only the private parent directory")
    if worktree_task_context.parent.exists():
        fail("read-only context resolution must not create another worktree's .dev")

    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=state_test_worktree,
        env=state_test_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    other_worktree_candidates = subprocess.check_output(
        [str(workflow_state_candidates)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    if f"other-worktree-dev\t{worktree_state}" not in other_worktree_candidates:
        fail("candidate discovery must expose, but not merge, another worktree's .dev")

    first_context = "# First context\n"
    first_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "missing",
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=first_context,
        text=True,
        capture_output=True,
        check=False,
    )
    if first_write.returncode != 0 or main_task_context.read_text() != first_context:
        fail("workflow-state writer must atomically create an expected missing record")
    if main_task_context.stat().st_mode & 0o177:
        fail("workflow-state records must be owner-readable only")

    first_context_hash = subprocess.check_output(
        ["git", "hash-object", "--no-filters", str(main_task_context)], text=True
    ).strip()
    conflicting_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            "definitely-wrong",
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Must not replace the record\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if conflicting_write.returncode == 0 or main_task_context.read_text() != first_context:
        fail("workflow-state writer must reject a stale expected hash")

    second_context = "# Reconciled context\n"
    second_write = subprocess.run(
        [
            str(workflow_state_writer),
            "--expect",
            first_context_hash,
            str(main_task_context),
        ],
        cwd=state_test_repo,
        env=state_test_env,
        input=second_context,
        text=True,
        capture_output=True,
        check=False,
    )
    if second_write.returncode != 0 or main_task_context.read_text() != second_context:
        fail("workflow-state writer must update a record with the current expected hash")

    context_lock = Path(f"{main_task_context}.lock")
    context_lock.mkdir()
    locked_write = subprocess.run(
        [str(workflow_state_writer), str(main_task_context)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Must not bypass the lock\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if locked_write.returncode == 0 or main_task_context.read_text() != second_context:
        fail("workflow-state writer must reject a concurrently locked record")
    context_lock.rmdir()

    repository_metadata = resolved_state / "repository.meta"
    repository_metadata.write_text("repository state only\n")
    metadata_before = repository_metadata.read_text()
    outside_write = subprocess.run(
        [str(workflow_state_writer), str(repository_metadata)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not write outside record directories\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if outside_write.returncode == 0 or repository_metadata.read_text() != metadata_before:
        fail("workflow-state writer must reject targets outside record directories")

    directory_target = main_task_context.parent / "directory-target.md"
    directory_target.mkdir()
    directory_write = subprocess.run(
        [str(workflow_state_writer), str(directory_target)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not become a file inside a directory\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if directory_write.returncode == 0 or any(directory_target.iterdir()):
        fail("workflow-state writer must reject a directory as the final target")

    outside_directory = state_test_root / "outside-state"
    outside_directory.mkdir()
    symlink_target = main_task_context.parent / "symlink-target.md"
    symlink_target.symlink_to(outside_directory, target_is_directory=True)
    symlink_write = subprocess.run(
        [str(workflow_state_writer), str(symlink_target)],
        cwd=state_test_repo,
        env=state_test_env,
        input="must not follow a final symlink\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if symlink_write.returncode == 0 or any(outside_directory.iterdir()):
        fail("workflow-state writer must reject a symlink as the final target")

    main_branch_context = subprocess.check_output(
        [str(context_path_script)], cwd=state_test_repo, env=state_test_env, text=True
    ).strip()
    worktree_branch_context = subprocess.check_output(
        [str(context_path_script)],
        cwd=state_test_worktree,
        env=state_test_env,
        text=True,
    ).strip()
    if main_branch_context == worktree_branch_context:
        fail("different full branch refs must not collide in context paths")

    custom_state_home = state_test_root / "custom-state"
    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = str(custom_state_home)
    custom_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if custom_state_home.resolve() not in custom_state.parents:
        fail("AGENT_WORKFLOW_STATE_HOME must override the default state root")
    state_identity_hash = custom_state.name.rsplit("-", 1)[-1]
    if not re.fullmatch(r"[0-9a-f]{64}", state_identity_hash):
        fail("external workflow-state identity must use a stable SHA-256 digest")
    external_metadata = custom_state / "repository.meta"
    if not external_metadata.is_file():
        fail("external workflow-state resolver must create identity metadata")
    if external_metadata.stat().st_mode & 0o177:
        fail("external workflow-state metadata must be owner-readable only")
    external_metadata_text = external_metadata.read_text()
    for metadata_prefix in (
        "schema=1\n",
        "identity-method=remote.origin.url\n",
        "identity-hash=",
        "git-common-hash=",
        "created-at=",
    ):
        if metadata_prefix not in external_metadata_text:
            fail(f"external workflow-state metadata is missing {metadata_prefix!r}")
    if "ssh://example.invalid" in external_metadata_text:
        fail("external workflow-state metadata must not store the raw remote URL")

    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/renamed/repository.git",
        ],
        check=True,
    )
    changed_remote_candidates = subprocess.check_output(
        [str(workflow_state_candidates)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    changed_remote_candidate_paths = {
        Path(line.split("\t", 1)[1]).resolve()
        for line in changed_remote_candidates.splitlines()
        if "\t" in line
    }
    if custom_state.resolve() not in changed_remote_candidate_paths:
        fail("candidate discovery must find external state after a remote URL change")
    subprocess.run(
        [
            "git",
            "-C",
            str(state_test_repo),
            "config",
            "remote.origin.url",
            "ssh://example.invalid/owner/repository.git",
        ],
        check=True,
    )

    physical_state_home = state_test_root / "physical-state"
    physical_state_home.mkdir()
    linked_state_home = state_test_root / "linked-state"
    linked_state_home.symlink_to(physical_state_home, target_is_directory=True)
    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = str(
        linked_state_home / ".." / linked_state_home.name
    )
    linked_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    if physical_state_home.resolve() not in linked_state.parents:
        fail("workflow-state resolver must canonicalize symlinked external roots")
    linked_context = Path(
        subprocess.check_output(
            [str(context_path_script), "--ensure", "--task", "linked-state"],
            cwd=state_test_repo,
            env=state_test_env,
            text=True,
        ).strip()
    )
    linked_write = subprocess.run(
        [str(workflow_state_writer), "--expect", "missing", str(linked_context)],
        cwd=state_test_repo,
        env=state_test_env,
        input="# Linked state root\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if linked_write.returncode != 0 or not linked_context.is_file():
        fail("workflow-state writer must accept a canonicalized symlink state root")

    state_test_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    legacy_identity = "remote.origin.url:ssh://example.invalid/owner/repository.git"
    legacy_repository_hash = subprocess.check_output(
        ["git", "hash-object", "--stdin"],
        cwd=state_test_repo,
        input=legacy_identity,
        text=True,
    ).strip()
    legacy_context_hash = subprocess.check_output(
        ["git", "hash-object", "--stdin"],
        cwd=state_test_repo,
        input="task:legacy-task",
        text=True,
    ).strip()
    legacy_context = (
        state_test_xdg
        / "agent-workflows/repos"
        / f"repository-{legacy_repository_hash}"
        / "contexts"
        / f"legacy-task-{legacy_context_hash[:12]}.md"
    )
    legacy_context.parent.mkdir(parents=True)
    legacy_context.write_text("Record schema: context-handoff/v0\n")
    legacy_candidates = subprocess.check_output(
        [str(context_candidates_script), "--task", "legacy-task"],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
    )
    if str(legacy_context) not in legacy_candidates:
        fail("context candidate discovery must find the legacy Git-hash location")

    state_test_env["AGENT_WORKFLOW_STATE_HOME"] = "relative-state"
    relative_state = subprocess.run(
        [str(workflow_state_script)],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if relative_state.returncode == 0:
        fail("workflow-state resolver must reject a relative state root")

    invalid_task = subprocess.run(
        [str(context_path_script), "--task", "Not Lowercase"],
        cwd=state_test_repo,
        env=state_test_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if invalid_task.returncode == 0:
        fail("context handoff task keys must be stable lowercase slugs")

    company_repo = state_test_root / "company-remote"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(company_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(company_repo),
            "config",
            "remote.origin.url",
            "git@github.com:livesense-inc/jobtalk.git",
        ],
        check=True,
    )
    company_env = dict(os.environ)
    company_env.pop("AGENT_WORKFLOW_STATE_HOME", None)
    company_state = Path(
        subprocess.check_output(
            [str(workflow_state_script), "--ensure"],
            cwd=company_repo,
            env=company_env,
            text=True,
        ).strip()
    )
    if company_state != company_repo.resolve() / ".dev":
        fail("company repository workflow state must remain in its local .dev")
    company_exclude = company_repo / ".git/info/exclude"
    if company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("repositories in the livesense-inc namespace must locally ignore .dev")
    company_ignore_check = subprocess.run(
        ["git", "check-ignore", "--quiet", ".dev/contexts"],
        cwd=company_repo,
        check=False,
    )
    if company_ignore_check.returncode != 0:
        fail("company repository local exclude must actually ignore root .dev content")
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=company_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    if company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("company repository local .dev ignore must be idempotent")

    tracked_company_repo = state_test_root / "company-tracked-dev"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(tracked_company_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(tracked_company_repo),
            "config",
            "remote.origin.url",
            "https://github.com/livesense-inc/jobtalk.git",
        ],
        check=True,
    )
    tracked_dev = tracked_company_repo / ".dev"
    tracked_dev.mkdir()
    (tracked_dev / "tracked.md").write_text("tracked project record\n")
    subprocess.run(
        ["git", "-C", str(tracked_company_repo), "add", "-f", ".dev/tracked.md"],
        check=True,
    )
    tracked_company_result = subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=tracked_company_repo,
        env=company_env,
        text=True,
        capture_output=True,
        check=False,
    )
    if tracked_company_result.returncode == 0:
        fail("local ignore policy must not pretend an already tracked .dev is hidden")
    tracked_company_exclude = tracked_company_repo / ".git/info/exclude"
    if "/.dev/" in tracked_company_exclude.read_text().splitlines():
        fail("tracked .dev failure must not partially update the local exclude")
    if (tracked_dev / "contexts").exists():
        fail("tracked .dev failure must occur before workflow layout mutation")

    path_company_repo = state_test_root / "repos/livesense-inc/jobtalk"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(path_company_repo)], check=True
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=path_company_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    path_company_exclude = path_company_repo / ".git/info/exclude"
    if path_company_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("livesense-inc local namespace fallback must locally ignore .dev")

    jobtalk_org_repo = state_test_root / "jobtalk-org-repository"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(jobtalk_org_repo)], check=True
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(jobtalk_org_repo),
            "config",
            "remote.origin.url",
            "git@github.com:jobtalk/internal-app.git",
        ],
        check=True,
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=jobtalk_org_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    jobtalk_org_exclude = jobtalk_org_repo / ".git/info/exclude"
    if jobtalk_org_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("repositories in the jobtalk namespace must locally ignore .dev")

    path_jobtalk_repo = state_test_root / "repos/jobtalk/internal-app"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(path_jobtalk_repo)], check=True
    )
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=path_jobtalk_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    path_jobtalk_exclude = path_jobtalk_repo / ".git/info/exclude"
    if path_jobtalk_exclude.read_text().splitlines().count("/.dev/") != 1:
        fail("jobtalk local namespace fallback must locally ignore .dev")

    unrelated_jobtalk_repo = state_test_root / "unrelated-jobtalk-repository"
    subprocess.run(
        ["git", "init", "-q", "-b", "trunk", str(unrelated_jobtalk_repo)],
        check=True,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(unrelated_jobtalk_repo),
            "config",
            "remote.origin.url",
            "git@github.com:someone-else/jobtalk.git",
        ],
        check=True,
    )
    unrelated_exclude_before = (
        unrelated_jobtalk_repo / ".git/info/exclude"
    ).read_bytes()
    subprocess.run(
        [str(workflow_state_script), "--ensure"],
        cwd=unrelated_jobtalk_repo,
        env=company_env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    if (
        unrelated_jobtalk_repo / ".git/info/exclude"
    ).read_bytes() != unrelated_exclude_before:
        fail("a repository named jobtalk outside the two namespaces must not be ignored")

if (ROOT / "dot_claude/hooks/executable_herdr-review-notify.sh").exists():
    fail("legacy Herdr review notification hook remains")

removals = (ROOT / ".chezmoiremove").read_text().splitlines()
for restored_skill_name in expected_agent_skills:
    restored_target = f".claude/skills/{restored_skill_name}"
    if restored_target in removals:
        fail(f"restored Claude skill must not remain in .chezmoiremove: {restored_target}")

for target in (
    ".claude/CLAUDE.md",
    ".claude/agents/frontend-designer.md",
    ".claude/hooks/auto-test.sh",
    ".claude/hooks/herdr-review-notify.sh",
    ".claude/rules/coding.md",
    ".claude/rules/development.md",
    ".claude/rules/review.md",
    ".claude/agents/code-reviewer.md",
    ".claude/agents/doc-reviewer.md",
    ".claude/agents/independent-consultant.md",
    ".claude/agents/performance-reviewer.md",
    ".claude/agents/pr-test-analyzer.md",
    ".claude/agents/security-reviewer.md",
    ".claude/agents/silent-failure-hunter.md",
    ".claude/skills/adversarial-review",
    ".claude/skills/catchup",
    ".claude/skills/conversation-context-export",
    ".claude/skills/conversation-context-import",
    ".claude/skills/develop",
    ".claude/skills/library-update-review",
    ".claude/skills/pr-review",
    ".claude/skills/project-memory",
    ".claude/skills/sanity-review",
    ".claude/skills/ship",
    ".claude/skills/subagent-consultation",
    ".codex/AGENTS.md",
    ".config/opencode/AGENTS.md",
    ".config/opencode/plugins/claude-rules.ts",
    ".config/agent-workflows/state-home",
    ".config/project-maker",
    ".config/zsh/" + "agent-mail.zsh",
    ".kimi-code/AGENTS.md",
    ".kimi-code/mcp.json",
    "Documents/PowerShell/Microsoft.PowerShell_profile.ps1",
    "Library/LaunchAgents/com.user.yaskkserv2.plist",
    ".config/systemd/user/yaskkserv2.service",
    ".config/mise/.env",
    ".config/mise/.miserc.toml",
    ".config/mise/miserc.toml",
    ".config/zsh/functions/mise.zsh",
):
    if target not in removals:
        fail(f"deleted chezmoi target is missing from .chezmoiremove: {target}")

for path in tracked_files():
    if path in {ROOT / ".chezmoiremove", Path(__file__).resolve()}:
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue

    compact = text.casefold()
    forbidden = (
        "home" + "brew",
        "mcp_" + "agent_mail",
        "mcp-" + "agent-mail",
        "agent" + "-mail",
        "agent" + " mail",
        "scoop",
        "msys2",
    )
    for needle in forbidden:
        if needle in compact:
            fail(f"obsolete integration reference {needle!r} remains in {path.relative_to(ROOT)}")

for path in tracked_files():
    if path.suffix != ".json":
        continue
    try:
        json.loads(path.read_text())
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")

opencode = json.loads((ROOT / "dot_config/opencode/opencode.json").read_text())
if opencode.get("autoupdate") is not False:
    fail("OpenCode self-update must remain disabled; mise owns the pinned version")

opencode_instructions = opencode.get("instructions")
if not isinstance(opencode_instructions, list):
    fail("OpenCode instructions must be a list")
if "AGENTS.md" in opencode_instructions:
    fail("OpenCode must not load AGENTS.md twice")
if ".cursor/rules/*.md" not in opencode_instructions:
    fail("OpenCode must retain project Cursor rule discovery")

opencode_permissions = opencode.get("permission")
if not isinstance(opencode_permissions, dict):
    fail("OpenCode permission must be an object")
opencode_bash = opencode_permissions.get("bash")
if not isinstance(opencode_bash, dict):
    fail("OpenCode permission.bash must be an object")
if opencode_bash.get("*") != "ask":
    fail("OpenCode shell commands must ask by default")
if opencode_bash.get("git *") == "allow":
    fail("OpenCode must not pre-approve the git namespace")

required_opencode_bash = {
    "allow": {
        "git status *",
        "git diff *",
        "git log *",
        "git show *",
        "git rev-parse *",
        "git ls-files *",
        "git add *",
        "git commit *",
    },
    "ask": {
        "git add .",
        "git add -A *",
        "git commit --amend *",
        "git reset *",
        "git clean *",
        "git restore *",
        "git push *",
        "npm publish *",
        "cargo publish *",
        "go install *",
    },
    "deny": {
        "rm -rf *",
        "git push --force *",
        "git push --force-with-lease *",
    },
}
for action, patterns in required_opencode_bash.items():
    invalid = {
        pattern
        for pattern in patterns
        if opencode_bash.get(pattern) != action
    }
    if invalid:
        fail(f"OpenCode permission.bash must set {action}: {sorted(invalid)}")

settings_template = (ROOT / "dot_claude/settings.json.tmpl").read_text()
try:
    settings = json.loads(settings_template.split("{{-", 1)[0])
except json.JSONDecodeError as error:
    fail(f"invalid Claude settings JSON: {error}")

if settings.get("language") != "Japanese":
    fail("Claude language must not encode a voice or tone")

if settings.get("model") != "opus":
    fail("Claude default model must track the latest Opus release")

if settings.get("autoMemoryEnabled") is not False:
    fail("Claude automatic memory must remain disabled; use explicit workflow state")

hooks = settings.get("hooks")
if not isinstance(hooks, dict):
    fail("Claude settings hooks must be an object")


def hook_commands_for(event_name: str) -> set[str | None]:
    return {
        hook.get("command")
        for group in hooks.get(event_name, [])
        for hook in group.get("hooks", [])
        if isinstance(hook, dict)
    }


repository_guard_command = "~/.claude/hooks/authorize-repository.sh"
for event_name in ("UserPromptSubmit", "PreToolUse"):
    if repository_guard_command not in hook_commands_for(event_name):
        fail(f"Claude repository authorization must guard {event_name}")

hook_commands = {
    hook.get("command")
    for groups in hooks.values()
    for group in groups
    for hook in group.get("hooks", [])
    if isinstance(hook, dict)
}
for command in (
    "~/.claude/hooks/herdr-review-notify.sh success",
    "~/.claude/hooks/herdr-review-notify.sh failure",
):
    if command in hook_commands:
        fail(f"legacy Herdr review hook remains configured: {command}")

permissions = settings.get("permissions")
if not isinstance(permissions, dict):
    fail("Claude settings permissions must be an object")

required_permissions = {
    "allow": {
        "Bash(git add *)",
        "Bash(git commit *)",
    },
    "ask": {
        "Bash(rm *)",
        "Bash(git reset *)",
        "Bash(git push *)",
        "Bash(gh pr create *)",
        "Bash(gh api *)",
    },
    "deny": {
        "Bash(rm -rf *)",
        "Bash(git push --force *)",
        "Read(**/.env)",
        "Edit(**/.env)",
    },
}
for level, required in required_permissions.items():
    configured = permissions.get(level)
    if not isinstance(configured, list):
        fail(f"Claude permissions.{level} must be a list")
    missing = required - set(configured)
    if missing:
        fail(f"Claude permissions.{level} is missing: {sorted(missing)}")

if "Bash(git *)" in permissions["allow"]:
    fail("Claude permissions.allow must not pre-approve the git namespace")

try:
    renovate = json.loads(strip_json_comments((ROOT / "renovate.jsonc").read_text()))
except json.JSONDecodeError as error:
    fail(f"invalid JSONC in renovate.jsonc: {error}")
if renovate.get("minimumReleaseAge") != "1 day":
    fail("Renovate minimumReleaseAge must remain 1 day")
if renovate.get("timezone") != "Asia/Tokyo":
    fail("Renovate timezone must remain Asia/Tokyo")
if renovate.get("schedule") != ["* 0-5 * * *"]:
    fail("Renovate schedule must remain between midnight and 6am")
if renovate.get("automerge") is not True:
    fail("Renovate automerge must remain enabled")
if renovate.get("automergeType") != "pr":
    fail("Renovate automergeType must remain pr")
if renovate.get("automergeStrategy") != "squash":
    fail("Renovate automergeStrategy must remain squash")
if renovate.get("platformAutomerge") is not True:
    fail("Renovate platformAutomerge must remain enabled")
if renovate.get("lockFileMaintenance", {}).get("enabled") is not True:
    fail("Renovate lockFileMaintenance must remain enabled")
if "customManagers" in renovate:
    fail("Renovate must use the standard mise manager, not customManagers")
if renovate.get("customDatasources", {}).get("onepassword-cli") != {
    "defaultRegistryUrlTemplate": "https://mise-versions.jdx.dev/1password-cli",
    "format": "plain",
}:
    fail("Renovate must resolve 1Password CLI through mise's version endpoint")
if not any(
    rule.get("matchManagers") == ["mise"]
    and rule.get("matchPackageNames") == ["1password/cli"]
    and rule.get("overrideDatasource") == "custom.onepassword-cli"
    and rule.get("versioning") == "semver"
    and rule.get("minimumReleaseAge") is None
    and rule.get("enabled") is not False
    for rule in renovate.get("packageRules", [])
):
    fail("Renovate must track stable 1Password CLI releases")

if (ROOT / "scripts/update.sh").exists():
    fail("dependency updates must be owned by Renovate, not scripts/update.sh")
for relative in (
    "AGENTS.md",
    "README.md",
    "docs/ci.md",
    "mise.toml",
    ".github/workflows/ci.yml",
):
    if "mise run update" in (ROOT / relative).read_text():
        fail(f"obsolete mise run update interface remains in {relative}")
if "[tasks.update]" in (ROOT / "mise.toml").read_text():
    fail("obsolete mise update task remains in mise.toml")

keymaps = (ROOT / "dot_config/nvim/lua/core/keymaps.lua").read_text()
for mapping in (
    'map({ "n", "x", "o" }, "m", "h", opts)',
    'map({ "n", "x", "o" }, "n", "j", opts)',
    'map({ "n", "x", "o" }, "e", "k", opts)',
    'map({ "n", "x", "o" }, "i", "l", opts)',
    'map("n", "s", "i", opts)',
    'map("n", "t", "a", opts)',
    'map({ "n", "x" }, "c", "y", opts)',
    'map({ "n", "x" }, "v", "p", opts)',
):
    if mapping not in keymaps:
        fail(f"Colemak mapping changed or disappeared: {mapping}")

skk = (ROOT / "dot_config/nvim/lua/modules/configs/editor/skkeleton.lua").read_text()
for fragment in (
    'sources = { "skk_server" }',
    'skkServerHost = "127.0.0.1"',
    "skkServerPort = 1178",
):
    if fragment not in skk:
        fail(f"SKK configuration changed or disappeared: {fragment}")

ignore = (ROOT / ".chezmoiignore").read_text()
if "microsoft" not in ignore or ".local/bin/op" not in ignore:
    fail("WSL proxy conditional is missing from .chezmoiignore")

wsl_mise = (ROOT / "dot_config/mise/conf.d/wsl.toml.tmpl").read_text()
if "microsoft" not in wsl_mise or 'disable_tools = ["1password-cli"]' not in wsl_mise:
    fail("WSL must disable the native 1Password CLI")
installer = (ROOT / "install.sh").read_text()
if "MISE_DISABLE_TOOLS" not in installer:
    fail("fresh WSL bootstrap must disable the native 1Password CLI")
for fragment in (
    '[[ "$(uname -s)" == Linux ]] || return 0',
    "[[ -r /proc/sys/kernel/osrelease ]] || return 0",
    "grep -qi microsoft /proc/sys/kernel/osrelease || return 0",
):
    if fragment not in installer:
        fail(f"non-WSL bootstrap must skip WSL mise configuration successfully: {fragment}")
for fragment in (
    "  ensure_linux_elevation\n\n  if command -v curl",
    'sudo -v || die "sudo authorization is required to install system packages."',
    "run_as_root dnf install",
    "run_as_root pacman -Syu",
):
    if fragment not in installer:
        fail(f"Linux bootstrap elevation check is missing: {fragment}")

workflow = (ROOT / ".github/workflows/ci.yml").read_text()
if "--dry-" + "run" in workflow:
    fail("CI must execute bootstrap interfaces instead of previewing them")
for fragment in (
    "bash install.sh",
    "mise run apply",
    "mise run doctor",
    "mise bootstrap --yes",
    "mise bootstrap packages apply --yes",
    "format --check --stdin-filepath mise.lock - < mise.lock",
    "cargo:sheldon",
    "cargo:git-delta",
    "cargo:fd-find",
    "cargo:atuin",
    "npm:pnpm",
    "dotfiles_wait_for_port 127.0.0.1 1178",
    "intel-macos-mise-v1-${{ runner.os }}-${{ runner.arch }}-",
    "~/.local/share/mise",
    "~/.rustup",
    "~/.cargo/registry",
    "~/.cargo/git",
):
    if fragment not in workflow:
        fail(f"CI no longer executes required integration path: {fragment}")

if not re.search(
    r"(?m)^\s+uses: actions/cache@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+$",
    workflow,
):
    fail("actions/cache must use a full commit SHA with an exact semver comment")

if "\tdefaultBranch = trunk" not in (ROOT / "dot_gitconfig.tmpl").read_text():
    fail("new Git repositories must default to trunk")
if "- Default branch is `trunk`." not in (ROOT / "AGENTS.md").read_text():
    fail("repository instructions must identify trunk as the default branch")
for relative in ("README.md", "docs/setup-linux.md", "docs/setup-macos.md"):
    document = (ROOT / relative).read_text()
    if "raw.githubusercontent.com/kqnade/dotfiles/trunk/install.sh" not in document:
        fail(f"{relative} install command must fetch from trunk")

for relative in (
    "scripts/apply.sh",
    "scripts/bootstrap.sh",
    "scripts/build-skk-dictionary.sh",
    "scripts/doctor.sh",
    "scripts/yaskkserv2-serve.sh",
):
    script = (ROOT / relative).read_text()
    if "scripts/lib/runtime.sh" not in script:
        fail(f"{relative} must use the shared bootstrap runtime")
    if 'readonly DOTFILES_ROOT="${HOME}/repos/' in script:
        fail(f"{relative} must not hard-code the checkout path")

git_config_probe = subprocess.run(
    [
        "bash",
        "-c",
        """
set -euo pipefail
source scripts/lib/runtime.sh
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=test.existing \
GIT_CONFIG_VALUE_0=preserved \
  dotfiles_with_safe_git_directory /trusted/checkout env
""",
    ],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
git_config_environment = dict(
    line.split("=", 1)
    for line in git_config_probe.stdout.splitlines()
    if "=" in line
)
expected_git_config = {
    "GIT_CONFIG_COUNT": "2",
    "GIT_CONFIG_KEY_0": "test.existing",
    "GIT_CONFIG_VALUE_0": "preserved",
    "GIT_CONFIG_KEY_1": "safe.directory",
    "GIT_CONFIG_VALUE_1": "/trusted/checkout",
}
for key, expected in expected_git_config.items():
    if git_config_environment.get(key) != expected:
        fail(f"checkout-scoped Git config {key} must be {expected!r}")

bootstrap = (ROOT / "scripts/bootstrap.sh").read_text()
if "dotfiles_with_safe_git_directory" not in bootstrap:
    fail("pre-commit generation must trust only the resolved checkout for its Git subprocess")

print(
    "validated removals, JSON, Claude permissions, public CI paths, WSL proxies, "
    "Neovim, Colemak, and SKK"
)
