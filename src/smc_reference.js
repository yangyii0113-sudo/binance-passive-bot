// Manual reference only; never part of signal scoring or execution gates.
export function smcReference(){
 return `<section id="smc-reference" tabindex="-1" class="smc-reference" aria-label="SMC 對照與翻車點">
 <div class="smc-heading"><span class="research-kicker">看進場計畫時，快速對一下</span><h3>SMC 對照＋翻車點</h3><p>以下是本頁採用的常見判讀口徑；不同工具可能不同。僅供人工核對，平台尚未自動辨識 OB／FVG／BOS。</p></div>
 <button type="button" class="secondary-btn" data-scroll-target="coin-analysis">返回幣種分析 ↑</button>
 <details class="core-disclosure" data-search="smc-definitions"><summary>OB／FVG／BOS 定義與翻車點</summary><div class="smc-grid">
 <article><h4>OB｜訂單區塊</h4><p><strong>定義：</strong>明顯推進、突破結構前的最後一根反向 K 棒，作為候選區域；上漲前看陰棒，下跌前看陽棒。</p><p><strong>怎麼對：</strong>先確認後續推進與結構，再固定用整根高低或實體畫區，不事後改框。</p><p class="smc-pitfall"><strong>翻車點：</strong>每根反向棒都當 OB；碰到區域就進場；把圖形當作機構掛單證據。先寫清楚穿越哪個邊界、以影線或收盤判定失效。</p></article>
 <article><h4>FVG｜公允價值缺口</h4><p><strong>定義：</strong>三根已收盤 K 棒中，第一根與第三根影線範圍不重疊的區間。</p><p><strong>怎麼對：</strong>多方：第 3 根低點 ＞ 第 1 根高點；空方：第 3 根高點 ＜ 第 1 根低點。兩個價格之間才是缺口。</p><p class="smc-pitfall"><strong>翻車點：</strong>把單根長實體當 FVG；第 3 根未收盤就畫；認定一定回補或回補後必反彈。中間一根可能已在該區成交，並非「完全沒交易」。</p></article>
 <article><h4>BOS｜結構突破</h4><p><strong>定義：</strong>沿既有趨勢，突破事先確認的波段高／低點。本頁以收盤越過為確認口徑。</p><p><strong>怎麼對：</strong>先標週期與有效波段；上升結構看突破前高，下降結構看跌破前低。</p><p class="smc-pitfall"><strong>翻車點：</strong>影線刺穿就算 BOS；混用大、小週期；把逆勢破位當延續。逆勢破位先視為結構轉變候選，不等於反轉已確認。</p></article>
 </div>
 </details><div class="smc-check"><strong>進場前快速核對</strong><ul><li>同一幣種、同一週期？關鍵 K 棒是否已收盤？</li><li>區域與波段當時已確認？有沒有用後面的行情倒推？</li><li>寫清楚觸發價、失效點、有效期限；看到區域不等於已觸發。</li><li>前方支撐／壓力是否壓縮止盈？成本與部位風險是否已計入？</li></ul><p>三者重疊不等於三份獨立證據，也不代表已驗證的高勝率。維持僅模擬交易、真實下單鎖定。</p></div>
 <p class="smc-source">定義參考：<a href="https://www.luxalgo.com/blog/ict-trader-concepts-order-blocks-unpacked/" target="_blank" rel="noopener noreferrer">LuxAlgo：OB、FVG 與結構判讀</a>。本區不改變既有進出場條件。</p>
 </section>`;
}
