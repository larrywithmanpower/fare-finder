"""訂閱航線 + 目標價 -> DynamoDB subscriptions，並導向綠界定期定額收銀台

M2 起這支會做兩件事之一：
  1. 還沒付費的人 -> 寫 subscription_status=pending_payment，回傳「自動送出的 HTML 表單」
     讓瀏覽器 POST 去綠界收銀台。注意回的是 text/html 不是 JSON。
  2. 已經付費中的人（active，或 cancelled 但還在寬限期）-> 只更新目標價，回 JSON，不用重新付款。

真正把狀態改成 active 的只有 callback Lambda（flight-ecpay-return / flight-ecpay-period），
這支永遠不寫 active。
"""
import hashlib
import html
import json
import os
import re
import secrets as pysecrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import boto3

# 可訂閱的城市白名單（IATA「城市」代碼，不是機場代碼: 要 TYO 不要 NRT）
# ⚠️ 前端 src/lib/cities.ts 是同一份, 加城市要兩邊都加
CITIES = {
    "TPE": "台北", "KHH": "高雄", "RMQ": "台中",
    "TYO": "東京", "OSA": "大阪", "NGO": "名古屋",
    "FUK": "福岡", "CTS": "札幌", "OKA": "沖繩",
    "SEL": "首爾", "PUS": "釜山",
    "HKG": "香港", "MFM": "澳門", "SHA": "上海",
    "BJS": "北京", "CAN": "廣州", "CTU": "成都",
    "BKK": "曼谷", "CNX": "清邁", "HKT": "普吉島",
    "SIN": "新加坡", "KUL": "吉隆坡", "MNL": "馬尼拉", "CEB": "宿霧",
    "SGN": "胡志明市", "HAN": "河內", "DAD": "峴港",
    "DPS": "峇里島", "JKT": "雅加達",
    "DEL": "德里", "BOM": "孟買", "DXB": "杜拜", "DOH": "杜哈", "IST": "伊斯坦堡",
    "LON": "倫敦", "PAR": "巴黎", "AMS": "阿姆斯特丹", "FRA": "法蘭克福",
    "MUC": "慕尼黑", "ZRH": "蘇黎世", "VIE": "維也納", "PRG": "布拉格",
    "ROM": "羅馬", "BCN": "巴塞隆納", "MAD": "馬德里",
    "NYC": "紐約", "LAX": "洛杉磯", "SFO": "舊金山", "SEA": "西雅圖",
    "CHI": "芝加哥", "YVR": "溫哥華", "YTO": "多倫多",
    "SYD": "雪梨", "MEL": "墨爾本", "AKL": "奧克蘭",
}

# M1/M2 早期的固定方案名, 舊前端還可能送上來, 對應到城市代碼就好
LEGACY_PLANS = {"tokyo": ("TPE", "TYO"), "seoul": ("TPE", "SEL")}


IATA_RE = re.compile(r"^[A-Z]{3}$")


def route_label(origin, destination):
    """清單內的給中文名, 使用者自己打的代碼就原樣顯示"""
    return "%s ✈ %s" % (CITIES.get(origin, origin), CITIES.get(destination, destination))


def valid_city(code):
    """清單是為了好選跟顯示中文, 不是限制。任何合法的 IATA 三碼都放行"""
    return bool(IATA_RE.match(code))

API_BASE = os.environ.get("API_BASE", "https://9fj5twb7pd.execute-api.us-east-1.amazonaws.com")
CASHIER_STAGE = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"
CASHIER_PROD = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"

TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))
SM = boto3.client("secretsmanager")

_ecpay_cache = {}

CORS_JSON = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}
CORS_HTML = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "text/html; charset=utf-8",
}


# --- 綠界 CheckMacValue（與 lambda/_shared/ecpay.py 同一份，官方測試向量驗過）---

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


# --- helpers ---

