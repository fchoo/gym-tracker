import json
import logging
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[2] / "main" / "python"))

import garmin_bridge

ACCOUNT_NAMESPACE = "garmin:abcdefabcdefabcdefabcdefabcdefab"


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
        return [{"activityId": 42, "activityType": {"typeKey": "running"}}]

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


if __name__ == "__main__":
    unittest.main()
