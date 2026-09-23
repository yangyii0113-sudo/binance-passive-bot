# TP01 趨勢回調研究版 v0.1

此為獨立研究假設，並非既有 TF01/ST04 的完整複製；沒有歷史績效結論。
PAPER_ONLY、REAL_ORDER_LOCK、No Backfill 維持。無訂單端點，無自動開倉，無 Production Execution V2 變更。

## 確定性訊號規則

- BTCUSDT、ETHUSDT；僅 Binance USD-M 合約 K 線，不以現貨替代。
- 分別取得最近 600 根 1h、4h；排除未收盤 K 線。至少 200 根 1h、500 根 4h。
- 檢查時間連續、整點對齊、OHLC 正值與上下界；最後一根須為最近已收盤 K 線。失敗時不產生點位。
- EMA 使用 SMA 起始值；ATR14 使用 Wilder 平滑。
- 多：4h close > EMA50 > EMA200，EMA50 大於三根前的 EMA50。空方反向。
- 最新 1h 多方：low <= EMA20、close > EMA20、close > open。空方：high >= EMA20、close < EMA20、close < open。
- close 與 EMA20 距離不可超過 1 ATR14。
- 多方門檻 = 訊號 K 高點 + 0.1 ATR；止損 = 最近五根最低點 - 0.2 ATR。空方反向。
- R = abs(進場門檻 - 止損)。第一止盈 1R、第二止盈 2R；規劃各出場 50%，止損不移動。
- 計畫僅對下一根 1h 有效；止損先到、跳空越過門檻或逾時取消。
- 本版只計算收盤快照，尚未追蹤下一根內的突破、取消、成交與退出；介面不宣稱已觸發或已成交。
- 價格為研究計算值，未套用交易所 tick size；不供直接送單。

## 點位排版

進場獨立大字卡、第一及第二止盈綠色、止損紅色；全部附 USDT。小螢幕依序單欄排列。
舊版 24h 市場動能卡保留，進場標記報價參考；固定百分比目標不作為 TP01 或 EMA 的回測成果。
過期 TP01 計畫隱藏價位，提示重新分析；缺資料與等待条件不顯示虛構點位。

## 驗證及階段

1. 已實作：收盤訊號、資料品質阻擋、BTC/ETH 分析入口、點位排版。
2. 待完成：逐筆模擬與費率/滑價/資金費率、同根止盈止損先後保守處理、貨幣損益帳本。
3. 待完成：按時間切分樣本外、walk-forward、成本壓力測試。不得依回測最優結果回頭修改測試集。
4. 待完成：前向紙上觀察與人工覆核。完成前不顯示驗證通過。

本版測試：多空點位方向與 2R；未收盤 K 不影響輸出；缺漏、過期、錯誤 OHLC 阻擋；未成立與樣本不足不產生點位。
API 欄位參照：https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data