def _ecpay_conf():
    if not _ecpay_cache:
        secret = json.loads(SM.get_secret_value(SecretId="flight/ecpay")["SecretString"])
        _ecpay_cache.update(secret)
    return _ecpay_cache


def _resp_json(status, body):
    return {"statusCode": status, "headers": CORS_JSON, "body": json.dumps(body, ensure_ascii=False)}


def _parse_body(event):
    """API Gateway 送進來的 body 是字串, 直接 invoke 測試時可能已經是 dict"""
    body = event.get("body", event)
    if isinstance(body, str):
        body = json.loads(body or "{}")
    return body or {}


def _merchant_trade_no():
    """綠界規定 <= 20 碼且只能英數。2 + 12 + 6 = 20"""
    stamp = datetime.now(timezone.utc).strftime("%y%m%d%H%M%S")
    return "FF" + stamp + pysecrets.token_hex(3).upper()


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))


def _still_served(row):
    """這列現在還享有服務嗎（active，或 cancelled 但沒過期）—— 是的話不用重新付款"""
    status = row.get("subscription_status")
    if status == "active":
        return True
    if status == "cancelled":
        end = row.get("current_period_end")
        if end:
            try:
                return datetime.fromisoformat(end) >= datetime.now(timezone.utc)
            except ValueError:
                return False
    return False


def _checkout_form(conf, trade_no, email, route, label):
    """組定期定額參數 + 算 CheckMacValue + 回自動送出的 HTML"""
    amount = str(int(conf.get("amount", "300")))
    params = {
        "MerchantID": conf["merchant_id"],
        "MerchantTradeNo": trade_no,
        "MerchantTradeDate": _taipei_now().strftime("%Y/%m/%d %H:%M:%S"),
        "PaymentType": "aio",
        "TotalAmount": amount,
        "TradeDesc": "機票降價通知月訂閱",
        "ItemName": "機票降價通知 月訂閱 %s" % label,
        "ReturnURL": API_BASE + "/ecpay-return",
        "ChoosePayment": "Credit",
        "EncryptType": "1",
        # --- 定期定額 ---
        "PeriodAmount": amount,       # 綠界規定必須等於 TotalAmount
        "PeriodType": "M",            # 以月為週期
        "Frequency": "1",             # 每 1 個月扣一次
        "ExecTimes": "999",           # 綠界沒有真正的無限期，999 當長期用
        "PeriodReturnURL": API_BASE + "/ecpay-period",
        # 綠界用「瀏覽器 POST」把人送回來，靜態 SPA 只吃 GET 會回 405，
        # 所以這裡指向轉址 Lambda 而不是網站頁面
        "OrderResultURL": API_BASE + "/ecpay-result",
        # callback 靠這兩個欄位找到 DynamoDB 的哪一列
        "CustomField1": email,
        "CustomField2": route,
    }
    params["CheckMacValue"] = gen_check_mac_value(params, conf["hash_key"], conf["hash_iv"])

    action = CASHIER_PROD if conf.get("env") == "production" else CASHIER_STAGE
    inputs = "\n".join(
        '<input type="hidden" name="%s" value="%s">' % (html.escape(k), html.escape(str(v)))
        for k, v in params.items()
    )
    return (
        '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
        "<title>轉向綠界付款…</title></head><body>"
        "<p>正在轉向綠界付款頁面，請稍候…</p>"
        '<form id="ecpay" method="post" action="%s">\n%s\n</form>'
        "<script>document.forms[0].submit();</script>"
        "</body></html>" % (action, inputs)
    )


