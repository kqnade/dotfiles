#!/usr/bin/env python3
"""Export ChatGPT-authenticated Codex rate limits to New Relic OTLP."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


METRIC_PREFIX = "codex.usage"
ENTITY_NAME = "codex-usage-exporter"
CHANGE_TRACKING_MUTATION = """\
mutation CreateCodexUsageReset(
  $event: ChangeTrackingEventInput!
) {
  changeTrackingCreateEvent(
    changeTrackingEvent: $event
  ) {
    changeTrackingEvent { changeTrackingId }
    messages
  }
}
"""


def resolve_command(name: str) -> list[str]:
    command = shutil.which(name)
    if command:
        return [command]

    shim = Path.home() / ".local/share/mise/shims" / name
    if shim.is_file():
        return [str(shim)]

    raise RuntimeError(f"{name} is not installed")


def resolve_license_key(
    config_path: Path | None = None, yq_command: list[str] | None = None
) -> str:
    environment_key = os.environ.get("NEW_RELIC_LICENSE_KEY", "").strip()
    if environment_key:
        return environment_key

    config_path = config_path or Path.home() / ".codex/config.toml"
    if not config_path.is_file():
        raise RuntimeError(f"Codex config is missing: {config_path}")

    yq_command = yq_command or resolve_command("yq")
    result = subprocess.run(
        [
            *yq_command,
            "-p",
            "toml",
            "-r",
            '.otel.metrics_exporter."otlp-http".headers."api-key"',
            str(config_path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "failed to read New Relic key from Codex config: "
            f"{result.stderr.strip()}"
        )
    license_key = result.stdout.strip()
    if not license_key or license_key == "null":
        raise RuntimeError("New Relic key is not configured in the environment or Codex config")
    return license_key


def app_server_requests() -> list[str]:
    return [
        json.dumps(
            {
                "method": "initialize",
                "id": 1,
                "params": {
                    "clientInfo": {"name": "codex-usage-exporter", "version": "1"}
                },
            }
        ),
        json.dumps({"method": "initialized"}),
        json.dumps({"method": "account/rateLimits/read", "id": 2, "params": None}),
    ]


def _attributes(**values: Any) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": {"stringValue": value}}
        for key, value in values.items()
        if value is not None
    ]


def _point(value: int | float, now_ns: int, **labels: Any) -> dict[str, Any]:
    field = "asInt" if isinstance(value, int) else "asDouble"
    return {
        field: value,
        "timeUnixNano": now_ns,
        "attributes": _attributes(**labels),
    }


def _metric(name: str, points: list[dict[str, Any]]) -> dict[str, Any]:
    return {"name": name, "gauge": {"dataPoints": points}}


def _credit_balance(snapshot: dict[str, Any]) -> float | None:
    credits = snapshot.get("credits") or {}
    balance = credits.get("balance")
    if balance is None:
        return None
    try:
        return float(Decimal(str(balance)))
    except (InvalidOperation, ValueError):
        return None


def build_change_events(
    response: dict[str, Any], now_s: int | None = None
) -> list[dict[str, Any]]:
    now_s = int(time.time()) if now_s is None else now_s
    snapshots = list((response.get("rateLimitsByLimitId") or {}).values())
    if not snapshots:
        snapshots = [response.get("rateLimits") or {}]

    events = []
    for snapshot in snapshots:
        limit_id = snapshot.get("limitId")
        for window in (snapshot.get("primary") or {}, snapshot.get("secondary") or {}):
            if window.get("windowDurationMins") != 7 * 24 * 60:
                continue
            reset_at = window.get("resetsAt")
            if reset_at is None:
                continue
            reset_at = int(reset_at)
            if 0 <= reset_at - now_s <= 24 * 60 * 60:
                events.append(
                    {
                        "key": (limit_id, reset_at),
                        "timestamp": reset_at * 1000,
                        "category": "Operational",
                        "type": "Scheduled Maintenance Period",
                        "description": "Codex usage reset",
                        "limit_name": "weekly",
                        "reset_at": reset_at,
                        "entity": ENTITY_NAME,
                    }
                )
    return events


def build_change_event_request(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "query": CHANGE_TRACKING_MUTATION,
        "variables": {
            "event": {
                "timestamp": event["timestamp"],
                "categoryAndTypeData": {
                    "kind": {
                        "category": event["category"],
                        "type": event["type"],
                    }
                },
                "description": event["description"],
                "customAttributes": {
                    "limit_name": event["limit_name"],
                    "reset_at": event["reset_at"],
                },
                "entitySearch": {
                    "query": (
                        f"name = '{event['entity']}' AND domain = 'EXT' "
                        "AND type = 'SERVICE'"
                    )
                },
            },
        },
    }


def publish_pending_change_events(
    response: dict[str, Any],
    state_path: Path,
    send: Any,
    now_s: int | None = None,
) -> None:
    state = {"sent": []}
    if state_path.is_file():
        state = json.loads(state_path.read_text())
    sent = set(state.get("sent", []))

    for event in build_change_events(response, now_s=now_s):
        key = f"{event['key'][0]}:{event['key'][1]}"
        if key in sent:
            continue
        send(event)
        sent.add(key)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = state_path.with_suffix(f"{state_path.suffix}.tmp")
        temporary_path.write_text(json.dumps({"sent": sorted(sent)}) + "\n")
        temporary_path.replace(state_path)


def export_change_event(
    event: dict[str, Any], endpoint: str, user_key: str
) -> None:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(build_change_event_request(event)).encode("utf-8"),
        headers={"Content-Type": "application/json", "Api-Key": user_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"New Relic returned HTTP {response.status}")
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"New Relic returned HTTP {error.code}") from error

    if result.get("errors"):
        messages = "; ".join(error["message"] for error in result["errors"])
        raise RuntimeError(f"NerdGraph rejected change event: {messages}")
    created = (result.get("data") or {}).get("changeTrackingCreateEvent") or {}
    change_event = created.get("changeTrackingEvent") or {}
    if not change_event.get("changeTrackingId"):
        messages = "; ".join(created.get("messages") or [])
        detail = f": {messages}" if messages else ""
        raise RuntimeError(f"NerdGraph did not create a change event{detail}")


def build_otlp_payload(response: dict[str, Any], now_ns: int | None = None) -> dict[str, Any]:
    now_ns = time.time_ns() if now_ns is None else now_ns
    metric_points: dict[str, list[dict[str, Any]]] = {}

    def add_metric(name: str, value: int | float, **labels: Any) -> None:
        metric_points.setdefault(name, []).append(_point(value, now_ns, **labels))

    snapshots = list((response.get("rateLimitsByLimitId") or {}).values())
    if not snapshots:
        snapshots = [response.get("rateLimits") or {}]

    for snapshot in snapshots:
        limit_labels = {
            "limit_id": snapshot.get("limitId"),
            "limit_name": snapshot.get("limitName"),
        }
        for window_name in ("primary", "secondary"):
            window = snapshot.get(window_name)
            if not window:
                continue
            used_percent = int(window["usedPercent"])
            labels = {"window": window_name, **limit_labels}
            add_metric(f"{METRIC_PREFIX}.used_percent", used_percent, **labels)
            add_metric(f"{METRIC_PREFIX}.remaining_percent", 100 - used_percent, **labels)
            if window.get("resetsAt") is not None:
                add_metric(f"{METRIC_PREFIX}.reset_at", int(window["resetsAt"]), **labels)
            if window.get("windowDurationMins") is not None:
                add_metric(
                    f"{METRIC_PREFIX}.window_duration_minutes",
                    int(window["windowDurationMins"]),
                    **labels,
                )

        balance = _credit_balance(snapshot)
        if balance is not None:
            add_metric(f"{METRIC_PREFIX}.credit_balance", balance, **limit_labels)

        if "rateLimitReachedType" in snapshot:
            add_metric(
                f"{METRIC_PREFIX}.limit_reached",
                1 if snapshot["rateLimitReachedType"] else 0,
                **limit_labels,
            )

    metrics = [_metric(name, points) for name, points in metric_points.items()]

    return {
        "resourceMetrics": [
            {
                "resource": {
                    "attributes": _attributes(
                        **{
                            "service.name": ENTITY_NAME,
                            "telemetry.sdk.language": "python",
                        }
                    )
                },
                "scopeMetrics": [{"scope": {"name": ENTITY_NAME}, "metrics": metrics}],
            }
        ]
    }


def read_rate_limits(codex_command: str | None = None) -> dict[str, Any]:
    command = resolve_command("codex") if codex_command is None else [codex_command]
    process = subprocess.Popen(
        [*command, "app-server", "--stdio"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert process.stdin and process.stdout
    try:
        for request in app_server_requests():
            process.stdin.write(f"{request}\n")
            process.stdin.flush()

        while True:
            line = process.stdout.readline()
            if not line:
                stderr = process.stderr.read() if process.stderr else ""
                raise RuntimeError(
                    "Codex App Server exited without a rate limit response: "
                    f"{stderr.strip()}"
                )
            message = json.loads(line)
            if message.get("id") == 2:
                if "error" in message:
                    raise RuntimeError(
                        "Codex App Server rate limit request failed: "
                        f"{message['error']}"
                    )
                return message["result"]
    finally:
        process.terminate()
        process.wait(timeout=5)


def export(payload: dict[str, Any], endpoint: str, license_key: str) -> None:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Api-Key": license_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"New Relic returned HTTP {response.status}")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"New Relic returned HTTP {error.code}") from error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--endpoint",
        default=os.environ.get(
            "CODEX_USAGE_OTLP_ENDPOINT", "https://otlp.nr-data.net/v1/metrics"
        ),
    )
    parser.add_argument(
        "--nerdgraph-endpoint",
        default=os.environ.get(
            "CODEX_USAGE_NERDGRAPH_ENDPOINT", "https://api.newrelic.com/graphql"
        ),
    )
    parser.add_argument(
        "--state-path",
        type=Path,
        default=Path(
            os.environ.get(
                "CODEX_USAGE_STATE_PATH",
                Path.home()
                / ".local/state/codex-usage-exporter/change-events.json",
            )
        ),
    )
    args = parser.parse_args()
    license_key = resolve_license_key()
    response = read_rate_limits()
    export(build_otlp_payload(response), args.endpoint, license_key)
    if build_change_events(response):
        user_key = os.environ.get("NEW_RELIC_ACCOUNT_APIKey", "").strip()
        if not user_key:
            raise RuntimeError(
                "NEW_RELIC_ACCOUNT_APIKey is required to publish Codex reset change events"
            )
        publish_pending_change_events(
            response,
            state_path=args.state_path,
            send=lambda event: export_change_event(
                event,
                endpoint=args.nerdgraph_endpoint,
                user_key=user_key,
            ),
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
