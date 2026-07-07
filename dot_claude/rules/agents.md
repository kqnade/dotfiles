# Agent Orchestration

## Available Agents

Use the built-in agent types (via the Agent/Task tool):

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| Explore | Read-only codebase search | Broad fan-out searches across many files |
| Plan | Implementation planning | Complex features, refactoring, architecture |
| general-purpose | Multi-step research/tasks | Anything that needs full tool access |

For code review, prefer skills over agents: `/code-review` (built-in) or the
CodeRabbit plugin (`coderabbit:code-review`). For security-sensitive changes
use `/security-review`.

Custom agents in `~/.claude/agents/` (dotclaude review specialists:
code-reviewer, security-reviewer, performance-reviewer, doc-reviewer,
pr-test-analyzer, silent-failure-hunter, frontend-designer) are
task-specific — only use them for their documented purpose.

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:

- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
