# FOXYYA 獨立研究追蹤服務

此服務讓新研究在獨立主機運作，**不是正式帳本、不是實盤、不是帳戶投報率**。原手機版及 Production Execution V2 不受本服務控制。

## 本機啟動（Mac mini／Linux）

需 Node.js 24。使用一個新的專用目錄，不能指向 canonical ledger 或既有備份目錄。

```sh
node --test tests/research-service.mjs
RESEARCH_DATA_DIR="$HOME/foxyya-independent-research" node research-service/main.mjs
```

預設僅監聽 `127.0.0.1:8091`。檢查：

```sh
curl --fail http://127.0.0.1:8091/healthz
curl --fail http://127.0.0.1:8091/readyz
curl http://127.0.0.1:8091/api/research/snapshot
```

`healthz` 200 只代表程序可回應；`readyz` 200 還要求本輪選幣完成且行情連續。WAITING／BLOCKED 不是可用的行情證明。電腦睡眠、關機、網路中斷仍會停止觀察，單純啟動命令不等於完成 24/7 驗收。

## 容器

在專案根目錄：

```sh
docker build -f research-service/Dockerfile -t foxyya-independent-research .
docker volume create foxyya-independent-research
docker run -d --name foxyya-independent-research --restart unless-stopped \
  -p 127.0.0.1:8091:8091 \
  -v foxyya-independent-research:/research \
  foxyya-independent-research
```

維持單一 replica；不能同時在第二台主機共享同一 SQLite 目錄。健康檢查使用 `/healthz`，可用性監測另查 `/readyz`。`RESEARCH_PORT` 預設 8091，雲端服務須把路由 target port 設成同一埠，或明確設定此變數。不要直接接管現有 Railway 研究磁碟。

## 資料與恢復

- 資料檔：`research-v1.sqlite` 及 SQLite WAL；另有 `research-v1.writer.sqlite` 作程序鎖。
- 限制：預設 DB + WAL 256 MiB、磁碟剩餘至少 16 MiB。不自動刪除資料；到限停止並回報，`RESEARCH_MAX_BYTES` 可在容量評估後調整。
- 只有活躍觀察的逐筆成交寫入完整 TICK 事件；空閒行情只保留連線、首筆與分析事件，不宣稱保存全市場逐筆資料。
- 每筆保存策略版本、觀察時間、成交序號與成本；完整結案才能納入損益。沒有樣本時損益為 null，不能換成 0% 投報率。
- 重啟先將未完成樣本標記 GAP，再開始新的分析；斷線重試至少間隔 30 秒。同一訊號 ID 不可重新成交，不重播停機時段。
- 市場篩選失敗至少隔 60 秒再讀取目前行情；正常每次小時切換執行，不補跑漏掉的小時。
- 寫入失敗後鎖定停止；先保留資料並排除磁碟問題，再重新啟動驗證。不得刪 DB、改狀態或繞過完整性檢查。
- 備份時先正常停止服務，再複製完整專用目錄；不要只複製正在寫入的主 DB。還原後未完成樣本一律中斷。尚未提供自動異地備份。
- SHA-256 串鏈檢查局部損壞與投影一致性，並非外部簽章或防止整庫惡意重寫的證明。

## 唯讀介面

只提供 GET `/healthz`、`/readyz`、`/api/research/snapshot`。沒有寫入 API、交易所私鑰或真實下單能力，也不提供 `/api/runtime/snapshot`。快照最近 100 筆，統計讀取全部已保存樣本；不包含整體帳戶淨值、投組風險或 canonical fills。

預設只供本機使用；遠端存取應透過私人網路或附帶存取控制的 HTTPS 閘道。本輪尚未接到 GitHub Pages 的手機介面，不會把尚未部署的後端顯示為在線。

## 部署驗收還缺什麼

1. 確定實際主機與專用持久磁碟，證明容器／程序重啟後資料仍保留。
2. 從該主機確認 Binance REST 和 WebSocket 可達，首筆時間與連續序號通過。
3. 累積真實的新觀察；確認 24 小時運作與中斷紀錄。程式測試通過不等於已全天候上線。
4. 若接入平台，使用獨立研究來源標示與唯讀代理，不能替代正式帳本。

## 2026-09-26 實際驗證

- 本機後端 21 項測試通過；既有 127 項測試與靜態 build 通過。Docker CLI 在本工作環境未提供，因此尚未實際 build 容器。
- 實際 main 程序可啟動、回應及正常停止。此工作環境 Binance REST 請求逾時時，`/healthz` 200、`/readyz` 503、`ready:false`、結案數 0、損益 null，未產生虛構樣本。
- Railway 唯讀盤點：研究專案的 staging 與 backup helper 均顯示 FAILED；staging 最近失敗紀錄為健康檢查 HTTP 404。已有 /data 與 /backup 掛載，但本輪未檢查磁碟內容、未接管或新增付費服務。
- 尚無本服務在外部主機的連續行情／24 小時運行證據，也未連線使用者 Mac mini。本輪不能宣稱全天候上線完成。

## 主機連線預檢（2026-10-01）

在準備部署的主機、專案根目錄執行（Node.js 24）：

```sh
node research-service/preflight.mjs
```

此命令只讀取公開合約與行情，檢查兩筆連續的 WebSocket 成交，之後立即關閉連線；不寫入研究帳本、不啟動交易或背景服務。REST 失敗就停止，不切換代理或替代網路。

- `ready: true`：此次 REST 與兩筆連續行情通過，仍需正式程序、持久磁碟、重啟與 24 小時觀察驗收。
- `restricted`／HTTP 451：來源拒絕該連線環境，須確認來源的使用資格或洽來源客服；不繞過限制。
- `network`：沒有取得 HTTP 回應，原因仍未知。`timeout`：請求逾時。兩者都不是已證實的地區限制。
- `rate`：來源限流。`payload`：資料格式不符。預檢不改變 fail-closed 條件。

2026-10-01 此工作環境用 curl 實測合約清單回應 HTTP 451，內容明確表示 restricted location；僅能證明此工作環境的限制，不能代替使用者手機或 Mac mini 的測試。當日 Railway 研究 Staging 仍是 2026-09-14 FAILED，來源仍指向 v12 舊分支，尚無此獨立服務上線證據。
