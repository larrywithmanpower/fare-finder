"""訂閱狀態通知 —— 歡迎信與取消確認信

**只有這一支**，依訊息裡的 event_type 分流（welcome / cancel），不要另外再建一支。
producer 是 flight-ecpay-return（welcome）與 flight-cancel-subscription（cancel）。
"""
import json
import os
import urllib.error
import urllib.request

import boto3

SECRETS = boto3.client("secretsmanager")

UA = "Mozilla/5.0 (compatible; flight-price-notifier/1.0)"
RESEND_API = "https://api.resend.com/emails"
SITE_URL = os.environ.get("SITE_URL", "https://fare-finder-three.vercel.app")

ROUTE_LABELS = {
    "TPE-TYO": ("台北", "東京"),
    "TPE-SEL": ("台北", "首爾"),
}

_secret_cache = None


def get_resend():
    global _secret_cache
    if _secret_cache is None:
        _secret_cache = json.loads(SECRETS.get_secret_value(SecretId="flight/resend")["SecretString"])
    return _secret_cache


def route_label(msg):
    """中文航線名的三層來源: 訊息 -> 舊對照表 -> 直接顯示代碼"""
    if msg.get("route_label"):
        return msg["route_label"]
    route = msg["route"]
    origin, dest = ROUTE_LABELS.get(route, (route.split("-")[0], route.split("-")[-1]))
    return "%s ✈ %s" % (origin, dest)


def _shell(inner):
    return (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">'
        "%s"
        '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">'
        '<p style="font-size:12px;color:#888">Flight Price Notifier · '
        '<a href="%s/dashboard" style="color:#888">管理我的訂閱</a></p>'
        "</div>" % (inner, SITE_URL)
    )


def render_welcome(msg):
    label = route_label(msg)
    end = msg.get("current_period_end_date", "")
    amount = msg.get("amount", "300")
    subject = "訂閱成功：%s 開始為你盯票價" % label
    html = _shell(
        '<h2 style="margin:0 0 16px">訂閱成功 🎉</h2>'
        "<p>你已經訂閱 <strong>%s</strong> 的降價通知，我們每 30 分鐘查一次最低票價，"
        "低於你設定的目標價就立刻寄信給你。</p>"
        '<table style="font-size:14px;border-collapse:collapse;margin:16px 0">'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">方案</td><td>%s 月訂閱</td></tr>'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">月費</td><td>NT$%s</td></tr>'
        '<tr><td style="padding:4px 12px 4px 0;color:#666">本期到期日</td><td>%s</td></tr>'
        "</table>"
        '<p style="font-size:13px;color:#666">隨時可以在控制台取消，取消後在本期結束前仍然收得到通知。</p>'
        % (label, label, amount, end)
    )
    text = (
        "訂閱成功\n\n"
        "你已經訂閱 %s 的降價通知。\n"
        "方案：%s 月訂閱\n月費：NT$%s\n本期到期日：%s\n\n"
        "隨時可以在控制台取消，取消後在本期結束前仍然收得到通知。\n%s/dashboard\n"
        % (label, label, amount, end, SITE_URL)
    )
    return subject, html, text


def render_cancel(msg):
    label = route_label(msg)
    end = msg.get("current_period_end_date", "")
    subject = "已取消訂閱：%s" % label
    html = _shell(
        '<h2 style="margin:0 0 16px">已取消訂閱</h2>'
        "<p>你取消了 <strong>%s</strong> 的訂閱，之後不會再扣款。</p>"
        '<p style="background:#f5f5f5;padding:12px 16px;border-radius:6px">'
        "本期已經付過費，<strong>%s 之前仍然會收到降價通知</strong>，到期後自動停止。</p>"
        '<p style="font-size:13px;color:#666">改變主意的話，隨時可以回控制台重新訂閱。</p>'
        % (label, end)
    )
    text = (
        "已取消訂閱\n\n"
        "你取消了 %s 的訂閱，之後不會再扣款。\n"
        "本期已經付過費，%s 之前仍然會收到降價通知，到期後自動停止。\n\n"
        "改變主意的話，隨時可以回控制台重新訂閱。\n%s/dashboard\n"
        % (label, end, SITE_URL)
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
