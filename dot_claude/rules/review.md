# AI-assisted review

- Treat AI output as a hypothesis, not authority. Verify material claims against code, tests, command output, or primary sources.
- Keep observed facts, inferences, and decisions distinguishable in `.dev/` records.
- Preserve rejected alternatives, failed attempts, and intentional non-scope when they affect future decisions; reviewing only the final diff is insufficient.
- Use `sanity-review` for substantive pull requests. Review the human-authored body, AI context, canonical `.dev/` records, implementation, and tests as independent evidence.
- Use `adversarial-review` when design assumptions, security, correctness, or tradeoffs need independent challenge. Run isolated instances of the same approved CLI in a labeled background Herdr tab. Do not force consensus; verify disputed claims and report unresolved disagreement.
- Claude and GitHub Copilot use company accounts. OpenCode, Codex, and Kimi use personal accounts and must not receive repository content, diffs, `.dev` records, or prompts in an automatic workflow.
- Account ownership and repository authorization are separate. Before inspecting a repository or sending its evidence to another session or subagent, confirm that the active CLI and account are approved for that repository. If either approval is missing or unclear, do not proceed.
- From Claude, launch only Claude for `adversarial-review` and subagent consultation. GitHub Copilot is company-managed but is a different CLI, so do not use it as an automatic fallback.
- Run delegated reviewers with an explicit read-only tool allowlist. If the execution environment cannot enforce that boundary, report the review as not performed.
- Never draft, complete, rewrite, or suggest copy-ready pull request body text. Do not use `gh pr create --fill`.
- A pull request body must be authored by the user. Exact user-provided text may be submitted verbatim.
- AI-generated context belongs in `.dev/contexts/` and, when requested, a clearly labeled collapsible pull request comment. Never put it in the pull request body.
- Write pull-request-facing AI comments and review reports in Japanese unless the repository explicitly requires another language. Preserve code identifiers, commands, and source quotations as written.
