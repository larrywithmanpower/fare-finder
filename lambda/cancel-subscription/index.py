"""POST /cancel —— 取消訂閱

綠界跟 Stripe 不一樣：取消是**我們主動打 API**，不是等事件進來。

而且取消**給寬限期**：狀態寫成 cancelled（不是 expired），current_period_end 保留，
使用者在本期結束前仍然收得到降價通知。真正轉 expired 是 parser 掃到過期時做的。
"""
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))
SM = boto3.client("secretsmanager")
SQS = boto3.client("sqs")
STATUS_QUEUE_URL = os.environ["STATUS_QUEUE_URL"]

ACTION_STAGE = "https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction"
ACTION_PROD = "https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction"

_ecpay_cache = {}

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}


def ecpay_url_encode(s):
    e = urllib.parse.quote_plus(str(s)).replace("~", "%7E")
    e = e.lower()
    for old, new in (
        ("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"),
        ("%2a", "*"), ("%28", "("), ("%29", ")"),
    ):
        e = e.replace(old, new)
    return e


def gen_check_mac_value(params, hash_key, hash_iv):
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}
    body = "&".join("%s=%s" % (k, items[k]) for k in sorted(items, key=str.lower))
    raw = "HashKey=%s&%s&HashIV=%s" % (hash_key, body, hash_iv)
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


def _ecpay_conf():
    if not _ecpay_cache:
        _ecpay_cache.update(json.loads(SM.get_secret_value(SecretId="flight/ecpay")["SecretString"]))
    return _ecpay_cache


def _resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def _parse_body(event):
    body = event.get("body", event)
    if isinstance(body, str):
        body = json.loads(body or "{}")
    return body or {}


def _ecpay_cancel(conf, trade_no):
    """打綠界的定期定額訂單作業，Action=Cancel。回 (ok, 回應文字)"""
    params = {
        "MerchantID": conf["merchant_id"],
        "MerchantTradeNo": trade_no,
        "Action": "Cancel",
        "TimeStamp": str(int(datetime.now(timezone.utc).timestamp())),
    }
    params["CheckMacValue"] = gen_check_mac_value(params, conf["hash_key"], conf["hash_iv"])
    url = ACTION_PROD if conf.get("env") == "production" else ACTION_STAGE
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8", "replace").strip()
        return True, text
    except Exception as exc:  # 綠界端失敗不該讓使用者取消不了，記下來就好
        return False, "%s: %s" % (type(exc).__name__, exc)


def handler(event, context):
    try:
        body = _parse_body(event)
    except (ValueError, TypeError):
        return _resp(400, {"error": "body 不是合法的 JSON"})

    email = (body.get("email") or "").strip().lower()
    route = (body.get("route") or "").strip()
    if not email or not route:
        return _resp(400, {"error": "email 與 route 必填"})

    row = TABLE.get_item(Key={"email": email, "route": route}).get("Item") or {}

    # 從來沒扣過款的列（draft / pending_payment / expired）沒有什麼好「取消」的,
    # 不必去打綠界的取消 API。這裡是軟刪除 —— 標記成 removed 收進「最近移除」,
    # 使用者後悔還能把目標價一起救回來, 30 天後由 parser-wrapper 真的刪掉。
    if row and row.get("subscription_status") != "active":
        if body.get("purge") or row.get("subscription_status") == "removed":
            TABLE.delete_item(Key={"email": email, "route": route})
            print("purged %s %s" % (email, route))
            return _resp(200, {"ok": True, "purged": True, "route": route})

        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression=(
                "SET subscription_status = :s, removed_at = :n, "
                "status_before_remove = :b, updated_at = :n"
            ),
            ExpressionAttributeValues={
                ":s": "removed",
                ":n": datetime.now(timezone.utc).isoformat(),
                ":b": row.get("subscription_status") or "draft",
            },
        )
        print("removed %s %s status=%s" % (email, route, row.get("subscription_status")))
        return _resp(200, {"ok": True, "removed": True, "route": route})
    if not row:
        return _resp(404, {"error": "找不到這筆訂閱"})

    status = row.get("subscription_status")
    if status in ("cancelled", "expired"):
        return _resp(200, {
            "ok": True,
            "already": True,
            "subscription_status": status,
            "current_period_end_date": row.get("current_period_end_date"),
        })

    now = datetime.now(timezone.utc)
    trade_no = row.get("merchant_trade_no")

    # 跟綠界說不要再扣款了。訂單不存在（90100150）在測試環境是正常的，照樣往下做本地取消。
    ecpay_ok, ecpay_msg = (False, "no merchant_trade_no on row")
    if trade_no:
        ecpay_ok, ecpay_msg = _ecpay_cancel(_ecpay_conf(), trade_no)
    print("ecpay cancel trade_no=%s ok=%s resp=%s" % (trade_no, ecpay_ok, ecpay_msg))

    # 沒有 current_period_end 的舊資料（M1 時代或 period 追蹤之前啟用的）補一個月，
    # 免得 parser 下一輪就把人當成過期砍掉
    period_end = row.get("current_period_end")
    if not period_end:
        period_end = (now + timedelta(days=30)).isoformat()
        print("no current_period_end, backfilled to %s" % period_end)

    end_date = period_end[:10]
    TABLE.update_item(
        Key={"email": email, "route": route},
        UpdateExpression=(
            "SET subscription_status = :s, current_period_end = :e, "
            "current_period_end_date = :ed, cancelled_at = :n, updated_at = :n"
        ),
        ExpressionAttributeValues={
            ":s": "cancelled",
            ":e": period_end,
            ":ed": end_date,
            ":n": now.isoformat(),
        },
    )
    print("cancelled %s %s, served until %s" % (email, route, end_date))

    SQS.send_message(
        QueueUrl=STATUS_QUEUE_URL,
        MessageBody=json.dumps({
            "event_type": "cancel",
            "email": email,
            "route": route,
            "route_label": row.get("plan_name"),
            "current_period_end_date": end_date,
        }, ensure_ascii=False),
    )

    return _resp(200, {
        "ok": True,
        "subscription_status": "cancelled",
        "current_period_end_date": end_date,
        "ecpay_ok": ecpay_ok,
    })
