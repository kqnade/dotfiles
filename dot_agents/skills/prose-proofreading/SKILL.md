---
name: prose-proofreading
description: Proofread Markdown or plain-text prose while preserving meaning, voice, technical identifiers, and document structure. Use when the user asks to correct wording, improve clarity or consistency, or review documentation prose; distinguish factual gaps from language edits.
---

# Prose Proofreading

Improve what the document says and how easily it can be understood without
silently changing its claims.

## Establish the contract

Identify the audience, purpose, requested language, house style, and whether
the user wants findings, an edited file, or both. Treat repository terminology
and explicit style rules as constraints. If factual correctness requires
external verification, separate that work from proofreading.

## Review in two passes

First review meaning and structure:

- missing subject, actor, prerequisite, or conclusion;
- contradiction, unsupported transition, or ambiguous referent;
- section order that hides the answer or mixes unrelated concerns;
- duplicated content that can be removed without losing meaning.

Then review language and consistency:

- sentence length, unnecessary nominalization, vague modifiers, and repeated
  phrasing;
- terminology, capitalization, punctuation, tense, list parallelism, and
  heading hierarchy;
- wording that is stronger or weaker than the available evidence.

Preserve code blocks, commands, URLs, quotations, identifiers, placeholders,
and deliberate domain terms unless they are themselves the requested target.

## Make minimal changes

Prefer the smallest edit that fixes the diagnosed problem. Preserve the
author's register and do not standardize personality out of the prose. Never
invent facts, requirements, or citations to make a sentence read smoothly.

When editing a file, inspect the diff afterward for changed meaning, broken
Markdown, altered code, or accidental formatting churn.

## Report

Lead with meaning-changing or structurally important issues, then consistency
and style. Give the original phrase, proposed wording, and reason when the
choice is not obvious. Distinguish edits made, optional suggestions, factual
questions, and intentionally preserved wording.
