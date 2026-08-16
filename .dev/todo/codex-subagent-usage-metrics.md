# Attribute Codex subagent usage to the actual model

## Objective

Usage emitted for a subagent turn identifies the model that actually performed that turn, so a
Sol parent invoking a Luna subagent produces distinguishable Sol and Luna usage data, including
output and reasoning-output token counts.

## Scope

- Capture the raw telemetry for one controlled Sol-parent/Luna-subagent run and determine whether
  the child usage is missing or its `model` attribute is inherited from the parent.
- Implement the smallest repository-owned export or configuration change that emits child-turn
  usage with the actual model and enough stable identity to separate parent and subagent turns.
- Preserve the existing account-level rate-limit metrics.
- Add automated coverage for parent/child model attribution and document the resulting metric
  keys needed by dashboard consumers.

Current observation (2026-08-16): the parent model is `gpt-5.6-sol` and the default subagent model
is `gpt-5.6-luna`, but downstream usage appears to be attributed to Sol. This must be verified
against raw emitted events before choosing the implementation.

## Non-goals

- Sending subagent response text as a metric.
- Implementing New Relic dashboards or queries.
- Changing model-selection policy, rate-limit semantics, or unrelated Codex telemetry.
- Patching the upstream Codex binary in this repository.

## Durable records

None: this is a bounded implementation whose durable result should be the code, tests, and metric
contract documentation in the repository.

## Commit checklist

- [ ] Reproduce one controlled Sol-parent/Luna-subagent run and record a testable classification:
      child usage absent, child usage mislabeled, or model override not applied.
- [ ] Add a failing regression test or fixture that represents the verified parent/child telemetry
      behavior and requires actual-model attribution.
- [ ] Implement and verify export of subagent input, cached-input, output, and reasoning-output
      usage with the actual model and stable parent/child differentiation.
- [ ] Verify existing account-level rate-limit metrics remain unchanged and document the final
      metric names, attributes, and dashboard-facing interpretation.
