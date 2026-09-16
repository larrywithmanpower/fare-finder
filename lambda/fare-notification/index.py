"""SQS -> 去重 -> Resend 寄出降價通知

順序很重要: 先查 notification_history 決定要不要寄, 真的收到 2xx 之後才寫 history。
這個順序才禁得起 SQS 的「至少一次」投遞。
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

HISTORY = boto3.resource("dynamodb").Table(os.environ.get("HISTORY_TABLE", "notification_history"))
SECRETS = boto3.client("secretsmanager")

UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"
RESEND_API = "https://api.resend.com/emails"

# 中文城市名優先用訊息裡帶的（訂閱時就寫進 DynamoDB）,
# 舊訊息沒有才退回這張小表, 再不行就直接顯示代碼
ROUTE_LABELS = {
    "TPE-TYO": ("台北", "東京"),
    "TPE-SEL": ("台北", "首爾"),
}

_secret_cache = None


def get_resend():
    global _secret_cache
    if _secret_cache is None:
        raw = SECRETS.get_secret_value(SecretId="flight/resend")["SecretString"]
        _secret_cache = json.loads(raw)
    return _secret_cache


def _env_num(name, default):
    try:
        return Decimal(os.environ.get(name, str(default)))
    except Exception:  # noqa: BLE001
        return Decimal(str(default))


def route_label(msg):
    """中文城市名的三層來源: 訊息 -> 舊對照表 -> 直接顯示代碼"""
    route = msg["route"]
    fallback = ROUTE_LABELS.get(route, (route.split("-")[0], route.split("-")[-1]))
    return (msg.get("origin_name") or fallback[0], msg.get("destination_name") or fallback[1])


def _ddmm(iso_string):
    """2026-10-31T17:15:00+08:00 -> 3110 (Aviasales 深連結用的日期格式)"""
    if not iso_string:
        return None
    try:
        dt = datetime.fromisoformat(iso_string)
    except ValueError:
        return None
    return dt.strftime("%d%m")


def booking_url(fare, route, marker=None):
    origin, dest = route.split("-")[0], route.split("-")[-1]
    out = _ddmm(fare.get("depart_date"))
    back = _ddmm(fare.get("return_date"))
    if not out:
        url = f"https://www.aviasales.com/search/{origin}{dest}1"
    else:
        url = f"https://www.aviasales.com/search/{origin}{out}{dest}{back or ''}1"
    if marker:
        url += f"?marker={marker}"
    return url


def subject(fare, names):
    origin, dest = names
    return f"✈️ {origin} → {dest} 降價通知！NT${int(fare['price']):,} 已達標"


def render_html(fare, names, target_price, url, usd=None):
    origin, dest = names
    usd_line = ""
    if usd:
        usd_line = f'<p style="margin:4px 0 0;color:#8b8b8b;font-size:14px;">約 US${int(usd["price"]):,}</p>'
    depart = (fare.get("depart_date") or "")[:10]
    back = (fare.get("return_date") or "")[:10]
    dates = f"{depart} 去程"
    if back:
        dates += f"　/　{back} 回程"
    flight = fare.get("airline") or ""
    if fare.get("flight_number"):
        flight = f"{flight}{fare['flight_number']}"
    return f"""<div style="font-family:-apple-system,'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
