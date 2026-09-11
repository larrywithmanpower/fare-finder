"""查某個 email 的所有訂閱 -> 前端顯示「已訂閱」狀態

安全性注意: 這支完全相信 query string 傳來的 email, 沒有驗證身分。
課程階段可以, 正式產品要在這裡先驗 Supabase JWT。
"""
import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}


def _json_safe(value):
    """Decimal 轉回一般數字, 不然 json.dumps 會爆"""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    email = (params.get("email") or "").strip().lower()

    if not email or "@" not in email:
        return _resp(400, {"error": "email 必填"})

    result = TABLE.query(KeyConditionExpression=Key("email").eq(email))
    items = [_json_safe(item) for item in result.get("Items", [])]

    print(f"listed {email} -> {len(items)} subscription(s)")
    return _resp(200, {"email": email, "subscriptions": items})
