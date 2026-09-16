"""綠界 ReturnURL —— 定期定額「第一期」授權結果（付費狀態的唯一真相來源）

綠界是 server-to-server POST 進來的，跟使用者的瀏覽器有沒有關掉無關。
只有這支（和續扣的 flight-ecpay-period）會把 subscription_status 寫成 active。

回應必須是純文字 `1|OK`，回別的（JSON、HTML、引號、甚至只回 OK）綠界會重送 4 次。
"""
import hashlib
import json
import os
import urllib.parse
from base64 import b64decode
from datetime import datetime, timedelta, timezone

import boto3

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))
SM = boto3.client("secretsmanager")
SQS = boto3.client("sqs")
STATUS_QUEUE_URL = os.environ["STATUS_QUEUE_URL"]

_ecpay_cache = {}


# --- 綠界 CheckMacValue（官方測試向量驗過，勿自行簡化）---

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
    # 只丟掉 CheckMacValue 本身，**保留值為空字串的欄位**。
    # 綠界會送 CustomField3=&CustomField4= 並且把它們算進 MAC，
    # 過濾掉空字串會導致每一次真實 callback 都驗不過 —— 這是最常見的綠界 bug。
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}
    body = "&".join("%s=%s" % (k, items[k]) for k in sorted(items, key=str.lower))
    raw = "HashKey=%s&%s&HashIV=%s" % (hash_key, body, hash_iv)
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


# --- helpers ---

def _ecpay_conf():
    if not _ecpay_cache:
        _ecpay_cache.update(json.loads(SM.get_secret_value(SecretId="flight/ecpay")["SecretString"]))
    return _ecpay_cache


def _text(body, status=200):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "text/plain; charset=utf-8"},
        "body": body,
    }


def _parse_form(event):
    """綠界 callback 是 application/x-www-form-urlencoded，不是 JSON"""
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = b64decode(raw).decode("utf-8")
    # keep_blank_values=True 是必要的：空字串欄位要留著才算得出正確的 MAC
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}


def _add_period(start, period_type, frequency):
    """依綠界的週期種類往後推一期"""
    freq = int(frequency or 1)
    if period_type == "D":
        return start + timedelta(days=freq)
    if period_type == "Y":
        return start.replace(year=start.year + freq)
    # 預設 M：加 freq 個月，遇到月底天數不足就退到當月最後一天
    month = start.month - 1 + freq
    year = start.year + month // 12
    month = month % 12 + 1
    day = min(start.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return start.replace(year=year, month=month, day=day)


def handler(event, context):
    params = _parse_form(event)
    if not params:
        print("empty body")
        return _text("0|EmptyBody", 400)

    conf = _ecpay_conf()
    trade_no = params.get("MerchantTradeNo", "")

    # 1) 驗 CheckMacValue —— 沒過就什麼都不做
    expected = gen_check_mac_value(params, conf["hash_key"], conf["hash_iv"])
    received = (params.get("CheckMacValue") or "").upper()
    if received != expected:
        print("CMV mismatch trade_no=%s received=%s expected=%s" % (trade_no, received, expected))
        return _text("0|CheckMacValueInvalid", 400)

    # 2) 驗商店代號
    if params.get("MerchantID") != conf["merchant_id"]:
        print("merchant mismatch got=%s" % params.get("MerchantID"))
        return _text("0|MerchantMismatch", 400)

    email = (params.get("CustomField1") or "").strip().lower()
    route = (params.get("CustomField2") or "").strip()
    rtn_code = params.get("RtnCode")
    print("return callback trade_no=%s email=%s route=%s RtnCode=%s RtnMsg=%s SimulatePaid=%s"
          % (trade_no, email, route, rtn_code, params.get("RtnMsg"), params.get("SimulatePaid")))

    # 3) 後台「模擬付款」不該讓人真的變成付費會員，但仍要正常 ack
    if params.get("SimulatePaid") == "1":
        print("SimulatePaid -> ack only, not activating")
        return _text("1|OK")

    # 4) 授權失敗：不改狀態（維持 pending_payment），仍要 ack 否則綠界一直重送
    if rtn_code != "1":
        print("first charge failed, staying pending_payment")
        return _text("1|OK")

    if not email or not route:
        print("missing CustomField1/2, cannot locate row")
        return _text("0|MissingCustomField", 400)

    # 5) 冪等：綠界會重送，同一筆 trade_no 已經 active 就跳過寫入但照樣 ack。
    #    不以 Gwsr 當依據 —— 定期定額第一期的 Gwsr 實測是空的。
    row = TABLE.get_item(Key={"email": email, "route": route}).get("Item") or {}
    if row.get("subscription_status") == "active" and row.get("merchant_trade_no") == trade_no:
        print("already active for this trade_no -> idempotent skip")
        return _text("1|OK")

    now = datetime.now(timezone.utc)
    period_end = _add_period(now, params.get("PeriodType") or "M", params.get("Frequency") or "1")

    TABLE.update_item(
        Key={"email": email, "route": route},
        UpdateExpression=(
            "SET subscription_status = :s, merchant_trade_no = :m, "
            "current_period_end = :e, current_period_end_date = :ed, "
            "activated_at = if_not_exists(activated_at, :n), updated_at = :n"
        ),
        ExpressionAttributeValues={
            ":s": "active",
            ":m": trade_no,
            ":e": period_end.isoformat(),
            ":ed": period_end.strftime("%Y-%m-%d"),
            ":n": now.isoformat(),
        },
    )
    print("activated %s %s until %s" % (email, route, period_end.strftime("%Y-%m-%d")))

    # 6) 歡迎信交給 SQS，不在這裡寄（綠界不想等你做慢工）
    SQS.send_message(
        QueueUrl=STATUS_QUEUE_URL,
        MessageBody=json.dumps({
            "event_type": "welcome",
            "email": email,
            "route": route,
            "merchant_trade_no": trade_no,
            "current_period_end_date": period_end.strftime("%Y-%m-%d"),
            "amount": conf.get("amount", "300"),
        }, ensure_ascii=False),
    )
    return _text("1|OK")
