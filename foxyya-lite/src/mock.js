export const mock = Object.freeze({
  news: [
    ['01', '通膨與利率走向', '關注主要經濟體通膨數據與利率政策動向，影響市場風險偏好。', 'BTC / 美元'],
    ['02', '地緣局勢與能源風險', '地緣政治緊張情勢持續，能源供應與價格波動備受關注。', '黃金 / 原油'],
    ['03', '全球經濟與資金流向', '全球經濟成長前景與資金流向變化，影響多類資產表現。', 'ETH / 美股']
  ],
  strategies: [
    { symbol: 'BTC / USDT', strategy: '策略 A', direction: '偏多觀察', status: '等待確認', rr: '1.8R', confidence: '中' },
    { symbol: 'ETH / USDT', strategy: '策略 B', direction: '中性觀察', status: '觀察中', rr: '1.4R', confidence: '中' }
  ]
});
