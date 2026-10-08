# 多空選幣與技術確認 v1

基底遠端 0f7499ff5e605840124eaf7e58e7706a85b70d5c。僅 Lite 研究，不修改 Production Execution V2。PAPER_ONLY / REAL_ORDER_LOCK / No Backfill。

## 本輪判斷

上漲前五候選無法涵蓋明顯下跌幣，因此新增下跌前五入口，維持一次最多五檔。下跌篩選：-30% < 24h 漲跌幅 < 0%，成交額 >= 1,000 萬 USDT；跌幅、成交額、symbol 決定排序。沿用行情與合約時效核對；名單不是多空指令。上漲篩選與原研究池不變。

在原有雙策略日週月分析中附加收盤技術證據：線性斐波那契已確認波段回撤、EMA12/144/169 Vegas 通道、EMA20 ± 2 SMA-TR14 Keltner、SMA20 ± 2 母體標準差布林通道、Wilder RSI14、陽陰線／實體吞噬與成交量比。沒有使用「熱門」作為排名或收益證據，沒有假定威拉斯必定指 Vegas；介面顯示明確指標名称。

指標最多使用 200 根，Vegas 必須有完整 200 根；原策略均線仍使用 60 根種子。指標值不保證與其他平台使用無限暖機資料的值完全相同。斐波那契波段以嚴格左右各兩根收盤棒確認 high/low，排除同棒同時高低轉折；僅使用決策當下已知資料。顯示錨點、確認時間及失效。50% 僅為常用回撤參考。

## 進退場與回測

本輪不把新指標直接變成實際進場規則。原 Gate 通過的計畫仍提供精確進場、兩段止盈與止損；技術觀察區不是可用交易點位。過期、缺資料及身分錯配不顯示技術數值。原成本、50%/50% 出場及持有時限維持。

回測保留 breakout/structured 兩基準組，加上兩策略各三個獨立對照：
- Fibonacci：訊號收盤落於同向已確認波段 38.2%–61.8%，波段未失效。
- Keltner：多單收盤在上緣之上，空單在下緣之下。
- Vegas：收盤與 EMA12 都在 144/169 通道同側。

每組沿用原進退場、同一時間段、相同成本與部位模型，分前70%、後30%留出、留出雙倍成本。缺資料與確認不通過分開計數。沒有自動最佳化或把最佳組直接升級為主策略。回測不等於前向真實成交，也不補算觀察中斷。固定今日選幣後的歷史回測存在選幣／存活偏差，不能聲稱全市場策略表現；資金費率、深度、數量精度及浮動回撤仍未完整納入。

## 來源（概念與公式，未複製第三方腳本）

- TradingView Fibonacci retracement: https://www.tradingview.com/support/solutions/43000518158-fibonacci-retracement-drawing-tool/
- TradingView Keltner Channels: https://www.tradingview.com/support/solutions/43000502266-keltner-channels-kc/
- 原作者公開的 Vegas 12/144/169 指標說明: https://www.tradingview.com/script/GfAt50NJ-VEGAS-tunnel-1-hrs-12-144-169/
- TradingView ATR 平滑差異: https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/

查證日 2026-10-08。原作者公開腳本的存在不是盈利證据。本執行環境 Binance /fapi/v1/time 回應 HTTP 451 restricted location，不能推論使用者所在地受限。未能取得可驗證的最新行情與完整歷史，因此未產出真實幣種點位或聲稱歷史收益改善。測試 fixture 只驗證算法、因果性、Gate 與畫面。
