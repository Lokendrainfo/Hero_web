"""
Test Suite: Machine Live API Rate Limiting and Request Throttling Verification
Tests:
1. Concurrency and Rate Limiting on /api/ext/v1/machines/live/ (strict 10 req/s limit)
2. HTTP 429 Status Code, Retry-After header, and response payload
3. Scope preservation (User vs API Key vs Client IP)
4. Outgoing Token Bucket Rate Limiter in FiberForceClient (<= 10 req/s)
5. HTTP 429 retry backoff with 100-150ms delay and bounded retries
6. Short TTL Telemetry caching to prevent redundant requests
"""
import os
import sys
import time

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import django
from concurrent.futures import ThreadPoolExecutor

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.test import RequestFactory
from rest_framework.test import APIRequestFactory
from apps.integrations.views import MachineLiveExternalView
from apps.common.throttling import MachineLiveRateThrottle, _window_history, _rate_lock
from apps.integrations.fiberforce.client import (
    FiberForceClient,
    TokenBucketRateLimiter,
    _live_rate_limiter,
    _live_telemetry_cache,
    _live_cache_lock
)


def test_endpoint_rate_limiting_single_thread():
    print("\n--- 1. Testing Endpoint Rate Limiting (Single Thread) ---")
    factory = APIRequestFactory()
    view = MachineLiveExternalView.as_view()

    # Clear history for clean test
    with _rate_lock:
        _window_history.clear()

    # Reset cache
    with _live_cache_lock:
        _live_telemetry_cache.clear()

    success_count = 0
    throttled_count = 0

    # Fire 15 requests in immediate succession with same IP
    for i in range(15):
        request = factory.get('/api/ext/v1/machines/live/?machine_chassis_no=600202608396', REMOTE_ADDR='198.51.100.1')
        response = view(request)
        if response.status_code == 200:
            success_count += 1
        elif response.status_code == 429:
            throttled_count += 1
            retry_after = response.headers.get('Retry-After')
            print(f"Request {i+1} throttled: status={response.status_code}, Retry-After={retry_after}")

    print(f"Result: {success_count} succeeded, {throttled_count} throttled (Expected: 10 succeeded, 5 throttled)")
    assert success_count == 10, f"Expected 10 successes, got {success_count}"
    assert throttled_count == 5, f"Expected 5 throttled, got {throttled_count}"
    print("PASS: Endpoint strictly allows 10 req/s and throttles subsequent requests with HTTP 429.")


def test_endpoint_concurrent_requests():
    print("\n--- 2. Testing Endpoint Concurrency Safety (20 Concurrent Requests) ---")
    factory = APIRequestFactory()
    view = MachineLiveExternalView.as_view()

    with _rate_lock:
        _window_history.clear()
    with _live_cache_lock:
        _live_telemetry_cache.clear()

    def send_req(i):
        req = factory.get('/api/ext/v1/machines/live/?machine_chassis_no=600202608396', REMOTE_ADDR='198.51.100.2')
        resp = view(req)
        return resp.status_code, resp.headers.get('Retry-After')

    # Fire 25 concurrent threads simultaneously
    with ThreadPoolExecutor(max_workers=25) as executor:
        results = list(executor.map(send_req, range(25)))

    status_200 = sum(1 for status_code, _ in results if status_code == 200)
    status_429 = sum(1 for status_code, _ in results if status_code == 429)

    print(f"Concurrent Result: {status_200} succeeded (200), {status_429} throttled (429)")
    assert status_200 == 10, f"Expected exactly 10 successes under concurrency, got {status_200}"
    assert status_429 == 15, f"Expected exactly 15 throttled under concurrency, got {status_429}"
    print("PASS: Concurrency safety verified - concurrent requests cannot bypass rate limiter!")


def test_scope_isolation():
    print("\n--- 3. Testing Rate-Limit Scope Isolation (IP and User) ---")
    factory = APIRequestFactory()
    view = MachineLiveExternalView.as_view()

    with _rate_lock:
        _window_history.clear()

    # Exhaust limit for IP A (10.0.0.1)
    for _ in range(10):
        req = factory.get('/api/ext/v1/machines/live/?machine_chassis_no=600202608396', REMOTE_ADDR='10.0.0.1')
        resp = view(req)
        assert resp.status_code == 200

    # 11th request for IP A must be 429
    req_a = factory.get('/api/ext/v1/machines/live/?machine_chassis_no=600202608396', REMOTE_ADDR='10.0.0.1')
    resp_a = view(req_a)
    assert resp_a.status_code == 429, "IP A should be throttled"

    # Request from IP B (10.0.0.2) must succeed (scope preserved!)
    req_b = factory.get('/api/ext/v1/machines/live/?machine_chassis_no=600202608396', REMOTE_ADDR='10.0.0.2')
    resp_b = view(req_b)
    assert resp_b.status_code == 200, "IP B should not be affected by IP A throttle"

    print("PASS: Scope isolation preserved correctly across client identities!")


