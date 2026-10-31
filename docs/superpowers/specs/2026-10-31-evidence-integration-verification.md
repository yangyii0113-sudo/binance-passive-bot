# FOXYYA 證據整合驗證紀錄

基準：活躍 Lite `ca69ed824b7d4ad2245188407f3b1af6e8e1692e`。獨立分支：`feat/foxyya-evidence-integration-20261031`。

## 完成範圍
- 日／週／月主畫面、短線交易建議、完整策略及首頁其他候選共用來源／前後變化／方向分歧元件。
- 新分析完成後保存唯讀結論；保留不同結論，去除連續重複；不保存價位／成交。
- 明示官方 K 線單一來源與平台計算、連結並非原始回應封存、社群尚未接入。
- 失效、過期、歷史、資料不足與身分不符不提供目前方向；來源時間與判定原因可見。

## 驗證
- 基準 npm test：249 項及 smoke scripts 通過。
- 最終 npm test：260 項及 gate-a、timeframes、pipeline、truthfulness、architecture、server smoke 通過。
- 獨立 research-service：22 項通過。
- 新證據測試 11 項。先證明新增功能缺失；審查發現的問題以 4 個測試 RED→GREEN 修復。
- 語法、git diff --check、靜態建置通過。
- 手機／iPad 實際瀏覽器版面未驗證：環境無瀏覽器，Chromium 與 Headless Shell 下載返回 HTML 而非壓縮檔；不冒稱 360／390／430 px 或 Safari 驗收通過。附包裝的 preview.html 為實際元件輸出、使用清楚標示的合成示範資料，並非線上行情或手機驗收證據。

## 獨立審查與修復
- 審查基準 ca69ed8..202dc1c，無 Critical，3 個 Important：跨棒重複結論排擠不同觀點、未來時間／未對齊收盤紀錄、已錯過觸發仍標待觸發。均已新增重現測試後修復，完整測試綠。
- Ruling：將「等待原因改變但看不出改了什麼」由 Minor 視為本功能核心可讀性需求，一併保留並顯示前後原因與方向；代價為展開區較長，以折疊方式呈現。
- 未修改策略參數、交易 Gate、Production Execution V2、真實下單鎖與正式帳本。唯讀 PR CI 觸發不新增部署流程。

## 尚未發布
自動審查拒絕公開 GitHub 推送：本次實作授權不足以明確授權將程式與文件發布至公開儲存庫。未改用其他工具繞過拒絕；未建 PR、未合併、未部署。等待 Owen 確認公開目的地 `yangyii0113-sudo/binance-passive-bot` 與本批改動的發布授權。

## 公開發布授權後續
Owen 已針對明確目的地、這批程式／測試／文件、新分支及草稿 PR 的確認問題回覆「開始」，授權推送至 `yangyii0113-sudo/binance-passive-bot`。本次僅推送獨立分支並建立 draft PR；不自動合併或啟動正式部署。先前拒絕是歷史紀錄。
