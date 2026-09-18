# FOXYYA P0 Ledger 對帳執行手冊｜2026-09-18

## 範圍

本次調整為 **只讀對帳與執行正確性修正**，不修改 Production Execution V2 的 A/B/C/D 策略參數、不改寫既有 Ledger 歷史，也不解除真實下單安全鎖。

## 目的

任何新的 canonical 模擬進場恢復前，必須先從 canonical SQLite Ledger 證明四件事：

1. Hash chain 完整。
2. 每一個模擬部位的生命週期一致。
3. NAV、未平倉部位可由事件流確定性重播。
4. 目前 active reserved risk 可證明未超過 1.50% Portfolio Risk Cap。

## 只讀 Audit 指令

```bash
PYTHONPATH=src python tools/audit_canonical_ledger.py \
  --db /data/foxyya_v2_paper.sqlite \
  --config FOXYYA_V2_CONFIG.json \
  --output /tmp/foxyya-ledger-audit.json
```

此工具以 SQLite `mode=ro` 開啟資料庫，不 append、不 update、不 delete、不 compact、不 migrate，也不 backfill。

## 通過條件

- `ledger_hash_chain_verified=true`
- `integrity_ok=true`
- `nav_verified=true`
- `critical_issue_count=0`
- 所有未平倉 position 與 pending intent 均明確列出
- `active_reserved_risk_fraction <= 0.015`
- 5x / 8x / 10x Book NAV 在數值容差內一致

## 若 Audit 失敗

- 維持新的 canonical 模擬進場封鎖。
- 不得假設目前空倉。
- 不得把 1,000 USDT 視為 canonical NAV。
- 不得補回停機期間錯失交易。
- 原始 SQLite volume 保持不變。
- 只依 event_id / signal_id / intent_id / position_id 對帳；不得為改善績效改寫歷史成交。

## Execution 正確性

- Runner 啟動時 Ledger hash / portfolio replay 失敗即 fail-closed，不再默默回退 initial NAV。
- 有合法 Future 1H Open 且存在 due intent 時，進場 sizing 重新取得最新 verified Ledger NAV。
- 沒有 due intent 時不額外執行完整 Ledger replay，避免不必要資源消耗。

## 30 天策略凍結

以下全部維持不變：

- A/B/C/D 進場條件
- LONG / SHORT Regime Router
- A 0.50%
- B 0.35%
- C Starter 0.20–0.25%，單一標的總風險 <=0.50%
- D 0.35–0.50%
- Portfolio open risk <=1.50%
- 5x / 8x / 10x Paper Books
- Fully Closed Bar
- Future Legal 1H Open
- No Backfill
- 現行出場管理規則
- PAPER_ONLY / REAL_ORDER_LOCK
