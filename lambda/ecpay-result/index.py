"""綠界 OrderResultURL —— 只負責把「瀏覽器 POST」轉成 302 導回網站

為什麼需要這支：綠界付完款是用**瀏覽器 POST** 把使用者送回來的，
而 Vercel 上的靜態 SPA 對頁面路由只接受 GET，POST 會回 **405 This page isn't working**。
付款其實已經成功（走 ReturnURL），只是使用者看到錯誤頁。

這支**不做任何授權或啟用**（那是 flight-ecpay-return 的工作，而且只有它可信）。
"""
import os
import urllib.parse
from base64 import b64decode

SITE_URL = os.environ.get("SITE_URL", "https://fare-finder-three.vercel.app")
DASHBOARD_PATH = os.environ.get("DASHBOARD_PATH", "/dashboard")


def _parse_form(event):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = b64decode(raw).decode("utf-8")
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}


def handler(event, context):
    params = _parse_form(event)
    rtn_code = params.get("RtnCode")
    print("order result trade_no=%s RtnCode=%s RtnMsg=%s"
          % (params.get("MerchantTradeNo"), rtn_code, params.get("RtnMsg")))

    # RtnCode=1 是授權成功。其他情況（含使用者中途取消）一律導回但標記失敗，
    # 真正的狀態仍以 DynamoDB 為準，這頁只是給人看的。
    result = "success" if rtn_code == "1" else "failed"
    # 把航線一起帶回去, 前端才知道要盯哪一張卡片變成 active
    # （使用者可能同時有好幾條沒付款的航線）
    route = (params.get("CustomField2") or "").strip()
    location = "%s%s?purchase=%s" % (SITE_URL, DASHBOARD_PATH, result)
    if route:
        location += "&route=" + urllib.parse.quote(route)

    return {
        "statusCode": 302,
        "headers": {"Location": location, "Cache-Control": "no-store"},
        "body": "",
    }