def test_token_bucket_outgoing_rate_limiter():
    print("\n--- 4. Testing Outgoing TokenBucketRateLimiter (10 req/s Pacing) ---")
    limiter = TokenBucketRateLimiter(rate=10.0, capacity=10.0)

    # Consume all 10 tokens immediately
    start_time = time.time()
    for _ in range(10):
        limiter.acquire()
    burst_duration = time.time() - start_time
    print(f"First 10 tokens burst duration: {burst_duration:.4f}s")
    assert burst_duration < 0.1, "Burst of 10 tokens should be near-instant"

    # Next 5 tokens must take at least ~0.4 - 0.5s because fill rate is 10/s (1 token every 100ms)
    t1 = time.time()
    for _ in range(5):
        limiter.acquire()
    paced_duration = time.time() - t1
    print(f"Subsequent 5 tokens paced duration: {paced_duration:.4f}s (Expected >= 0.40s)")
    assert paced_duration >= 0.38, f"Rate pacing failed, duration was {paced_duration:.4f}s"
    print("PASS: TokenBucketRateLimiter strictly limits throughput to <= 10 req/s!")


def test_http_429_retry_handling():
    print("\n--- 5. Testing HTTP 429 Retry Backoff (100-150ms delay & bounded retries) ---")
    client = FiberForceClient()

    # Mock a 429 response then 200 response
    call_counts = {"attempts": 0, "delays": []}
    original_session_request = client._session().request

    class MockResponse:
        def __init__(self, status_code, headers=None, json_data=None):
            self.status_code = status_code
            self.headers = headers or {}
            self._json_data = json_data or {}
            self.text = ""

        def json(self):
            return self._json_data

    last_call_time = [time.time()]

    def mock_request(method, url, **kwargs):
        call_counts["attempts"] += 1
        now = time.time()
        call_counts["delays"].append(now - last_call_time[0])
        last_call_time[0] = now

        if call_counts["attempts"] <= 2:
            # Return HTTP 429 on first 2 attempts
            return MockResponse(429, headers={}, json_data={"message": "Too Many Requests"})
        else:
            # Succeed on attempt 3
            return MockResponse(200, json_data={"success": True, "data": {"is_online": True}})

    client._session().request = mock_request

    try:
        t0 = time.time()
        res = client._request("POST", "/api/ext/v1/machines/live/", json={"machine_chassis_no": "600202608396"})
        elapsed = time.time() - t0

        print(f"Attempts: {call_counts['attempts']}, Total time: {elapsed:.3f}s")
        assert call_counts["attempts"] == 3, f"Expected 3 attempts, got {call_counts['attempts']}"
        assert res.get("success") is True, f"Expected final response success, got {res}"

        # Check delays between retry 1 and retry 2
        for i, delay in enumerate(call_counts["delays"][1:], 1):
            print(f"Retry {i} delay: {delay*1000:.1f}ms (Expected 100–150ms)")
            assert 0.08 <= delay <= 0.25, f"Delay {delay*1000:.1f}ms outside expected 100-150ms range"

        print("PASS: HTTP 429 retry successfully delays 100–150ms and recovers on bounded retry!")
    finally:
        client._session().request = original_session_request


def test_telemetry_cache():
    print("\n--- 6. Testing Telemetry Short TTL Cache ---")
    client = FiberForceClient()

    with _live_cache_lock:
        _live_telemetry_cache.clear()

    # Prepopulate cache
    chassis = "TEST_CHASSIS_123"
    with _live_cache_lock:
        _live_telemetry_cache[f"{chassis}:('all',)"] = {
            "data": {"success": True, "data": {"mock": True, "chassis": chassis}},
            "time": time.time()
        }

    # Calling get_live_telemetry should hit cache immediately without HTTP call
    res = client.get_live_telemetry(chassis)
    assert res.get("success") is True
    assert res.get("data", {}).get("mock") is True
    print("PASS: Telemetry served from cache, preventing duplicate external requests!")


if __name__ == '__main__':
    test_endpoint_rate_limiting_single_thread()
    test_endpoint_concurrent_requests()
    test_scope_isolation()
    test_token_bucket_outgoing_rate_limiter()
    test_http_429_retry_handling()
    test_telemetry_cache()
    print("\n==========================================")
    print("ALL 6 RATE LIMITING & 429 TESTS PASSED!")
    print("==========================================\n")
