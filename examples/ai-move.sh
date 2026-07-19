#!/bin/bash
# AI 侧最小接入示例：看一眼地图，向鱼干走一步
API="${API:-http://127.0.0.1:3896}"
TOKEN="$(cat .token)"
curl -s "$API/state"   # 你的 AI 读这个决定往哪走
curl -s -X POST "$API/move" -H "Content-Type: application/json" -H "X-Token: $TOKEN" \
  -d "{\"dir\":\"right\",\"say\":\"闻到鱼干味了\"}"
