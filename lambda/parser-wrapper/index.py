"""EventBridge 的目標: 讀 S3 航線清單, 每條航線非同步分派一顆 parser

拆兩層是為了平行化 — 航線變多時各自一顆 Lambda 同時跑, 單一航線失敗不影響其他。
"""
import json
import os

import boto3

S3 = boto3.client("s3")
LAMBDA = boto3.client("lambda")

PARSER = os.environ.get("PARSER_FUNCTION", "flight-parser")
ROUTES_KEY = os.environ.get("ROUTES_KEY", "flight-routes.json")


def handler(event, context):
    bucket = os.environ["CONFIG_BUCKET"]
    body = S3.get_object(Bucket=bucket, Key=ROUTES_KEY)["Body"].read()
    routes = json.loads(body)

    dispatched = []
    for route in routes:
        payload = {
            "origin": route["origin"],
            "destination": route["destination"],
            "route": f"{route['origin']}-{route['destination']}",
            "plan": route.get("plan"),
        }
        LAMBDA.invoke(
            FunctionName=PARSER,
            InvocationType="Event",  # 非同步, 不等 parser 跑完
            Payload=json.dumps(payload),
        )
        dispatched.append(payload["route"])
        print(f"dispatched {payload['route']}")

    print(f"dispatched {len(dispatched)} route(s)")
    return {"dispatched": dispatched}
