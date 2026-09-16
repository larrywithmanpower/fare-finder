"""查一批航線目前的最低票價 —— 純參考值, 給使用者決定目標價要設多少

GET /price?routes=TPE-TYO,TPE-LON
回 {"prices": {"TPE-TYO": {"price": 6385, "currency": "TWD"}, "TPE-LON": null}}

查不到的航線回 null 而不是報錯 —— 少一個參考價不該讓整個畫面壞掉。
票價半小時內不會有意義的變化, 所以在 Lambda 容器裡快取, 少打幾次 Travelpayouts。
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta

import boto3

API = "https://api.travelpayouts.com/v1/prices/cheap"
UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"
SECRETS = boto3.client("secretsmanager")

CACHE_TTL = int(os.environ.get("PRICE_CACHE_TTL", "1800"))  # 30 分, 跟排程同一個節奏
MAX_ROUTES = 12

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=600",
}

_token = None
_cache = {}  # route -> (到期時間, 結果)


def get_token():
    global _token
    if _token is None:
        raw = SECRETS.get_secret_value(SecretId="flight/travelpayouts")["SecretString"]
        _token = json.loads(raw)["token"]
    return _token


def next_month():
    today = date.today()
    return (today.replace(day=1) + timedelta(days=32)).replace(day=1).strftime("%Y-%m")


def fetch_cheapest(origin, destination, month, token):
    query = urllib.parse.urlencode({
        "origin": origin, "destination": destination,
        "depart_date": month, "currency": "twd", "token": token,
    })
    req = urllib.request.Request("%s?%s" % (API, query),
                                 headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        body = json.loads(resp.read())
    if not body.get("success"):
        return None
    offers = (body.get("data") or {}).get(destination) or {}
    if not offers:
        return None
    best = min(offers.values(), key=lambda o: o["price"])
    return {"price": best["price"], "currency": "TWD"}


def price_for(route, month, token):
    now = time.time()
    hit = _cache.get(route)
    if hit and hit[0] > now:
        return hit[1]

    parts = route.split("-")
    if len(parts) != 2 or not all(len(p) == 3 and p.isalpha() for p in parts):
        return None
    try:
        result = fetch_cheapest(parts[0], parts[1], month, token)
    except Exception as exc:  # noqa: BLE001 - 參考價查不到就算了
        print("price %s failed: %s" % (route, exc))
        return None

    _cache[route] = (now + CACHE_TTL, result)
    return result


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    raw = (params.get("routes") or "").strip().upper()
    routes = [r for r in (x.strip() for x in raw.split(",")) if r][:MAX_ROUTES]
    if not routes:
        return {"statusCode": 400, "headers": CORS,
                "body": json.dumps({"error": "routes 必填, 例如 routes=TPE-TYO,TPE-LON"})}

    month = next_month()
    token = get_token()
    prices = {route: price_for(route, month, token) for route in routes}
    print("priced %d route(s): %s" % (len(routes), ", ".join(routes)))
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps({"month": month, "prices": prices})}