def handler(event, context):
    try:
        body = _parse_body(event)
    except (ValueError, TypeError):
        return _resp_json(400, {"error": "body 不是合法的 JSON"})

    email = (body.get("email") or "").strip().lower()
    raw_price = body.get("target_price")

    # 新前端送 origin/destination; 舊前端送 plan_name, 兩種都接
    origin = (body.get("origin") or "").strip().upper()
    destination = (body.get("destination") or "").strip().upper()
    if not origin or not destination:
        legacy = LEGACY_PLANS.get((body.get("plan_name") or "").strip().lower())
        if legacy:
            origin, destination = legacy

    if not email or "@" not in email:
        return _resp_json(400, {"error": "email 必填"})
    if not valid_city(origin) or not valid_city(destination):
        return _resp_json(400, {"error": "出發地與目的地要填 IATA 三碼城市代碼, 例如 TPE / LON"})
    if origin == destination:
        return _resp_json(400, {"error": "出發地與目的地不能相同"})

    try:
        target_price = Decimal(str(raw_price))
    except (InvalidOperation, TypeError):
        return _resp_json(400, {"error": "target_price 必須是數字"})
    if target_price <= 0:
        return _resp_json(400, {"error": "target_price 必須大於 0"})

    route = "%s-%s" % (origin, destination)
    label = route_label(origin, destination)
    now = datetime.now(timezone.utc).isoformat()

    existing = TABLE.get_item(Key={"email": email, "route": route}).get("Item") or {}

    common_set = (
        "plan_name = :p, origin = :o, destination = :d, "
        "origin_name = :on, destination_name = :dn, "
        "target_price = :t, currency = :c, updated_at = :u, "
        "created_at = if_not_exists(created_at, :u)"
    )
    common_values = {
        # plan_name 從 M2.5 起存的是中文航線名（"台北 ✈ 倫敦"）,
        # 這樣通知信不用另外維護一份 route -> 中文 的對照表
        ":p": label,
        ":o": origin,
        ":d": destination,
        ":on": CITIES.get(origin, origin),
        ":dn": CITIES.get(destination, destination),
        ":t": target_price,
        ":c": "TWD",
        ":u": now,
    }

    # 「先加進追蹤清單」：建立 draft 列就好, 付款留到使用者在卡片上按下去才做。
    # draft 不在 parser-wrapper 的計費狀態裡, 所以不會去查票價, 也不會寄信。
    if body.get("draft") and not _still_served(existing):
        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression="SET " + common_set + ", subscription_status = :s",
            ExpressionAttributeValues=dict(common_values, **{":s": "draft"}),
        )
        print("draft %s %s target=%s" % (email, route, target_price))
        return _resp_json(200, {
            "ok": True, "draft": True, "email": email, "route": route,
            "plan_name": label, "target_price": float(target_price),
            "currency": "TWD", "subscription_status": "draft",
        })

    # 還在服務期內的人：只改目標價，不動狀態、不重新付款。
    # 例外是 resume —— 已取消的人想恢復自動續訂, 綠界的定期定額約已經被解掉了,
    # 只能重新簽一張, 所以還是要走一次收銀台。
    if _still_served(existing) and not body.get("resume"):
        TABLE.update_item(
            Key={"email": email, "route": route},
            UpdateExpression="SET " + common_set,
            ExpressionAttributeValues=common_values,
        )
        print("updated target only %s %s status=%s target=%s"
              % (email, route, existing.get("subscription_status"), target_price))
        return _resp_json(200, {
            "ok": True,
            "updated_only": True,
            "email": email,
            "route": route,
            "plan_name": label,
            "target_price": float(target_price),
            "currency": "TWD",
            "subscription_status": existing.get("subscription_status"),
        })

    # 其他情況（新訂、pending_payment、expired）：寫 pending_payment 再導去付款
    conf = _ecpay_conf()
    trade_no = _merchant_trade_no()
    TABLE.update_item(
        Key={"email": email, "route": route},
        UpdateExpression=(
            "SET " + common_set + ", subscription_status = :s, merchant_trade_no = :m"
        ),
        ExpressionAttributeValues=dict(common_values, **{
            ":s": "pending_payment",
            ":m": trade_no,
        }),
    )
    print("pending_payment %s %s trade_no=%s target=%s" % (email, route, trade_no, target_price))
    return {
        "statusCode": 200,
        "headers": CORS_HTML,
        "body": _checkout_form(conf, trade_no, email, route, label),
    }
