import json
import logging
from pathlib import Path
import sys
import threading
from types import MappingProxyType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[2] / "main" / "python"))

import garmin_bridge

ACCOUNT_NAMESPACE = "garmin:abcdefabcdefabcdefabcdefabcdefab"
DISCOVERY_FIXTURE = json.loads(
    (Path(__file__).parents[6] / "tests" / "fixtures" / "garmin-json" / "discovery-running-summary.json").read_text()
)


class FakeClient:
    def __init__(self, *, needs_mfa=False):
        self.needs_mfa = needs_mfa
        self.display_name = "account-fixture"
        self.calls = []
        self.loaded_tokens = None
        self.client = self
        self.token_generation = 1

    def login(self, tokenstore=None):
        self.calls.append(("login", tokenstore))
        if tokenstore is not None:
            self.loaded_tokens = tokenstore
            return (None, None)
        return ("needs_mfa", None) if self.needs_mfa else (None, None)

    def resume_login(self, _state, code):
        self.calls.append(("resume_login", code))
        self.needs_mfa = False
        return (None, None)

    def logout(self):
        self.calls.append(("logout", None))

    def dumps(self):
        return json.dumps({"di_token": f"fixture-{self.token_generation}", "di_refresh_token": "fixture-refresh", "di_client_id": "fixture-client"})

    def _refresh_di_token(self):
        self.calls.append(("force_refresh", None))
        self.token_generation += 1

    def get_activities(self, start, limit, activitytype, activitysubtype=None):
        self.calls.append(("get_activities", start, limit, activitytype, activitysubtype))
        return [DISCOVERY_FIXTURE]

    def get_activity(self, activity_id):
        self.calls.append(("get_activity", activity_id))
        return {"activityId": 42}

    def get_activity_splits(self, activity_id):
        self.calls.append(("get_activity_splits", activity_id))
        return {"lapDTOs": []}

    def get_activity_details(self, activity_id, maxchart=0, maxpoly=0):
        self.calls.append(("get_activity_details", activity_id, maxchart, maxpoly))
        return {"metricDescriptors": [], "activityDetailMetrics": []}


def provider_error(name, *, status=None, retry_after=None):
    error_type = type(name, (Exception,), {})
    error = error_type("synthetic-secret traceback at private endpoint")
    if status is not None:
        response = type("Response", (), {})()
        response.status_code = status
        response.headers = {} if retry_after is None else {"Retry-After": retry_after}
        error.response = response
    return error


