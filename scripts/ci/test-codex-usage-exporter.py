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
