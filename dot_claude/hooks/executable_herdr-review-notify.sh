#!/bin/bash
# Notify Herdr when a labeled adversarial-review Claude finishes a turn.

cat >/dev/null 2>&1 || true

if [ "${HERDR_ENV:-}" != "1" ]; then
  exit 0
fi

case "${1:-success}" in
  success)
    STATUS="完了"
    SOUND="done"
    ;;
  failure)
    STATUS="失敗"
    SOUND="request"
    ;;
  *)
    exit 0
    ;;
esac

if [ -n "${HERDR_REVIEW_PANE_JSON:-}" ]; then
  PANE_JSON="$HERDR_REVIEW_PANE_JSON"
elif command -v herdr >/dev/null 2>&1; then
  PANE_JSON=$(herdr pane current --current 2>/dev/null) || exit 0
else
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

LABEL=$(printf '%s' "$PANE_JSON" | jq -r '.result.pane.label // empty' 2>/dev/null)

case "$LABEL" in
  "Advocate: "*)
    ROLE="擁護側"
    SCOPE="${LABEL#Advocate: }"
    ;;
  "Challenger: "*)
    ROLE="反証側"
    SCOPE="${LABEL#Challenger: }"
    ;;
  *)
    exit 0
    ;;
esac

TITLE="敵対レビュー${STATUS}: ${ROLE}"

if [ "${HERDR_REVIEW_NOTIFY_DRYRUN:-0}" = "1" ]; then
  printf 'notify: %s: %s\n' "$TITLE" "$SCOPE"
  exit 0
fi

herdr notification show "$TITLE" --body "$SCOPE" --sound "$SOUND" >/dev/null 2>&1 || true
exit 0
