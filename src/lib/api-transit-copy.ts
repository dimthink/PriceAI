export const TRANSIT_COMBINED_RATE_EXPLANATION =
  "综合倍率 = 充值倍率 × 模型倍率，是最终成本倍率。ChatGPT、Claude、Gemini 按官方 USD 标准价折算：0.10x 约等于 0.10 元获得官方价 1 美元的等值用量；GLM、DeepSeek、Kimi、千问等国产模型按官方人民币价折算；没有公开按量基准的预览模型只展示实际报价，不计算官方倍率。越低越便宜。";

export const TRANSIT_RATE_BREAKDOWN_EXPLANATION =
  "这里拆开展示综合倍率的来源。多数中转站的站内额度默认按美元记账，充值倍率表示人民币充值后折成 1 美元站内额度的成本：1:1 记为 1.00x，1:10 记为 0.10x，也就是大约 0.10 元买到 1 美元额度。模型倍率表示该模型分组相对官方价格的扣费倍数。两者相乘后得到左侧综合倍率。例：充值倍率 0.10x × 模型倍率 1.50x = 综合倍率 0.15x。";

export const TRANSIT_CACHE_HIT_RATE_EXPLANATION =
  "这里按 PriceAI 当前较保守的分组口径统计：cache 读取 / (普通输入 + cache 写入 + cache 读取)，会把 cache 写入也计入分母。Sub2API 用户侧常见口径通常是 cache 读取 / (普通输入 + cache 读取)，所以 Claude 分组 cache 写入较多时，PriceAI 显示的 85%–88% 可能对应用户侧约 97% 的读缓存命中。该值用于提示缓存覆盖和成本变化，不计入默认综合倍率。";

export const TRANSIT_RECHARGE_COEFFICIENT_EXPLANATION =
  "充值倍率只描述人民币与站内额度的换算关系，不代表某个模型本身便宜或贵。站内额度通常按美元计费：1:1 记为 1.00x，1:10 记为 0.10x，表示约 0.10 元换到站内 1 美元额度；最终价格还要再乘以模型倍率。";

export const TRANSIT_MODEL_MULTIPLIER_EXPLANATION =
  "模型倍率来自站点公开或后台确认的模型分组价格，用来表示该模型相对官方标准价的扣费比例；需要再乘以充值倍率，才是综合倍率。";

export const TRANSIT_MONITORED_PRICE_EXPLANATION =
  "用代表模型的官方输入、输出、缓存、图片或视频价格按综合倍率换算；不代表该站全部模型都同价。";
