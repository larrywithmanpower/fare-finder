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

import l10n
from boto3.dynamodb.conditions import Key

HISTORY = boto3.resource("dynamodb").Table(os.environ.get("HISTORY_TABLE", "notification_history"))
SECRETS = boto3.client("secretsmanager")

UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"
RESEND_API = "https://api.resend.com/emails"

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


def route_label(msg, locale):
    """城市名的兩層來源: 訂閱時寫進資料列的（只有預設語系可信）-> 城市表"""
    if locale == l10n.DEFAULT_LOCALE and msg.get("origin_name") and msg.get("destination_name"):
        return msg["origin_name"], msg["destination_name"]
    return l10n.city_pair(msg["route"], locale)


def _ddmm(iso_string):
    """2026-10-31T17:15:00+08:00 -> 3110 (Aviasales 深連結用的日期格式)"""
    if not iso_string:
        return None
    try:
        dt = datetime.fromisoformat(iso_string)
    except ValueError:
        return None
    return dt.strftime("%d%m")


def booking_url(fare, route, marker=None, locale=l10n.DEFAULT_LOCALE):
    """訂購頁也用使用者的語言 —— 信是日文卻連到英文站很怪"""
    origin, dest = route.split("-")[0], route.split("-")[-1]
    host = l10n.booking_host(locale)
    out = _ddmm(fare.get("depart_date"))
    back = _ddmm(fare.get("return_date"))
    if not out:
        url = f"https://{host}/search/{origin}{dest}1"
    else:
        url = f"https://{host}/search/{origin}{out}{dest}{back or ''}1"
    if marker:
        url += f"?marker={marker}"
    return url


# 信件配色：綠色＝對使用者有利（比目標價／上次通知便宜），紅色＝變貴。
# 用純十六進位色碼, email client 對 CSS 變數與 oklch 都不支援。
GOOD = "#0f7b3f"
BAD = "#b42318"


def _delta_lines(locale, price, target_price, last_price):
    """回 (html, text) —— 省多少、跟上次通知比是漲是跌"""
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)
    saved = int(target_price) - int(price)
    lead = tr("fare.saved", target=format(int(target_price), ","))
    amount = tr("fare.savedAmount", saved=format(saved, ","))
    html = ['<p style="margin:16px 0 0;font-size:15px;color:#4a4a4a;">'
            '%s <strong style="color:%s;">%s</strong>。</p>' % (lead, GOOD, amount)]
    text = ["%s %s" % (lead, amount)]

    if last_price:
        diff = int(price) - int(last_price)
        if diff:
            down = diff < 0
            lead2 = tr("fare.vsLastDown" if down else "fare.vsLastUp",
                       last=format(int(last_price), ","))
            amount2 = tr("fare.vsLastDownAmount" if down else "fare.vsLastUpAmount",
                         diff=format(abs(diff), ","))
            colour = GOOD if down else BAD
            html.append('<p style="margin:8px 0 0;font-size:14px;color:#4a4a4a;">'
                        '%s<strong style="color:%s;">%s</strong>。</p>' % (lead2, colour, amount2))
            text.append("%s%s" % (lead2, amount2))
    return "".join(html), "\n".join(text)


def _dates_line(locale, fare):
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)
    parts = []
    depart = (fare.get("depart_date") or "")[:10]
    back = (fare.get("return_date") or "")[:10]
    if depart:
        parts.append(tr("fare.outbound", date=depart))
    if back:
        parts.append(tr("fare.inbound", date=back))
    return "　/　".join(parts)


def _flight_line(locale, fare):
    flight = (fare.get("airline") or "") + (fare.get("flight_number") or "")
    return l10n.tr(locale, "fare.flight", flight=flight) if flight else ""


def subject(locale, fare, names):
    origin, dest = names
    return l10n.tr(locale, "fare.subject", origin=origin, dest=dest,
                   price=format(int(fare["price"]), ","))


def render_html(locale, fare, names, target_price, url, usd=None, last_price=None):
    origin, dest = names
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)
    usd_line = ""
    if usd:
        usd_line = ('<p style="margin:4px 0 0;color:#8b8b8b;font-size:14px;">%s</p>'
                    % tr("fare.approx", price=format(int(usd["price"]), ",")))
    delta_html, _ = _delta_lines(locale, fare["price"], target_price, last_price)
    dates = _dates_line(locale, fare)
    flight = _flight_line(locale, fare)
    meta = "<br>".join(x for x in (dates, flight) if x)
    return """<div style="font-family:-apple-system,'Helvetica Neue',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
<p style="margin:0 0 8px;color:#8b8b8b;font-size:13px;letter-spacing:1px;">FLIGHT PRICE NOTIFIER</p>
<h1 style="margin:0 0 24px;font-size:22px;font-weight:700;">%s<span style="color:%s;">%s</span></h1>
<p style="margin:0;font-size:40px;font-weight:800;letter-spacing:-1px;color:%s;">NT$%s</p>
%s
%s
<p style="margin:16px 0 0;font-size:15px;color:#4a4a4a;">%s</p>
<p style="margin:28px 0 0;"><a href="%s" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:600;">%s</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#a0a0a0;">%s</p>
</div>""" % (
        tr("fare.heading", origin=origin, dest=dest), GOOD, tr("fare.dropped"),
        GOOD, format(int(fare["price"]), ","),
        usd_line, delta_html, meta, url, tr("fare.book"), tr("fare.disclaimer"),
    )


def render_text(locale, fare, names, target_price, url, usd=None, last_price=None):
    origin, dest = names
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)
    lines = ["%s%s" % (tr("fare.heading", origin=origin, dest=dest), tr("fare.dropped")),
             "", "NT$%s" % format(int(fare["price"]), ",")]
    if usd:
        lines.append(tr("fare.approx", price=format(int(usd["price"]), ",")))
    _, delta_text = _delta_lines(locale, fare["price"], target_price, last_price)
    lines += ["", delta_text]
    for extra in (_dates_line(locale, fare), _flight_line(locale, fare)):
        if extra:
            lines.append(extra)
    lines += ["", "%s: %s" % (tr("fare.book"), url), "", tr("fare.disclaimer")]
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

    last = last_notification(pk)
    send, reason = should_send(last, price)
    if not send:
        print(f"skipped (deduped) {pk} price={price} reason={reason}")
        return

    locale = l10n.normalize(message.get("locale"))
    marker = cfg.get("marker")
    url = booking_url(fare, route, marker, locale)
    names = route_label(message, locale)
    last_price = last.get("price") if last else None
    html = render_html(locale, fare, names, target_price, url, usd, last_price)
    text = render_text(locale, fare, names, target_price, url, usd, last_price)

    try:
        result = send_email(cfg, email, subject(locale, fare, names), html, text)
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
