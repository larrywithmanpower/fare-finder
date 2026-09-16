"""EventBridge 的目標: 決定這輪要查哪些航線, 每條非同步分派一顆 parser

航線來源有兩個, 取聯集:
  1. DynamoDB subscriptions —— 使用者自己訂的航線（M2.5 起航線不再寫死）
     只收 active / cancelled（寬限期內還要通知）, pending_payment 跟 expired 不查,
     免得沒付錢的人也讓我們去打 API。
  2. S3 flight-routes.json —— 管理者想固定監看的航線, 就算沒人訂也查

拆兩層是為了平行化 —— 航線變多時各自一顆 Lambda 同時跑, 單一航線失敗不影響其他。
"""
import json
import os
from datetime import datetime, timedelta, timezone

import boto3

S3 = boto3.client("s3")
LAMBDA = boto3.client("lambda")
TABLE = boto3.resource("dynamodb").Table(os.environ.get("SUBSCRIPTIONS_TABLE", "subscriptions"))

PARSER = os.environ.get("PARSER_FUNCTION", "flight-parser")
ROUTES_KEY = os.environ.get("ROUTES_KEY", "flight-routes.json")

# 只有這些狀態的訂閱值得花 API 額度去查
BILLABLE = {"active", "cancelled"}

# 開了收銀台卻沒付款就當他放棄了, 卡片回到「訂閱並付款」。
# 這支每 30 分跑一次, 所以實際失效時間會落在 30~60 分之間。
# 提早標記是安全的: 綠界的付款通知晚到, callback 照樣會把它翻成 active。
PENDING_TTL_MINUTES = int(os.environ.get("PENDING_TTL_MINUTES", "30"))

# 「最近移除」保留多久才真的刪掉
REMOVED_TTL_DAYS = int(os.environ.get("REMOVED_TTL_DAYS", "30"))


def _stale(row, deadline, field="updated_at"):
    stamp = row.get(field)
    if not stamp:
        return False
    try:
        return datetime.fromisoformat(stamp) < deadline
    except ValueError:
        return False


def _purge(row):
    """最近移除放超過保留期 -> 真的刪掉"""
    TABLE.delete_item(
        Key={"email": row["email"], "route": row["route"]},
        ConditionExpression="subscription_status = :removed",
        ExpressionAttributeValues={":removed": "removed"},
    )
    print("removed over %dd -> purged %s %s" % (REMOVED_TTL_DAYS, row["email"], row["route"]))


def _expire(row):
    """沒付款放太久 -> expired。只改狀態, 目標價留著, 使用者再訂時還看得到"""
    TABLE.update_item(
        Key={"email": row["email"], "route": row["route"]},
        UpdateExpression="SET subscription_status = :s, updated_at = :n",
        ConditionExpression="subscription_status = :pending",
        ExpressionAttributeValues={
            ":s": "expired",
            ":pending": "pending_payment",
            ":n": datetime.now(timezone.utc).isoformat(),
        },
    )
    print("pending_payment over %dmin -> expired %s %s"
          % (PENDING_TTL_MINUTES, row["email"], row["route"]))


def routes_from_subscriptions():
    """掃訂閱表, 回 {route: (origin, destination)}"""
    found = {}
    kwargs = {
        "ProjectionExpression": (
            "email, #r, origin, destination, subscription_status, updated_at, removed_at"
        ),
        "ExpressionAttributeNames": {"#r": "route"},
    }
    now = datetime.now(timezone.utc)
    deadline = now - timedelta(minutes=PENDING_TTL_MINUTES)
    purge_deadline = now - timedelta(days=REMOVED_TTL_DAYS)
    while True:
        page = TABLE.scan(**kwargs)
        for row in page.get("Items", []):
            status = row.get("subscription_status")
            if status == "removed":
                if _stale(row, purge_deadline, "removed_at"):
                    _purge(row)
                continue
            if status == "pending_payment" and _stale(row, deadline):
                _expire(row)
                continue
            if status not in BILLABLE:
                continue
            route = row.get("route")
            if not route:
                continue
            origin = row.get("origin")
            destination = row.get("destination")
            if not origin or not destination:
                # 舊資料可能沒拆欄位, 從 route 反推
                parts = route.split("-")
                if len(parts) != 2:
                    continue
                origin, destination = parts
            found[route] = (origin, destination)
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    return found


def routes_from_s3():
    bucket = os.environ.get("CONFIG_BUCKET")
    if not bucket:
        return {}
    try:
        body = S3.get_object(Bucket=bucket, Key=ROUTES_KEY)["Body"].read()
        items = json.loads(body)
    except Exception as exc:  # noqa: BLE001 - 管理者清單壞掉不該讓使用者訂的航線也停擺
        print("read %s failed (%s), using subscriptions only" % (ROUTES_KEY, exc))
        return {}
    return {
        "%s-%s" % (item["origin"], item["destination"]): (item["origin"], item["destination"])
        for item in items
    }


def handler(event, context):
    subscribed = routes_from_subscriptions()
    pinned = routes_from_s3()
    routes = dict(pinned)
    routes.update(subscribed)
    print("routes: %d subscribed + %d pinned -> %d unique"
          % (len(subscribed), len(pinned), len(routes)))

    dispatched = []
    for route, (origin, destination) in sorted(routes.items()):
        payload = {"origin": origin, "destination": destination, "route": route}
        LAMBDA.invoke(
            FunctionName=PARSER,
            InvocationType="Event",  # 非同步, 不等 parser 跑完
            Payload=json.dumps(payload),
        )
        dispatched.append(route)
        print("dispatched %s" % route)

    print("dispatched %d route(s)" % len(dispatched))
    return {"dispatched": dispatched}
