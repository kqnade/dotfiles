# Performance Optimization

## Model Selection

- Do not hardcode specific model versions in prompts, scripts, or configs — lineups change.
  When building AI applications, look up the current model list instead of relying on memory.
- General rule: use a cheap/fast model (Haiku-class) for lightweight, high-frequency agent
  work, and the strongest available model for architecture decisions and deep debugging.

## Context Window Management

Avoid the last 20% of the context window for:

- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:

- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Plan Mode

For complex tasks requiring deep reasoning, enable **Plan Mode** and iterate on the plan
before writing code. Use sub-agents with distinct perspectives when a design needs critique.
