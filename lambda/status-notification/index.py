"""訂閱狀態通知 —— 歡迎信與取消確認信

**只有這一支**，依訊息裡的 event_type 分流（welcome / cancel），不要另外再建一支。
producer 是 flight-ecpay-return（welcome）與 flight-cancel-subscription（cancel）。
"""
import json
import os
import re
import urllib.error
import urllib.request

import boto3

import l10n

SECRETS = boto3.client("secretsmanager")

UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"
RESEND_API = "https://api.resend.com/emails"
SITE_URL = os.environ.get("SITE_URL", "https://fare-finder-three.vercel.app")

_secret_cache = None


def _strip(html):
    """純文字版本用: 把文案裡的 <strong> 之類標籤拿掉"""
    return re.sub(r"<[^>]+>", "", html)


def get_resend():
    global _secret_cache
    if _secret_cache is None:
        _secret_cache = json.loads(SECRETS.get_secret_value(SecretId="flight/resend")["SecretString"])
    return _secret_cache


def route_label(msg, locale):
    """中文航線名的三層來源: 訊息帶的 -> 城市表 -> 直接顯示代碼"""
    if msg.get("route_label") and locale == l10n.DEFAULT_LOCALE:
        return msg["route_label"]
    return l10n.route_label(msg["route"], locale)


def _shell(inner, locale):
    return (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">'
        "%s"
        '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">'
        '<p style="font-size:12px;color:#888">Flight Price Notifier · '
        '<a href="%s/dashboard" style="color:#888">%s</a></p>'
        "</div>" % (inner, SITE_URL, l10n.tr(locale, "shell.manage"))
    )


def render_welcome(msg):
    locale = l10n.normalize(msg.get("locale"))
    label = route_label(msg, locale)
    end = msg.get("current_period_end_date", "")
    amount = msg.get("amount", "300")
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)

    subject = tr("welcome.subject", route=label)
    html = _shell(
        '<h2 style="margin:0 0 16px">%s</h2><p>%s</p>'
        '<table style="font-size:14px;border-collapse:collapse;margin:16px 0">'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">%s</td><td>%s</td></tr>'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">%s</td><td>NT$%s</td></tr>'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">%s</td><td>%s</td></tr>'
        "</table>"
        '<p style="font-size:13px;color:#666">%s</p>'
        % (tr("welcome.title"), tr("welcome.body", route=label),
           tr("welcome.plan"), tr("welcome.planValue", route=label),
           tr("welcome.fee"), amount,
           tr("welcome.periodEnd"), end,
           tr("welcome.footer")),
        locale,
    )
    text = "%s\n\n%s\n%s: %s\n%s: NT$%s\n%s: %s\n\n%s\n%s/dashboard\n" % (
        tr("welcome.title"),
        _strip(tr("welcome.body", route=label)),
        tr("welcome.plan"), tr("welcome.planValue", route=label),
        tr("welcome.fee"), amount,
        tr("welcome.periodEnd"), end,
        tr("welcome.footer"), SITE_URL,
    )
    return subject, html, text


def render_cancel(msg):
    locale = l10n.normalize(msg.get("locale"))
    label = route_label(msg, locale)
    end = msg.get("current_period_end_date", "")
    tr = lambda key, **kw: l10n.tr(locale, key, **kw)

    subject = tr("cancel.subject", route=label)
    html = _shell(
        '<h2 style="margin:0 0 16px">%s</h2><p>%s</p>'
        '<p style="background:#f5f5f5;padding:12px 16px;border-radius:6px">%s</p>'
        '<p style="font-size:13px;color:#666">%s</p>'
        % (tr("cancel.title"), tr("cancel.body", route=label),
           tr("cancel.grace", date=end), tr("cancel.footer")),
        locale,
    )
    text = "%s\n\n%s\n%s\n\n%s\n%s/dashboard\n" % (
        tr("cancel.title"),
        _strip(tr("cancel.body", route=label)),
        _strip(tr("cancel.grace", date=end)),
        tr("cancel.footer"), SITE_URL,
    )
    return subject, html, text


RENDERERS = {"welcome": render_welcome, "cancel": render_cancel}


def send_email(cfg, to_address, subject, html, text):
    body = json.dumps({
        "from": cfg["from"],
        "to": to_address,
        "subject": subject,
        "html": html,
        "text": text,
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        RESEND_API,
        data=body,
        headers={
            "Authorization": "Bearer %s" % cfg["api_key"],
            "Content-Type": "application/json",
            # 不帶 User-Agent 會被 Cloudflare 擋 (error code: 1010)
            "User-Agent": UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def handle_record(record, cfg):
    msg = json.loads(record["body"])
    event_type = msg.get("event_type")
    renderer = RENDERERS.get(event_type)
    if renderer is None:
        print("unknown event_type=%r, dropping" % event_type)
        return

    subject, html, text = renderer(msg)
    to_address = msg["email"]
    try:
        result = send_email(cfg, to_address, subject, html, text)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code == 429 or exc.code >= 500:
            # 暫時性錯誤：讓這則訊息回佇列重試
            print("transient resend error %s for %s: %s" % (exc.code, to_address, detail))
            raise
        # 403 / 422 這種是永久錯誤（sandbox 只能寄給自己），重試也沒用
        print("permanent resend error %s for %s, dropping: %s" % (exc.code, to_address, detail))
        return

    print("sent %s to %s route=%s resend_id=%s"
          % (event_type, to_address, msg.get("route"), result.get("id")))


def handler(event, context):
    cfg = get_resend()
    for record in event.get("Records", []):
        handle_record(record, cfg)
    return {"processed": len(event.get("Records", []))}