<p style="margin:0 0 8px;color:#8b8b8b;font-size:13px;letter-spacing:1px;">FLIGHT PRICE NOTIFIER</p>
<h1 style="margin:0 0 24px;font-size:22px;font-weight:700;">{origin} → {dest} 降價了</h1>
<p style="margin:0;font-size:40px;font-weight:800;letter-spacing:-1px;">NT${int(fare['price']):,}</p>
{usd_line}
<p style="margin:16px 0 0;font-size:15px;color:#4a4a4a;">你的目標價是 NT${int(target_price):,}，現在的最低價已經低於這個數字。</p>
<p style="margin:16px 0 0;font-size:15px;color:#4a4a4a;">{dates}<br>航班 {flight}</p>
<p style="margin:28px 0 0;"><a href="{url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:600;">立即訂購</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#a0a0a0;">票價隨時變動，實際金額以訂購頁面為準。</p>
</div>"""


def render_text(fare, names, target_price, url, usd=None):
    origin, dest = names
    lines = [
        f"{origin} → {dest} 降價了",
        "",
        f"NT${int(fare['price']):,}",
    ]
    if usd:
        lines.append(f"約 US${int(usd['price']):,}")
    lines += [
        "",
        f"你的目標價是 NT${int(target_price):,}，現在的最低價已經低於這個數字。",
        f"去程 {(fare.get('depart_date') or '')[:10]}　回程 {(fare.get('return_date') or '')[:10]}",
        "",
        f"立即訂購：{url}",
        "",
        "票價隨時變動，實際金額以訂購頁面為準。",
    ]
    return "\n".join(lines)


def last_notification(pk):
    result = HISTORY.query(
        KeyConditionExpression=Key("pk").eq(pk),
        ScanIndexForward=False,
        Limit=1,
    )
    items = result.get("Items", [])
    return items[0] if items else None


def should_send(last, new_price):
    """沒寄過, 或冷卻期過了就寄; 還在冷卻期內只有跌夠多才再寄"""
    if not last:
        return True, "first_alert"

    floor_hours = int(_env_num("NOTIFY_FLOOR_HOURS", 24))
    realert_pct = _env_num("REALERT_PCT", 20)
    realert_abs = _env_num("REALERT_ABS_TWD", 2000)

    try:
        sent_at = datetime.fromisoformat(last["sent_at"])
    except (KeyError, ValueError):
        return True, "unparsable_history"
    if sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) - sent_at >= timedelta(hours=floor_hours):
        return True, "cooldown_elapsed"

    last_price = Decimal(str(last.get("price", 0)))
    if last_price <= 0:
        return True, "no_last_price"

    if new_price <= last_price * (1 - realert_pct / 100):
        return True, f"dropped_{realert_pct}pct"
    if last_price - new_price >= realert_abs:
        return True, f"dropped_{realert_abs}twd"

    return False, "deduped"


def send_email(cfg, to_address, payload_subject, html, text):
    body = json.dumps({
        "from": cfg["from"],
        "to": to_address,
        "subject": payload_subject,
        "html": html,
        "text": text,
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        RESEND_API,
        data=body,
        headers={
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
            # 不帶 User-Agent 會被 Cloudflare 擋 (error code: 1010)
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def handle_record(record, cfg):
    message = json.loads(record["body"])
    email = message["email"]
    route = message["route"]
    fare = message["cheapest"]
    usd = message.get("cheapest_usd")
    target_price = Decimal(str(message["target_price"]))
    price = Decimal(str(fare["price"]))
    pk = f"{email}#{route}"

    send, reason = should_send(last_notification(pk), price)
    if not send:
        print(f"skipped (deduped) {pk} price={price} reason={reason}")
        return

    marker = cfg.get("marker")
    url = booking_url(fare, route, marker)
    names = route_label(message)
    html = render_html(fare, names, target_price, url, usd)
    text = render_text(fare, names, target_price, url, usd)

    try:
        result = send_email(cfg, email, subject(fare, names), html, text)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code in (429,) or exc.code >= 500:
            # 暫時性錯誤 -> 拋出讓 SQS 重送
            print(f"transient resend error {exc.code} for {pk}: {detail}")
            raise
        # 403/422 是永久性的 (demo 寄件人只寄得到帳號信箱), 重試多少次都一樣, 丟掉
        print(f"permanent resend error {exc.code} for {pk}, dropping: {detail}")
        return

    HISTORY.put_item(Item={
        "pk": pk,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "route": route,
        "email": email,
        "price": price,
        "currency": "TWD",
        "target_price": target_price,
        "resend_id": result.get("id"),
        "reason": reason,
    })
    print(f"sent {pk} price={price} reason={reason} resend_id={result.get('id')}")


def handler(event, context):
    cfg = get_resend()
    for record in event.get("Records", []):
        handle_record(record, cfg)
    return {"processed": len(event.get("Records", []))}
