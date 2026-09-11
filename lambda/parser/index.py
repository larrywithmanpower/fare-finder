"""查一條航線的最低票價, 達標的訂閱者丟進 SQS

判斷基準一律是 TWD (跟 target_price 同幣別), USD 只是信裡的補充行,
抓不到就省略, 絕不因此中斷整條航線。
"""
import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr

API = "https://api.travelpayouts.com/v1/prices/cheap"
UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"

SUBSCRIPTIONS = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))
SQS = boto3.client("sqs")
SECRETS = boto3.client("secretsmanager")

_token_cache = None


def get_token():
    """secret 只讀一次, 之後沿用 (Lambda 容器會重用)"""
    global _token_cache
    if _token_cache is None:
        raw = SECRETS.get_secret_value(SecretId="flight/travelpayouts")["SecretString"]
        _token_cache = json.loads(raw)["token"]
    return _token_cache


def next_month():
    """M1 不讓使用者選日期, 固定抓下個月"""
    today = date.today()
    first_of_this = today.replace(day=1)
    return (first_of_this + timedelta(days=32)).replace(day=1).strftime("%Y-%m")


def fetch_cheapest(origin, destination, month, token, currency):
    query = urllib.parse.urlencode({
        "origin": origin,
        "destination": destination,
        "depart_date": month,
        "currency": currency,
        "token": token,
    })
    req = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read())

    if not body.get("success") or not body.get("data"):
        return None
    offers = body["data"].get(destination) or {}
    if not offers:
        return None

    best = min(offers.values(), key=lambda o: o["price"])
    return {
        "price": best["price"],
        "currency": currency.upper(),
        "airline": best.get("airline"),
        "flight_number": best.get("flight_number"),
        # API 的欄位名是 departure_at / return_at, 不是 depart_date / return_date
        "depart_date": best.get("departure_at"),
        "return_date": best.get("return_at"),
    }


def handler(event, context):
    origin = event["origin"]
    destination = event["destination"]
    route = event.get("route") or f"{origin}-{destination}"
    plan_name = event.get("plan")
    month = next_month()
    token = get_token()

    # TWD 是判斷基準, 抓不到就整條航線收工
    cheapest = fetch_cheapest(origin, destination, month, token, "twd")
    if not cheapest:
        print(f"{route} {month} no TWD fare, skip")
        return {"route": route, "enqueued": 0, "reason": "no_twd_fare"}

    # USD 只是補充, 失敗照樣往下走
    cheapest_usd = None
    try:
        cheapest_usd = fetch_cheapest(origin, destination, month, token, "usd")
    except Exception as exc:  # noqa: BLE001 - USD 是 best-effort
        print(f"{route} USD fetch failed ({exc}), continuing TWD-only")

    price_twd = Decimal(str(cheapest["price"]))
    print(f"{route} {month} cheapest {price_twd} TWD ({cheapest.get('airline')})")

    # M1 沒有付款門檻, 只用 route 過濾, 不看 subscription_status
    subscribers = []
    kwargs = {"FilterExpression": Attr("route").eq(route)}
    while True:
        page = SUBSCRIPTIONS.scan(**kwargs)
        subscribers.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    queue_url = os.environ["FARE_QUEUE_URL"]
    enqueued = 0
    for sub in subscribers:
        target = Decimal(str(sub["target_price"]))
        if target < price_twd:
            continue
        message = {
            "email": sub["email"],
            "route": route,
            "plan_name": sub.get("plan_name") or plan_name,
            "target_price": float(target),
            "cheapest": cheapest,
        }
        if cheapest_usd:
            message["cheapest_usd"] = cheapest_usd
        SQS.send_message(QueueUrl=queue_url, MessageBody=json.dumps(message, ensure_ascii=False))
        enqueued += 1
        print(f"enqueued {sub['email']} {route} target={target} cheapest={price_twd}")

    print(f"{route}: {len(subscribers)} subscriber(s), {enqueued} matched")
    return {"route": route, "cheapest_twd": float(price_twd), "subscribers": len(subscribers), "enqueued": enqueued}
