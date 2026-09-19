# FOXYYA 台股研究平台 v1

**Branch:** `tw-research-platform-v1-20260919`  
**Base:** `v12-platform-completion-20260910`  
**Execution boundary:** Research-only. 不修改 Production Execution V2，不連接真實下單。

## 1. 產品定位

台股平台不是另一套交易引擎，而是 FOXYYA v12 的 Taiwan Equity Research Plane。

目標：
- 每日快速理解大盤、產業、資金與個股狀態。
- 把市場掃描、技術面、新聞、回測、風險、交易日誌與每日計畫整合成單一工作台。
- 所有股票訊號僅作 Research + Human Decision，不自動送單。

## 2. v1 七大模組

1. 市場雷達
   - 加權指數 / 櫃買指數
   - 產業強弱
   - 成交量 / 漲跌家數 / 市場廣度
   - 外資 / 投信 / 自營商
   - 融資融券
   - 自選股異動

2. AI 交易點子
   - 掃描自選池或產業
   - 最多輸出 5 個候選
   - 進場區、目標區、停損、RR
   - 技術 / 籌碼 / 基本面成立理由
   - 必須附來源、時間戳、資料新鮮度

3. 技術分析
   - 日線 / 週線
   - 支撐壓力
   - MA / EMA
   - RSI / MACD / Momentum
   - 趨勢狀態
   - 僅輸出 Research State：偏多 / 中性 / 偏弱，不映射成自動交易

4. 新聞與事件
   - 公司新聞
   - 法說 / 財報 / 月營收
   - 除權息
   - 重大訊息
   - 產業 / 海外供應鏈連動
   - 事件影響：短期 / 中期 / 長期

5. 策略回測
   - 均線交叉
   - RSI / MACD
   - 突破 / 趨勢
   - 自訂策略
   - KPI：勝率、Profit Factor、最大回撤、期望值、交易數、交易成本敏感度

6. 投資組合風險
   - 持股比例
   - 產業集中度
   - 單一股票曝險
   - 相關性
   - 壓力測試：-10% / -20% / -30%
   - 再平衡建議僅作分析，不執行交易

7. 交易日誌 + 每日計畫
   - 最近 20 筆交易覆盤
   - 重複錯誤
   - 錯失機會
   - 行為偏誤
   - 個人規則
   - 盤前 / 盤中 / 收盤 checklist

## 3. 首頁資訊架構

- Topbar：交易日 / 資料更新時間 / 市場狀態
- KPI：加權 / 櫃買 / 上漲家數 / 下跌家數 / 成交額 / 三大法人
- 主圖：台股大盤趨勢 + 成交量
- 右欄：市場狀態、風險事件、今日觀察
- 中段：產業輪動 / 法人流向 / 強弱排行
- 下段：AI 候選股 / 自選股 / 最新事件
- Mobile：單欄卡片式，主要功能底部導航

## 4. Data Contract

所有使用者可見資料至少包含：
- value
- symbol / instrument_id
- source
- observed_at
- freshness
- confidence / availability
- market = TW
- venue = TWSE / TPEx

缺資料一律顯示 UNAVAILABLE，不得假裝 LIVE。

## 5. 資料層

優先順序：
1. 官方 / 交易所資料
2. 公開揭露公司資料
3. 可替換第三方 provider

Provider payload 不直接進 UI，先轉 Canonical Observation。

## 6. v1 驗收條件

- 手機 Safari 可正常開啟
- 桌面 / 手機響應式
- 台股頁面與 Crypto Execution 完全隔離
- 不含任何真實送單按鈕
- 所有數據顯示來源與更新時間
- 任一資料缺失時 UI 不崩潰
- 至少支援 2330 / 2317 / 2454 / 2308 / 2881 等自選標的展示
