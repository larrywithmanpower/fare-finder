"""綠界 PeriodReturnURL —— 定期定額「第二期起」每月續扣結果

跟 flight-ecpay-return 的驗證邏輯相同，差別在：
  * 成功 -> 維持 active，把 current_period_end 往後推一期（寬限期的計算靠這個往前滾）
  * 失敗 -> **不要第一次就 expired**。綠界自己會重試，連續失敗 6 次才自動終止整筆訂單，
            所以這裡累計 failed_charges，到 6 才轉 expired。
"""
import hashlib
import json
import os
import urllib.parse
from base64 import b64decode
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3

MAX_CONSECUTIVE_FAILURES = 6

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))
SM = boto3.client("secretsmanager")

_ecpay_cache = {}


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
    # 保留空字串欄位，只丟 CheckMacValue 本身
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}
    body = "&".join("%s=%s" % (k, items[k]) for k in sorted(items, key=str.lower))
    raw = "HashKey=%s&%s&HashIV=%s" % (hash_key, body, hash_iv)
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


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
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = b64decode(raw).decode("utf-8")
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}


def _add_period(start, period_type, frequency):
    freq = int(frequency or 1)
    if period_type == "D":
        return start + timedelta(days=freq)
    if period_type == "Y":
        return start.replace(year=start.year + freq)
    month = start.month - 1 + freq
    year = start.year + month // 12
    month = month % 12 + 1
    day = min(start.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return start.replace(year=year, month=month, day=day)


def handler(event, context):
    params = _parse_form(event)
    if not params:
        return _text("0|EmptyBody", 400)

    conf = _ecpay_conf()
    trade_no = params.get("MerchantTradeNo", "")

    expected = gen_check_mac_value(params, conf["hash_key"], conf["hash_iv"])
    if (params.get("CheckMacValue") or "").upper() != expected:
        print("CMV mismatch trade_no=%s" % trade_no)
        return _text("0|CheckMacValueInvalid", 400)

    if params.get("MerchantID") != conf["merchant_id"]:
        return _text("0|MerchantMismatch", 400)

    email = (params.get("CustomField1") or "").strip().lower()
    route = (params.get("CustomField2") or "").strip()
    rtn_code = params.get("RtnCode")
    success_times = params.get("TotalSuccessTimes")
    print("period callback trade_no=%s email=%s route=%s RtnCode=%s TotalSuccessTimes=%s "
          "SimulatePaid=%s" % (trade_no, email, route, rtn_code, success_times,
                               params.get("SimulatePaid")))

    if params.get("SimulatePaid") == "1":
        print("SimulatePaid -> ack only, no bookkeeping")
        return _text("1|OK")

    if not email or not route:
        return _text("0|MissingCustomField", 400)

    now = datetime.now(timezone.utc)

    if rtn_code == "1":
        period_end = _add_period(now, params.get("PeriodType") or "M", params.get("Frequency") or "1")
        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression=(
                "SET subscription_status = :s, current_period_end = :e, "
                "current_period_end_date = :ed, failed_charges = :zero, "
                "last_charge_at = :n, updated_at = :n"
            ),
            ExpressionAttributeValues={
                ":s": "active",
                ":e": period_end.isoformat(),
                ":ed": period_end.strftime("%Y-%m-%d"),
                ":zero": Decimal(0),
                ":n": now.isoformat(),
            },
        )
        print("renewed %s %s until %s" % (email, route, period_end.strftime("%Y-%m-%d")))
        return _text("1|OK")

    # 續扣失敗：累計次數，滿 6 次才真的終止
    row = TABLE.get_item(Key={"email": email, "route": route}).get("Item") or {}
    failures = int(row.get("failed_charges") or 0) + 1
    if failures >= MAX_CONSECUTIVE_FAILURES:
        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression=("SET subscription_status = :s, failed_charges = :f, updated_at = :n"),
            ExpressionAttributeValues={":s": "expired", ":f": Decimal(failures), ":n": now.isoformat()},
        )
        print("expired after %d consecutive failures %s %s" % (failures, email, route))
    else:
        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression="SET failed_charges = :f, updated_at = :n",
            ExpressionAttributeValues={":f": Decimal(failures), ":n": now.isoformat()},
        )
        print("charge failed %d/%d, keeping current status %s %s"
              % (failures, MAX_CONSECUTIVE_FAILURES, email, route))
    return _text("1|OK")
