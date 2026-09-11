"""訂閱航線 + 目標價 -> DynamoDB subscriptions

M1 不處理付款, 沒有 subscription_status 欄位 (那是 M2 的事)
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3

# 兩個固定方案, 寫死不另外開表
PLANS = {
    "tokyo": {"origin": "TPE", "destination": "TYO", "label": "台北 ✈ 東京"},
    "seoul": {"origin": "TPE", "destination": "SEL", "label": "台北 ✈ 首爾"},
}

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}


def _resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def _parse_body(event):
    """API Gateway 送進來的 body 是字串, 直接 invoke 測試時可能已經是 dict"""
    body = event.get("body", event)
    if isinstance(body, str):
        body = json.loads(body or "{}")
    return body or {}


def handler(event, context):
    try:
        body = _parse_body(event)
    except (ValueError, TypeError):
        return _resp(400, {"error": "body 不是合法的 JSON"})

    email = (body.get("email") or "").strip().lower()
    plan_name = (body.get("plan_name") or "").strip().lower()
    raw_price = body.get("target_price")

    if not email or "@" not in email:
        return _resp(400, {"error": "email 必填"})
    if plan_name not in PLANS:
        return _resp(400, {"error": f"plan_name 必須是 {sorted(PLANS)} 其中之一"})

    try:
        target_price = Decimal(str(raw_price))
    except (InvalidOperation, TypeError):
        return _resp(400, {"error": "target_price 必須是數字"})
    if target_price <= 0:
        return _resp(400, {"error": "target_price 必須大於 0"})

    plan = PLANS[plan_name]
    route = f"{plan['origin']}-{plan['destination']}"
    now = datetime.now(timezone.utc).isoformat()

    # 同一個 email + route 再送一次就是更新目標價, created_at 保留第一次的
    TABLE.update_item(
        Key={"email": email, "route": route},
        UpdateExpression=(
            "SET plan_name = :p, origin = :o, destination = :d, "
            "target_price = :t, currency = :c, updated_at = :u, "
            "created_at = if_not_exists(created_at, :u)"
        ),
        ExpressionAttributeValues={
            ":p": plan_name,
            ":o": plan["origin"],
            ":d": plan["destination"],
            ":t": target_price,
            ":c": "TWD",
            ":u": now,
        },
    )

    print(f"saved {email} {route} target={target_price} TWD")
    return _resp(200, {
        "ok": True,
        "email": email,
        "route": route,
        "plan_name": plan_name,
        "target_price": float(target_price),
        "currency": "TWD",
    })
