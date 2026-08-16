#!/usr/bin/env python3
"""Behavior tests for the Codex usage exporter."""

import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/codex_usage_exporter.py"
SPEC = importlib.util.spec_from_file_location("codex_usage_exporter", MODULE_PATH)
assert SPEC and SPEC.loader
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


class CodexUsageExporterTests(unittest.TestCase):
    def test_builds_change_event_only_for_resets_within_the_next_day(self) -> None:
        now = 1_700_000_000
        response = {
            "rateLimitsByLimitId": {
                "codex": {
                    "limitId": "codex",
                    "secondary": {
                        "usedPercent": 20,
                        "resetsAt": now + 24 * 60 * 60,
                        "windowDurationMins": 10_080,
                    },
                },
                "codex_future": {
                    "limitId": "codex_future",
                    "secondary": {
                        "usedPercent": 10,
                        "resetsAt": now + 24 * 60 * 60 + 1,
                        "windowDurationMins": 10_080,
                    },
                },
            }
        }

        events = exporter.build_change_events(response, now_s=now)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["key"], ("codex", now + 24 * 60 * 60))
        self.assertEqual(
            events[0],
            {
                "key": ("codex", now + 24 * 60 * 60),
                "timestamp": (now + 24 * 60 * 60) * 1000,
                "category": "Operational",
                "type": "Scheduled Maintenance Period",
                "description": "Codex usage reset",
                "limit_name": "weekly",
                "reset_at": now + 24 * 60 * 60,
                "entity": "codex-usage-exporter",
            },
        )

        request = exporter.build_change_event_request(events[0])
        self.assertEqual(
            request["variables"]["event"],
            {
                "timestamp": (now + 24 * 60 * 60) * 1000,
                "categoryAndTypeData": {
                    "kind": {
                        "category": "Operational",
                        "type": "Scheduled Maintenance Period",
                    }
                },
                "description": "Codex usage reset",
                "customAttributes": {
                    "limit_name": "weekly",
                    "reset_at": now + 24 * 60 * 60,
                },
                "entitySearch": {
                    "query": "name = 'codex-usage-exporter' AND domain = 'EXT' AND type = 'SERVICE'"
                },
            },
        )
        self.assertNotIn("rules", request["variables"])

    def test_reads_license_key_from_existing_codex_otel_config(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = pathlib.Path(temporary_directory) / "config.toml"
            config_path.write_text(
                "[otel.metrics_exporter.otlp-http.headers]\n"
                'api-key = "stored-key"\n'
            )
            yq_result = subprocess.CompletedProcess(
                args=[], returncode=0, stdout="stored-key\n", stderr=""
            )

            with mock.patch.dict("os.environ", {}, clear=True), mock.patch.object(
                subprocess, "run", return_value=yq_result
            ):
                license_key = exporter.resolve_license_key(
                    config_path=config_path, yq_command=["fake-yq"]
                )

        self.assertEqual(license_key, "stored-key")

    def test_persists_sent_reset_keys_and_sends_a_changed_reset(self) -> None:
        now = 1_700_000_000
        snapshot = {
            "rateLimits": {
                "limitId": "codex",
                "secondary": {
                    "usedPercent": 20,
                    "resetsAt": now + 60,
                    "windowDurationMins": 10_080,
                },
            }
        }
        sent = []

        with tempfile.TemporaryDirectory() as temporary_directory:
            state_path = pathlib.Path(temporary_directory) / "change-events.json"
            exporter.publish_pending_change_events(
                snapshot, state_path=state_path, send=sent.append, now_s=now
            )
            exporter.publish_pending_change_events(
                snapshot, state_path=state_path, send=sent.append, now_s=now
            )
            snapshot["rateLimits"]["secondary"]["resetsAt"] = now + 120
            exporter.publish_pending_change_events(
                snapshot, state_path=state_path, send=sent.append, now_s=now
            )

            self.assertEqual(
                json.loads(state_path.read_text()),
                {"sent": [f"codex:{now + 60}", f"codex:{now + 120}"]},
            )

        self.assertEqual([event["reset_at"] for event in sent], [now + 60, now + 120])

    def test_nerdgraph_graphql_errors_are_failures(self) -> None:
        response = mock.MagicMock()
        response.status = 200
        response.read.return_value = json.dumps(
            {"errors": [{"message": "timestamp is outside the allowed range"}]}
        ).encode()
        response.__enter__.return_value = response

        with mock.patch.object(
            exporter.urllib.request, "urlopen", return_value=response
        ):
            with self.assertRaisesRegex(RuntimeError, "timestamp is outside"):
                exporter.export_change_event(
                    {
                        "timestamp": 1,
                        "category": "Operational",
                        "type": "Scheduled Maintenance Period",
                        "description": "Codex usage reset",
                        "limit_name": "weekly",
                        "reset_at": 1,
                        "entity": "codex-usage-exporter",
                    },
                    endpoint="https://api.newrelic.com/graphql",
                    user_key="user-key",
                )

    def test_nerdgraph_missing_created_event_is_a_failure(self) -> None:
        response = mock.MagicMock()
        response.status = 200
        response.read.return_value = json.dumps(
            {
                "data": {
                    "changeTrackingCreateEvent": {
                        "changeTrackingEvent": None,
                        "messages": ["entity search matched no entities"],
                    }
                }
            }
        ).encode()
        response.__enter__.return_value = response

        with mock.patch.object(
            exporter.urllib.request, "urlopen", return_value=response
        ):
            with self.assertRaisesRegex(RuntimeError, "matched no entities"):
                exporter.export_change_event(
                    {
                        "timestamp": 1,
                        "category": "Operational",
                        "type": "Scheduled Maintenance Period",
                        "description": "Codex usage reset",
                        "limit_name": "weekly",
                        "reset_at": 1,
                        "entity": "codex-usage-exporter",
                    },
                    endpoint="https://api.newrelic.com/graphql",
                    user_key="user-key",
                )

    def test_main_exports_metrics_and_pending_change_events(self) -> None:
        rate_limits = {
            "rateLimits": {
                "limitId": "codex",
                "secondary": {
                    "usedPercent": 1,
                    "resetsAt": int(exporter.time.time()) + 60,
                    "windowDurationMins": 10_080,
                },
            }
        }
        with mock.patch.object(exporter, "resolve_license_key", return_value="license"), \
             mock.patch.object(exporter, "read_rate_limits", return_value=rate_limits), \
             mock.patch.object(exporter, "export") as export_metrics, \
             mock.patch.object(exporter, "export_change_event") as export_event, \
             mock.patch.object(exporter, "publish_pending_change_events") as publish_events, \
             mock.patch.dict(
                 "os.environ",
                 {"NEW_RELIC_ACCOUNT_APIKey": "user-key"},
                 clear=True,
             ), \
             mock.patch.object(exporter.sys, "argv", ["codex_usage_exporter.py"]):
            result = exporter.main()
            self.assertEqual(result, 0)
            export_metrics.assert_called_once()
            self.assertEqual(publish_events.call_args.args[0], rate_limits)
            sent_event = {"reset_at": 1}
            publish_events.call_args.kwargs["send"](sent_event)
            export_event.assert_called_once_with(
                sent_event,
                endpoint="https://api.newrelic.com/graphql",
                user_key="user-key",
            )

    def test_builds_metrics_for_both_windows_and_account_state(self) -> None:
        snapshot = {
            "rateLimits": {
                "primary": {
                    "usedPercent": 37,
                    "resetsAt": 1_700_000_000,
                    "windowDurationMins": 300,
                },
                "secondary": {
                    "usedPercent": 82,
                    "resetsAt": 1_700_100_000,
                    "windowDurationMins": 10_080,
                },
                "credits": {"balance": "12.50", "hasCredits": True, "unlimited": False},
                "rateLimitReachedType": None,
            }
        }

        payload = exporter.build_otlp_payload(snapshot, now_ns=1_800_000_000_000_000_000)
        metrics = {
            metric["name"]: metric
            for metric in payload["resourceMetrics"][0]["scopeMetrics"][0][
                "metrics"
            ]
        }

        def data_point(name: str, index: int = 0) -> dict[str, object]:
            return metrics[name]["gauge"]["dataPoints"][index]

        self.assertEqual(data_point("codex.usage.used_percent")["asInt"], 37)
        self.assertEqual(
            data_point("codex.usage.remaining_percent", 1)["asInt"], 18
        )
        self.assertEqual(
            data_point("codex.usage.reset_at")["asInt"], 1_700_000_000
        )
        self.assertEqual(
            data_point("codex.usage.window_duration_minutes", 1)["asInt"],
            10_080,
        )
        self.assertEqual(data_point("codex.usage.credit_balance")["asDouble"], 12.5)
        self.assertEqual(data_point("codex.usage.limit_reached")["asInt"], 0)

    def test_builds_metrics_for_each_named_rate_limit(self) -> None:
        payload = exporter.build_otlp_payload(
            {
                "rateLimits": {
                    "limitId": "codex",
                    "limitName": None,
                    "primary": {"usedPercent": 37},
                },
                "rateLimitsByLimitId": {
                    "codex": {
                        "limitId": "codex",
                        "limitName": None,
                        "primary": {"usedPercent": 37},
                    },
                    "codex_bengalfox": {
                        "limitId": "codex_bengalfox",
                        "limitName": "GPT-5.3-Codex-Spark",
                        "primary": {"usedPercent": 12},
                    },
                },
            },
            now_ns=1,
        )
        metrics = {
            metric["name"]: metric
            for metric in payload["resourceMetrics"][0]["scopeMetrics"][0][
                "metrics"
            ]
        }
        used_points = metrics["codex.usage.used_percent"]["gauge"]["dataPoints"]

        self.assertEqual(
            [point["asInt"] for point in used_points],
            [37, 12],
        )
        self.assertEqual(
            {
                attribute["key"]: attribute["value"]["stringValue"]
                for attribute in used_points[1]["attributes"]
            },
            {
                "window": "primary",
                "limit_id": "codex_bengalfox",
                "limit_name": "GPT-5.3-Codex-Spark",
            },
        )

    def test_omits_unavailable_optional_values(self) -> None:
        payload = exporter.build_otlp_payload(
            {
                "rateLimits": {
                    "primary": {"usedPercent": 100},
                    "secondary": None,
                    "credits": None,
                }
            },
            now_ns=1,
        )
        names = {
            metric["name"]
            for metric in payload["resourceMetrics"][0]["scopeMetrics"][0][
                "metrics"
            ]
        }

        self.assertEqual(names, {"codex.usage.used_percent", "codex.usage.remaining_percent"})

    def test_encodes_app_server_request_sequence(self) -> None:
        requests = exporter.app_server_requests()

        self.assertEqual(
            json.loads(requests[0]),
            {
                "method": "initialize",
                "id": 1,
                "params": {
                    "clientInfo": {"name": "codex-usage-exporter", "version": "1"}
                },
            },
        )
        self.assertEqual(json.loads(requests[1]), {"method": "initialized"})
        self.assertEqual(json.loads(requests[2]), {"method": "account/rateLimits/read", "id": 2, "params": None})

    def test_reads_rate_limits_from_app_server_response(self) -> None:
        process = mock.Mock()
        process.stdin = mock.Mock()
        process.stdout.readline.side_effect = [
            json.dumps({"method": "account/rateLimits/updated", "params": {}}) + "\n",
            json.dumps(
                {
                    "id": 2,
                    "result": {
                        "rateLimits": {"primary": {"usedPercent": 1}}
                    },
                }
            )
            + "\n",
        ]
        process.stderr.read.return_value = ""

        with mock.patch.object(subprocess, "Popen", return_value=process):
            result = exporter.read_rate_limits("fake-codex")

        self.assertEqual(result["rateLimits"]["primary"]["usedPercent"], 1)
        self.assertEqual(process.stdin.write.call_count, 3)

    def test_resolves_codex_from_mise_shims_for_service_execution(self) -> None:
        process = mock.Mock()
        process.stdin = mock.Mock()
        process.stdout.readline.return_value = json.dumps(
            {"id": 2, "result": {"rateLimits": {}}}
        ) + "\n"
        process.stderr.read.return_value = ""

        with mock.patch.object(
            exporter,
            "resolve_command",
            return_value=["/home/test/.local/share/mise/shims/codex"],
        ), mock.patch.object(subprocess, "Popen", return_value=process) as popen:
            exporter.read_rate_limits()

        self.assertEqual(
            popen.call_args.args[0],
            ["/home/test/.local/share/mise/shims/codex", "app-server", "--stdio"],
        )


if __name__ == "__main__":
    unittest.main()