class GarminBridgeTests(unittest.TestCase):
    def test_proxy_mapping_is_rejected_before_client_creation_but_typed_dict_reaches_factory(self):
        # Host-only proxy reproduction, not an installed Chaquopy runtime claim.
        calls = []
        def factory(**kwargs):
            calls.append(kwargs)
            return FakeClient(needs_mfa=True)
        bridge = garmin_bridge.create_bridge(client_factory=factory, handle_factory=lambda: "opaque-challenge")
        values = {"email": "owner", "password": "synthetic-secret"}
        rejected = bridge.dispatch("login", MappingProxyType(values))
        self.assertEqual(rejected, {"status": "error", "error": {"code": "arguments_rejected"}})
        self.assertEqual(calls, [])
        accepted = bridge.dispatch("login", dict(values))
        self.assertEqual(accepted["data"]["kind"], "mfa_required")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["retry_attempts"], 0)
        self.assertIsNone(bridge.take_persistable_tokens())
        self.assertEqual(values, {"email": "owner", "password": "synthetic-secret"})

    def test_benchmark_canonical_float_json_can_expand_past_one_mb_without_client_creation(self):
        # Canonical dumps expands each short 1e15 float to full decimal text.
        padding = json.dumps(["x" * 15990] * 61, separators=(",", ":"))
        numbers = "[" + ",".join(["1e15"] * 4800) + "]"
        payload = '{"padding":' + padding + ',"numbers":' + numbers + '}'
        self.assertLessEqual(len(payload), 1_000_000)
        result = garmin_bridge.dispatch("benchmarkDeterministicJson", {"payloadJson": payload})
        self.assertGreater(len(result["normalizedJson"]), 1_000_000)
        self.assertLess(len(result["normalizedJson"]), 2_000_000)
        self.assertEqual(json.loads(result["normalizedJson"]), json.loads(payload))

    def test_logout_and_reauth_reuse_a_stable_opaque_namespace_for_the_same_account(self):
        first = garmin_bridge.create_bridge(client_factory=lambda **_kwargs: FakeClient())
        second = garmin_bridge.create_bridge(client_factory=lambda **_kwargs: FakeClient())
        different = garmin_bridge.create_bridge(client_factory=lambda **_kwargs: type(
            "OtherClient",
            (FakeClient,),
            {"dumps": lambda self: json.dumps({"di_token": "fixture-1", "di_refresh_token": "fixture-refresh", "di_client_id": "other-client"})},
        )())

        first_connected = first.dispatch("login", {"email": "owner@example.test", "password": "synthetic-secret"})
        first.dispatch("logout", {})
        second_connected = second.dispatch("login", {"email": "renamed@example.test", "password": "synthetic-secret"})
        different_connected = different.dispatch("login", {"email": "other@example.test", "password": "synthetic-secret"})

        self.assertEqual(first_connected["data"]["account_namespace"], second_connected["data"]["account_namespace"])
        self.assertNotEqual(first_connected["data"]["account_namespace"], different_connected["data"]["account_namespace"])
        self.assertRegex(first_connected["data"]["account_namespace"], r"^garmin:[a-f0-9]{32}$")
        self.assertNotRegex(
            json.dumps([first_connected, second_connected, different_connected]),
            r"owner@example|renamed@example|other@example|fixture-client|other-client",
        )

    def test_account_namespace_is_locally_generated_and_survives_profile_rename(self):
        namespace = ACCOUNT_NAMESPACE
        first_client = FakeClient()
        first_client.display_name = "synthetic-owner@example.test"
        first = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: first_client,
            namespace_factory=lambda: namespace,
        )

        connected = first.dispatch(
            "login",
            {"email": "synthetic-owner@example.test", "password": "synthetic-secret"},
        )
        persisted = first.take_persistable_tokens()

        renamed_client = FakeClient()
        renamed_client.display_name = "Renamed Owner"
        restored_bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: renamed_client,
            namespace_factory=lambda: "garmin:ffffffffffffffffffffffffffffffff",
        )
        restored = restored_bridge.dispatch("restoreSession", {"tokenPayload": persisted})

        self.assertEqual(connected["data"]["account_namespace"], namespace)
        self.assertEqual(restored["data"]["account_namespace"], namespace)
        self.assertNotRegex(json.dumps([connected, restored]), r"synthetic-owner|Renamed Owner|@")

    def test_login_mfa_and_reads_use_only_the_fixed_operations(self):
        fake = FakeClient(needs_mfa=True)
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: fake,
            handle_factory=lambda: "opaque-challenge",
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        login_arguments = {"email": "owner", "password": "synthetic-secret"}

        pending = bridge.dispatch("login", login_arguments)
        self.assertEqual(
            pending,
            {
                "status": "ok",
                "generation": 1,
                "data": {"kind": "mfa_required", "challenge_handle": "opaque-challenge"},
            },
        )
        self.assertEqual(login_arguments, {})

        mfa_arguments = {"challengeHandle": "opaque-challenge", "code": "123456"}
        connected = bridge.dispatch("resumeMfa", mfa_arguments)
        self.assertEqual(connected["generation"], 1)
        self.assertEqual(connected["data"], {"kind": "connected", "account_namespace": ACCOUNT_NAMESPACE})
        self.assertEqual(mfa_arguments, {})

        page = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
        activity = bridge.dispatch("getActivity", {"externalActivityId": "42"})
        splits = bridge.dispatch("getActivitySplits", {"externalActivityId": "42"})
        details = bridge.dispatch(
            "getActivityDetails",
            {"externalActivityId": "42", "maxchart": 2000, "maxpoly": 4000},
        )

        self.assertEqual(page["data"]["items"][0]["activityId"], 42)
        self.assertEqual(activity["data"], {"activityId": 42})
        self.assertEqual(splits["data"], {"lapDTOs": []})
        self.assertEqual(details["data"], {"metricDescriptors": [], "activityDetailMetrics": []})
        self.assertIn(("get_activity_details", "42", 2000, 4000), fake.calls)
        self.assertNotRegex(json.dumps([pending, connected, page, activity, splits, details]), r"synthetic-secret|123456|di_token|traceback|https?://")

    def test_unknown_operations_and_malformed_inputs_never_reach_the_client(self):
        fake = FakeClient()
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: fake,
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )

        for operation, arguments in (
            ("eval", {}),
            ("get_activity", {"externalActivityId": "42"}),
            ("getActivity", {"externalActivityId": "activity/42"}),
            ("getActivities", {"start": -1, "limit": 1, "activityType": "running"}),
            ("getActivities", {"start": 0, "limit": 51, "activityType": "running"}),
            ("getActivityDetails", {"externalActivityId": "42", "maxchart": 1, "maxpoly": 4000}),
        ):
            result = bridge.dispatch(operation, arguments)
            self.assertEqual(result["status"], "error")
            self.assertIn(result["error"]["code"], {"operation_rejected", "arguments_rejected"})

        self.assertEqual(fake.calls, [])

    def test_restore_rotation_and_logout_keep_tokens_out_of_dispatch_results(self):
        fake = FakeClient()
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: fake,
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        restore_arguments = {
            "tokenPayload": (
                b'{"account_namespace":"garmin:abcdefabcdefabcdefabcdefabcdefab",'
                b'"di_client_id":"fixture-client","di_refresh_token":"fixture-refresh","di_token":"fixture"}'
            )
        }

        restored = bridge.dispatch("restoreSession", restore_arguments)
        first_tokens = bridge.take_persistable_tokens()
        read = bridge.dispatch("getActivity", {"externalActivityId": "42"})
        rotated_tokens = bridge.take_persistable_tokens()
        logged_out = bridge.dispatch("logout", {})
        after_logout = bridge.dispatch("getActivity", {"externalActivityId": "42"})

        self.assertEqual(restored["data"]["kind"], "connected")
        self.assertEqual(restore_arguments, {})
        self.assertIsInstance(first_tokens, bytes)
        self.assertIsInstance(rotated_tokens, bytes)
        self.assertNotIn("token", json.dumps([restored, read, logged_out, after_logout]))
        self.assertEqual(logged_out["generation"], restored["generation"] + 1)
        self.assertEqual(after_logout, {"status": "error", "error": {"code": "sign_in_required"}})

    def test_force_refresh_rotates_the_persistable_record_without_exposing_tokens(self):
        fake = FakeClient()
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: fake,
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        bridge.dispatch("login", {"email": "owner", "password": "synthetic-secret"})
        before = bridge.take_persistable_tokens()

        result = bridge.dispatch("forceRefreshForTest", {})
        after = bridge.take_persistable_tokens()

        self.assertEqual(result["data"], {"kind": "connected", "account_namespace": ACCOUNT_NAMESPACE})
        self.assertNotEqual(before, after)
        self.assertEqual(fake.calls[-1], ("force_refresh", None))
        self.assertNotIn("token", json.dumps(result))

    def test_authentication_and_restore_failures_are_context_specific(self):
        invalid = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: (_ for _ in ()).throw(provider_error("GarminConnectAuthenticationError"))
        )
        invalid_result = invalid.dispatch("login", {"email": "owner", "password": "synthetic-secret"})

        mfa_client = FakeClient(needs_mfa=True)
        mfa_client.resume_login = lambda _state, _code: (_ for _ in ()).throw(provider_error("GarminConnectAuthenticationError"))
        mfa = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: mfa_client,
            handle_factory=lambda: "opaque-challenge",
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        mfa.dispatch("login", {"email": "owner", "password": "synthetic-secret"})
        mfa_result = mfa.dispatch("resumeMfa", {"challengeHandle": "opaque-challenge", "code": "123456"})

        restore_client = FakeClient()
        restore_client.login = lambda tokenstore=None: (_ for _ in ()).throw(provider_error("GarminConnectAuthenticationError"))
        restore = garmin_bridge.create_bridge(client_factory=lambda **_kwargs: restore_client)
        restore_result = restore.dispatch(
            "restoreSession",
            {
                "tokenPayload": (
                    b'{"account_namespace":"garmin:abcdefabcdefabcdefabcdefabcdefab",'
                    b'"di_client_id":"fixture-client","di_refresh_token":"fixture-refresh","di_token":"fixture"}'
                )
            },
        )
        corrupt_result = restore.dispatch("restoreSession", {"tokenPayload": b"not-json"})

        self.assertEqual(invalid_result, {"status": "error", "error": {"code": "invalid_credentials"}})
        self.assertEqual(mfa_result, {"status": "error", "error": {"code": "mfa_expired"}})
        self.assertEqual(restore_result, {"status": "error", "error": {"code": "sign_in_required"}})
        self.assertEqual(corrupt_result, {"status": "error", "error": {"code": "sign_in_required"}})
        self.assertTrue(logging.getLogger("garminconnect").disabled)

    def test_read_failures_are_distinct_bounded_and_single_attempt(self):
        cases = (
            (provider_error("GarminConnectConnectionError", status=403), "data_access_denied", None),
            (provider_error("GarminConnectTooManyRequestsError", status=429, retry_after="999999"), "rate_limited", 900000),
            (ConnectionError("synthetic-secret"), "offline", None),
            (TimeoutError("synthetic-secret"), "timeout", None),
            (provider_error("GarminConnectConnectionError", status=503), "temporary_failure", None),
        )
        for failure, code, retry_after_ms in cases:
            with self.subTest(code=code):
                fake = FakeClient()
                bridge = garmin_bridge.create_bridge(
                    client_factory=lambda **_kwargs: fake,
                    namespace_factory=lambda: ACCOUNT_NAMESPACE,
                )
                bridge.dispatch("login", {"email": "owner", "password": "synthetic-secret"})
                fake.calls.clear()

                def fail_once(_activity_id):
                    fake.calls.append(("get_activity", "called"))
                    raise failure

                fake.get_activity = fail_once
                result = bridge.dispatch("getActivity", {"externalActivityId": "42"})

                expected = {"status": "error", "error": {"code": code}}
                if retry_after_ms is not None:
                    expected["error"]["retryAfterMs"] = retry_after_ms
                self.assertEqual(result, expected)
                self.assertEqual(fake.calls, [("get_activity", "called")])
                self.assertNotRegex(json.dumps(result), r"synthetic-secret|private endpoint|traceback|https?://|42")

    def test_malformed_or_forbidden_provider_json_is_rejected_without_echo(self):
        for payload in (
            object(),
            {"token": "synthetic-secret"},
            {"location": "https://private.invalid/path"},
            {"value": float("nan")},
        ):
            with self.subTest(payload_type=type(payload).__name__):
                fake = FakeClient()
                bridge = garmin_bridge.create_bridge(
                    client_factory=lambda **_kwargs: fake,
                    namespace_factory=lambda: ACCOUNT_NAMESPACE,
                )
                bridge.dispatch("login", {"email": "owner", "password": "synthetic-secret"})
                fake.get_activity = lambda _activity_id: payload

                result = bridge.dispatch("getActivity", {"externalActivityId": "42"})

                self.assertEqual(result, {"status": "error", "error": {"code": "malformed_response"}})
                self.assertNotRegex(json.dumps(result), r"synthetic-secret|private|traceback|https?://|42")

    def test_bounded_helpers_and_default_factory_cover_rejection_edges(self):
        class DefaultClient:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        with patch.dict(sys.modules, {"garminconnect": SimpleNamespace(Garmin=DefaultClient)}):
            self.assertEqual(garmin_bridge._default_client_factory(email="owner").kwargs, {"email": "owner"})

        for arguments in (None, [], {"unexpected": True}):
            with self.assertRaisesRegex(garmin_bridge._BridgeInputError, "arguments_rejected"):
                garmin_bridge._exact_arguments(arguments, set())
        self.assertIsNone(garmin_bridge._bounded_json(None))
        self.assertTrue(garmin_bridge._bounded_json(True))
        self.assertEqual(garmin_bridge._bounded_json(1.5), 1.5)
        for value, kwargs in (
            (9_007_199_254_740_992, {}),
            ({"ok": True}, {"depth": 17}),
            ({"ok": True}, {"budget": [25_000]}),
        ):
            with self.assertRaisesRegex(garmin_bridge._BridgeInputError, "malformed_response"):
                garmin_bridge._bounded_json(value, **kwargs)
        for value in (
            "not-a-dict",
            {"activityId": 1},
            {"activityId": "1", "activityType": {"typeKey": "walking"}},
        ):
            with self.assertRaisesRegex(garmin_bridge._BridgeInputError, "malformed_response"):
                garmin_bridge._running_discovery_item(value)
        with self.assertRaisesRegex(garmin_bridge._BridgeInputError, "malformed_response"):
            garmin_bridge._safe_namespace("provider-account")
        self.assertIsInstance(garmin_bridge.create_bridge(), garmin_bridge.GarminBridge)
        default_handle = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: FakeClient(needs_mfa=True),
        )
        with patch.object(garmin_bridge.secrets, "token_urlsafe", return_value="opaque-default-challenge") as token_urlsafe:
            result = default_handle.dispatch("login", {"email": "owner", "password": "synthetic-secret"})
        token_urlsafe.assert_called_once_with(24)
        self.assertEqual(result["data"], {
            "kind": "mfa_required", "challenge_handle": "opaque-default-challenge",
        })

    def test_session_state_and_auth_validation_fail_closed(self):
        bridge = garmin_bridge.create_bridge()
        self.assertEqual(bridge.dispatch("connectionState", {}), {
            "status": "ok", "generation": 0, "data": {"kind": "disconnected"},
        })
        bridge._capture_tokens()
        with self.assertRaisesRegex(garmin_bridge._BridgeInputError, "sign_in_required"):
            bridge._read_token_data()

        for email, password in (("", "secret"), ("owner", "")):
            self.assertEqual(
                bridge.dispatch("login", {"email": email, "password": password}),
                {"status": "error", "error": {"code": "arguments_rejected"}},
            )

        malformed_handle = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: FakeClient(needs_mfa=True),
            handle_factory=lambda: "short",
        )
        self.assertEqual(
            malformed_handle.dispatch("login", {"email": "owner", "password": "secret"}),
            {"status": "error", "error": {"code": "malformed_response"}},
        )

        pending = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: FakeClient(needs_mfa=True),
            handle_factory=lambda: "opaque-challenge",
        )
        pending.dispatch("login", {"email": "owner", "password": "secret"})
        self.assertEqual(pending.dispatch("connectionState", {})["data"]["kind"], "mfa_required")
        for arguments, code in (
            ({"challengeHandle": "different-handle", "code": "123456"}, "mfa_expired"),
            ({"challengeHandle": "opaque-challenge", "code": "abc"}, "arguments_rejected"),
        ):
            self.assertEqual(pending.dispatch("resumeMfa", arguments)["error"]["code"], code)

        for payload in (b"", b'{}', b'{"account_namespace":"invalid","di_client_id":"x","di_refresh_token":"y","di_token":"z"}'):
            restored = bridge.dispatch("restoreSession", {"tokenPayload": payload})
            self.assertEqual(restored, {"status": "error", "error": {"code": "sign_in_required"}})

        for dumped in ("", "not-json", json.dumps({"di_token": "x"})):
            fake = FakeClient()
            fake.dumps = lambda dumped=dumped: dumped
            invalid_tokens = garmin_bridge.create_bridge(
                client_factory=lambda **_kwargs: fake,
                namespace_factory=lambda: ACCOUNT_NAMESPACE,
            )
            self.assertEqual(
                invalid_tokens.dispatch("login", {"email": "owner", "password": "secret"}),
                {"status": "error", "error": {"code": "sign_in_required"}},
            )

    def test_activity_refresh_and_adversarial_branches_are_bounded(self):
        for activities in ("not-a-list", [{"activityId": 1}, {"activityId": 2}]):
            fake = FakeClient()
            fake.get_activities = lambda *_args, activities=activities: activities
            bridge = garmin_bridge.create_bridge(
                client_factory=lambda **_kwargs: fake,
                namespace_factory=lambda: ACCOUNT_NAMESPACE,
            )
            bridge.dispatch("login", {"email": "owner", "password": "secret"})
            result = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
            self.assertEqual(result, {"status": "error", "error": {"code": "malformed_response"}})

        fake = FakeClient()
        fake.get_activities = lambda *_args: [DISCOVERY_FIXTURE]
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: fake,
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        bridge.dispatch("login", {"email": "owner", "password": "secret"})
        single_page = bridge.dispatch("getActivities", {"start": 0, "limit": 2, "activityType": "running"})
        self.assertEqual(len(single_page["data"]["items"]), 1)
        self.assertEqual(single_page["data"]["items"][0]["activityType"], {"typeKey": "running"})
        self.assertNotIn("nextStart", single_page["data"])

        no_refresh = FakeClient()
        no_refresh._refresh_di_token = None
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: no_refresh,
            namespace_factory=lambda: ACCOUNT_NAMESPACE,
        )
        bridge.dispatch("login", {"email": "owner", "password": "secret"})
        self.assertEqual(
            bridge.dispatch("forceRefreshForTest", {}),
            {"status": "error", "error": {"code": "operation_rejected"}},
        )
        self.assertEqual(
            bridge.dispatch("runAdversarialSuite", {"confirmation": "wrong"}),
            {"status": "error", "error": {"code": "arguments_rejected"}},
        )
        self.assertEqual(
            bridge.dispatch("runAdversarialSuite", {
                "confirmation": "VERIFY-PHASE18-GARMIN-ADVERSARIAL",
            }),
            {"status": "error", "error": {"code": "arguments_rejected"}},
        )

    def test_adversarial_control_uses_the_real_bridge_seam_without_live_transport(self):
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: self.fail("live client factory must not be called"),
        )
        confirmation = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"

        prepared = bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "start",
        })
        token_payload = bridge.take_persistable_tokens()
        self.assertEqual(prepared["status"], "ok")
        self.assertIsInstance(token_payload, bytes)
        self.assertNotRegex(json.dumps(prepared), r"token|credential|route|heart|https?://")

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "reset",
        })
        restored = bridge.dispatch("restoreSession", {"tokenPayload": token_payload})
        bridge.take_persistable_tokens()
        self.assertEqual(restored["data"], {
            "kind": "connected",
            "account_namespace": ACCOUNT_NAMESPACE,
        })

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "configure",
            "caseId": "PH18-ADV-READ",
        })
        page = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
        identifier = str(page["data"]["items"][0]["activityId"])
        bridge.dispatch("getActivity", {"externalActivityId": identifier})
        bridge.dispatch("getActivitySplits", {"externalActivityId": identifier})
        bridge.dispatch("getActivityDetails", {
            "externalActivityId": identifier,
            "maxchart": 2000,
            "maxpoly": 4000,
        })
        observed = bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        })["data"]

        self.assertEqual(observed["operation_counts"], {
            "getActivities": 1,
            "getActivity": 1,
            "getActivitySplits": 1,
            "getActivityDetails": 1,
        })
        self.assertEqual(observed["automatic_retry_count"], 0)
        self.assertEqual(set(observed), {
            "automatic_retry_count",
            "operation_counts",
            "source_components",
        })
        self.assertEqual(set(observed["source_components"]), {
            "activity",
            "splits",
            "details",
        })
        self.assertNotIn("source_write_count", observed)
        self.assertNotIn("history_digest", observed)
        self.assertNotIn("source_digest", observed)
        self.assertNotIn("match_digest", observed)

    def test_adversarial_controlled_client_refresh_rotates_only_the_di_token(self):
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: self.fail("live client factory must not be called"),
        )
        confirmation = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"
        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "start",
        })
        bootstrap_tokens = bridge.take_persistable_tokens()
        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "reset",
        })

        restored = bridge.dispatch("restoreSession", {"tokenPayload": bootstrap_tokens})
        before = json.loads(bridge.take_persistable_tokens())
        refreshed = bridge.dispatch("forceRefreshForTest", {})
        after = json.loads(bridge.take_persistable_tokens())

        connected = {"kind": "connected", "account_namespace": ACCOUNT_NAMESPACE}
        self.assertEqual(restored["data"], connected)
        self.assertEqual(refreshed["data"], connected)
        self.assertNotEqual(before["di_token"], after["di_token"])
        self.assertEqual(
            {key: value for key, value in before.items() if key != "di_token"},
            {key: value for key, value in after.items() if key != "di_token"},
        )
        self.assertNotIn("token", json.dumps([restored, refreshed]))

    def test_adversarial_control_rejects_invalid_or_out_of_sequence_actions(self):
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: self.fail("live client factory must not be called"),
        )
        confirmation = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"
        rejected = {"status": "error", "error": {"code": "arguments_rejected"}}

        self.assertEqual(bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        }), rejected)
        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "start",
        })

        for request in (
            {"confirmation": confirmation, "action": "configure", "caseId": 42},
            {"confirmation": confirmation, "action": "configure", "caseId": "PH18-ADV-UNKNOWN"},
            {"confirmation": confirmation, "action": "unknown"},
        ):
            with self.subTest(request=request):
                self.assertEqual(bridge.dispatch("runAdversarialSuite", request), rejected)

        observed = bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        })
        self.assertEqual(observed["data"]["operation_counts"], {})

    def test_adversarial_control_injects_every_failure_once_and_fences_late_results(self):
        bridge = garmin_bridge.create_bridge(
            client_factory=lambda **_kwargs: self.fail("live client factory must not be called"),
        )
        confirmation = "VERIFY-PHASE18-GARMIN-ADVERSARIAL"
        bridge.dispatch("runAdversarialSuite", {"confirmation": confirmation, "action": "start"})
        token_payload = bridge.take_persistable_tokens()
        bridge.dispatch("runAdversarialSuite", {"confirmation": confirmation, "action": "reset"})
        bridge.dispatch("restoreSession", {"tokenPayload": token_payload})
        bridge.take_persistable_tokens()

        cases = (
            ("PH18-ADV-403", "data_access_denied", 0),
            ("PH18-ADV-429", "rate_limited", 900_000),
            ("PH18-ADV-OFFLINE", "offline", 0),
            ("PH18-ADV-TIMEOUT", "timeout", 0),
            ("PH18-ADV-5XX", "temporary_failure", 0),
            ("PH18-ADV-MALFORMED", "malformed_response", 0),
            ("PH18-ADV-OVERSIZED", "malformed_response", 0),
        )
        for case_id, code, retry_after_ms in cases:
            with self.subTest(case_id=case_id):
                bridge.dispatch("runAdversarialSuite", {
                    "confirmation": confirmation,
                    "action": "configure",
                    "caseId": case_id,
                })
                failure = bridge.dispatch("getActivities", {
                    "start": 0,
                    "limit": 1,
                    "activityType": "running",
                })
                self.assertEqual(failure["status"], "error")
                self.assertEqual(failure["error"]["code"], code)
                self.assertEqual(failure["error"].get("retryAfterMs", 0), retry_after_ms)
                observed = bridge.dispatch("runAdversarialSuite", {
                    "confirmation": confirmation,
                    "action": "observe",
                })["data"]
                self.assertEqual(observed["operation_counts"], {"getActivities": 1})
                self.assertEqual(observed["automatic_retry_count"], 0)

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "configure",
            "caseId": "PH18-ADV-MISSING-COMPONENT",
        })
        page = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
        identifier = str(page["data"]["items"][0]["activityId"])
        bridge.dispatch("getActivity", {"externalActivityId": identifier})
        missing = bridge.dispatch("getActivitySplits", {"externalActivityId": identifier})
        self.assertIsNone(missing["data"])
        self.assertEqual(bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        })["data"]["operation_counts"], {
            "getActivities": 1,
            "getActivity": 1,
            "getActivitySplits": 1,
        })

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "configure",
            "caseId": "PH18-ADV-PARTIAL-PAGE",
        })
        page = bridge.dispatch("getActivities", {"start": 0, "limit": 2, "activityType": "running"})
        first, second = [str(item["activityId"]) for item in page["data"]["items"]]
        bridge.dispatch("getActivity", {"externalActivityId": first})
        bridge.dispatch("getActivitySplits", {"externalActivityId": first})
        bridge.dispatch("getActivityDetails", {
            "externalActivityId": first, "maxchart": 2000, "maxpoly": 4000,
        })
        partial = bridge.dispatch("getActivity", {"externalActivityId": second})
        self.assertEqual(partial, {"status": "error", "error": {"code": "temporary_failure"}})
        self.assertEqual(sum(bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        })["data"]["operation_counts"].values()), 5)

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "configure",
            "caseId": "PH18-ADV-ROTATION",
        })
        page = bridge.dispatch("getActivities", {"start": 0, "limit": 1, "activityType": "running"})
        identifier = str(page["data"]["items"][0]["activityId"])
        bridge.take_persistable_tokens()
        bridge.dispatch("getActivity", {"externalActivityId": identifier})
        bridge.take_persistable_tokens()
        bridge.dispatch("getActivitySplits", {"externalActivityId": identifier})
        self.assertIsInstance(bridge.take_persistable_tokens(), bytes)
        self.assertEqual(sum(bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "observe",
        })["data"]["operation_counts"].values()), 3)

        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "configure",
            "caseId": "PH18-ADV-LATE-GENERATION",
        })
        result = {}
        delayed = threading.Thread(target=lambda: result.update(bridge.dispatch(
            "getActivities",
            {"start": 0, "limit": 1, "activityType": "running"},
        )))
        delayed.start()
        started = bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "awaitLateStart",
        })
        self.assertTrue(started["data"]["started"])
        before_logout = bridge._generation
        bridge.dispatch("logout", {})
        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "releaseLate",
        })
        delayed.join(timeout=2)
        self.assertFalse(delayed.is_alive())
        self.assertEqual(result["generation"], before_logout)
        self.assertGreater(bridge._generation, result["generation"])
        bridge.dispatch("runAdversarialSuite", {
            "confirmation": confirmation,
            "action": "finish",
        })

    def test_module_entrypoints_and_retry_headers_fail_closed(self):
        self.assertEqual(garmin_bridge.dispatch("runtimeInfo", {})["schemaVersion"], 1)
        payload = '{"z":2,"a":{"distance":5000,"laps":[1,2]}}'
        benchmark = garmin_bridge.dispatch("benchmarkDeterministicJson", {"payloadJson": payload})
        self.assertEqual(benchmark["transport"], "chaquopy-python-garminconnect-0.3.17")
        self.assertEqual(benchmark["normalizedJson"], '{"a":{"distance":5000,"laps":[1,2]},"z":2}')
        self.assertEqual(benchmark["payloadSha256"], __import__("hashlib").sha256(payload.encode()).hexdigest())
        self.assertEqual(benchmark["outputSha256"], __import__("hashlib").sha256(benchmark["normalizedJson"].encode()).hexdigest())
        with self.assertRaisesRegex(ValueError, "garmin_bridge_arguments_rejected"):
            garmin_bridge.dispatch("benchmarkDeterministicJson", {"payloadJson": "{}", "unexpected": True})
        with self.assertRaisesRegex(ValueError, "garmin_bridge_arguments_rejected"):
            garmin_bridge.dispatch("benchmarkDeterministicJson", {"payloadJson": ""})
        for arguments in (None, {"unexpected": True}):
            with self.assertRaisesRegex(ValueError, "garmin_bridge_arguments_rejected"):
                garmin_bridge.dispatch("runtimeInfo", arguments)
        with self.assertRaisesRegex(ValueError, "garmin_bridge_request_rejected"):
            garmin_bridge.dispatch("unknown", {})
        self.assertEqual(garmin_bridge.dispatch("connectionState", {})["status"], "ok")
        self.assertIsNone(garmin_bridge.take_persistable_tokens())

        original_operations = garmin_bridge._OPERATIONS
        try:
            garmin_bridge._OPERATIONS = frozenset((*original_operations, "unhandled"))
            self.assertEqual(
                garmin_bridge.create_bridge().dispatch("unhandled", {}),
                {"status": "error", "error": {"code": "operation_rejected"}},
            )
        finally:
            garmin_bridge._OPERATIONS = original_operations

        self.assertIsNone(garmin_bridge.GarminBridge._retry_after_ms(None))
        self.assertIsNone(garmin_bridge.GarminBridge._retry_after_ms(
            SimpleNamespace(headers={"Retry-After": "invalid"}),
        ))
        root = RuntimeError("root")
        current = root
        for index in range(4):
            next_error = RuntimeError(f"layer-{index}")
            current.__cause__ = next_error
            current = next_error
        self.assertEqual(
            garmin_bridge.GarminBridge._classify_error(root, "getActivity"),
            ("temporary_failure", None),
        )

    def test_phase20_rejection_and_recovery_extensions_are_operation_backed(self):
        self.assertEqual(garmin_bridge.evidence_rejections(), {
            "operation_rejection": "operation_rejected",
            "arguments_rejection": "arguments_rejected",
        })
        rows = garmin_bridge.evidence_recovery_extensions()
        self.assertEqual([row["id"] for row in rows], [
            "PH18-ADV-EXPIRED", "PH18-ADV-401", "PH18-ADV-TRUNCATED",
            "PH18-ADV-UNSUPPORTED-JSON",
        ])
        self.assertEqual([row["code"] for row in rows], [
            "sign_in_required", "sign_in_required", "malformed_response",
            "malformed_response",
        ])
        self.assertEqual([row["call_count"] for row in rows], [2, 2, 4, 5])
        self.assertTrue(all(row["automatic_retry_count"] == 0 for row in rows))

    def test_phase20_recovery_extension_control_flow_covers_restore_rejection_and_complete_reads(self):
        original_bridge = garmin_bridge.GarminBridge

        class CoverageBridge:
            def __init__(self):
                self._adversarial = None

            def dispatch(self, operation, _arguments):
                mode = self._adversarial.mode
                if operation == "restoreSession" and mode == "PH18-ADV-EXPIRED":
                    return {"status": "error", "error": {"code": "sign_in_required"}}
                if operation == "getActivities":
                    return {"status": "ok", "data": {"items": [{"activityId": 42}]}}
                return {"status": "ok", "data": {}}

            def _clear_client(self):
                return None

        try:
            garmin_bridge.GarminBridge = CoverageBridge
            rows = garmin_bridge.evidence_recovery_extensions()
        finally:
            garmin_bridge.GarminBridge = original_bridge
        self.assertEqual(len(rows), 4)


if __name__ == "__main__":
    unittest.main()
