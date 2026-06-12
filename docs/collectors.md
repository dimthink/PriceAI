# 采集器与来源扩展

PriceAI 的采集目标是从原站读取真实商品标题、价格、库存状态和购买链接，并写入 `raw_offers`。

## 采集方式

| 方式 | 适用场景 |
| --- | --- |
| 公开结构化数据 | 用户自有或已获授权的公开 JSON |
| 原站接口 | Shop API、独角数卡类接口、可公开读取的商品接口 |
| HTML 解析 | 商品列表直接渲染在页面中的卡网站点 |
| 本机浏览器采集 | 动态页面、分类切换、需要人工通过轻量验证的页面 |
| 采集器待办 | 真实渠道但当前解析器不支持，需要后续新增适配 |

## 常用命令

查看可识别渠道：

```bash
npm run collect:prices -- --list
```

采集全部支持渠道并写入：

```bash
npm run collect:prices -- --all --post
```

默认写入策略：

- 成功采集的来源先进入写入队列，每 `20` 个来源 flush 一次，或每 `120` 秒 flush 一次，哪个先到用哪个。
- 采集失败的来源仍然立即写入失败日志，方便后台及时看到错误原因。
- 单个来源报价过多时，仍会按 `--post-batch-size` 拆成多段写入，并保留最后一段的完整快照语义。
- 进程结束前会强制 final flush，避免尾批成功数据滞留在本地。

可通过参数调整：

```bash
npm run collect:prices -- --all --post --flush-source-count 20 --flush-interval-ms 120000
```

对应环境变量：

```bash
PRICEAI_COLLECT_FLUSH_SOURCE_COUNT=20
PRICEAI_COLLECT_FLUSH_INTERVAL_MS=120000
```

排除某一类采集器：

```bash
npm run collect:prices -- --all --post --exclude-kind dujiao
```

只采集某一类采集器，例如 `dujiao` 并发 2 试点：

```bash
npm run collect:prices -- --all --kind dujiao --concurrency 2 --post
```

只采集 `shopApi`，按不同主域并发 2，同一主域内部仍然串行：

```bash
npm run collect:prices -- --all --kind shopApi --concurrency 2 --post --liandong-shop-limit 10
```

采集单个来源并写入：

```bash
npm run collect:prices -- --source aisou-pro --post
```

浏览器兜底采集：

```bash
npm run collect:browser -- --url https://aisou.pro/ --password your-admin-password --post
```

## 输出字段

采集器应尽量输出：

- `sourceTitle`：原始商品标题
- `price`：解析后的数字价格
- `status`：`available` 或 `out_of_stock`
- `url`：原站购买链接
- `stockCount`：可选库存数量

前台只展示 `有货` 和 `缺货`。采集失败、重试中、解析失败、待开发采集器等状态属于后台诊断信息。

## 采集性能与失败分组

查看最近采集性能、慢来源、失败来源和失败原因分组：

```bash
npm run collect:performance -- --hours 24 --limit 1500
```

输出中的 `Failure groups` 可用于判断后续处理方向：

- `missing-shop-token`：补正确店铺入口或从商品链接反查店铺入口。
- `waf-or-challenge`：不要直接判缺货，应降低频率、换节点或进入待开发采集器。
- `empty-result`：检查入口是否下架或页面结构是否变化。
- `network`：检查采集节点网络，国内风控站点优先放到国内节点。
- `partial-batch`：优先确认分页和分批写入是否完整，通常不是解析器完全失败。

## 新增来源流程

1. 后台或脚本新增来源 URL。
2. 系统根据域名和页面特征识别采集器。
3. 执行试采集。
4. 试采集成功：加入启用来源，下次定时任务自动采集。
5. 试采集失败但渠道真实：进入采集器待办，后续新增解析器或扩展已有解析器。
6. 来源无效或不相关：拒绝。

## 采集器质量要求

- 价格必须在商品作用域内解析，避免把库存、销量、规格编号当作价格。
- 支持 `¥1,280.00`、`￥1,280`、`103.40` 等常见格式。
- 采集成功但旧商品消失时，可以将旧报价标记为缺货或过期。
- 单次采集失败不等于缺货，应记录失败原因并重试。
- 不采集需要绕过验证码、登录限制或 WAF 的内容。

## 链动小铺类渠道策略

`pay.ldxp.cn`、`pay.qxvx.cn`、`catfk.com` 等 `shopApi` 渠道属于同一类“一个主域承载多个店铺”的来源。大量新增这类店铺时，不能把每个店铺都当成完全独立站点并在同一轮里连续请求，否则容易触发 JS 挑战、验证码、WAF 或 IP 限流。

当前 `shopApi` 专项采集采用“跨主域并发、同主域串行”的策略：

- `pay.ldxp.cn`、`pay.qxvx.cn`、`catfk.com` 等不同主域可以并行。
- 同一个主域内的多个店铺暂时仍然串行。
- 单主域内部并发 2 需要后续单独压测后再决定。

当前批量采集默认启用渠道族保护：

- 同一轮批量任务默认最多采集 `20` 个链动小铺店铺。
- 同一渠道族两次请求默认间隔 `15` 秒。
- 同一渠道族频繁返回 `HTTP 403` 时，默认进入 `5` 分钟短冷却，后续同主域店铺跳过到下一轮。
- 一旦返回验证/风控页面，当前进程会对该渠道族熔断 `30` 分钟，后续同族店铺跳过到下一轮。
- 单个渠道手动试采不默认套用批量限速，便于后台定位单点问题。

可通过环境变量或命令参数调整：

```bash
PRICEAI_LIANDONG_SHOP_BULK_LIMIT=20
PRICEAI_LIANDONG_SHOP_BULK_DELAY_MS=15000
PRICEAI_LIANDONG_SHOP_403_COOLDOWN_MINUTES=5
PRICEAI_LIANDONG_SHOP_403_THRESHOLD=2
PRICEAI_LIANDONG_SHOP_BREAKER_MINUTES=30
```

或：

```bash
npm run collect:prices -- --all --post --liandong-shop-limit 10 --liandong-shop-delay-ms 30000
```

## 轻量边缘采集节点

当某个 `shopApi` 主域对固定 VPS IP 风控较强时，可以临时换一台云服务器作为轻量采集节点。新机器不需要 clone PriceAI 仓库，也不需要安装 Supabase 配置；只要有 Node.js 18+ 和 `curl`，执行一行命令即可从 PriceAI 拉取采集任务、采集、再回传结果。

先 dry-run 验证该 IP 能否访问 `shopApi` 渠道：

```bash
curl -fsSL https://priceai.cc/priceai-edge-collector.sh | env \
  PRICEAI_AGENT_TOKEN="<ADMIN_PASSWORD 或 CRON_SECRET>" \
  PRICEAI_COLLECTOR_NODE_ID="cn-vps-test-1" \
  PRICEAI_COLLECTOR_NODE_NAME="临时国内采集节点 1" \
  PRICEAI_COLLECTOR_NODE_REGION="cn" \
  bash -s -- --family shopApi --limit 3 --round --dry-run
```

确认可用后，正式跑一轮并写回：

```bash
curl -fsSL https://priceai.cc/priceai-edge-collector.sh | env \
  PRICEAI_AGENT_TOKEN="<ADMIN_PASSWORD 或 CRON_SECRET>" \
  PRICEAI_COLLECTOR_NODE_ID="cn-vps-test-1" \
  PRICEAI_COLLECTOR_NODE_NAME="临时国内采集节点 1" \
  PRICEAI_COLLECTOR_NODE_REGION="cn" \
  bash -s -- --family shopApi --limit 3 --round
```

服务器上建议用 `systemd timer` 每 30 分钟触发一次 `--round`，不要用 5 分钟高频轮询。`--round` 会在启动时固定本轮的 `staleBefore`，持续分批拉取本轮尚未更新的来源，直到没有待采集任务或达到 `--max-round-tasks` 上限。遇到连续 3 个风控/403 失败时，runner 会在本进程内冷却 5 分钟后继续本轮，而不是结束本轮等待下一次定时器。

手工持续调试时才使用 `--loop`：

```bash
curl -fsSL https://priceai.cc/priceai-edge-collector.sh | env \
  PRICEAI_AGENT_TOKEN="<ADMIN_PASSWORD 或 CRON_SECRET>" \
  PRICEAI_COLLECTOR_NODE_ID="cn-vps-test-1" \
  PRICEAI_COLLECTOR_NODE_NAME="临时国内采集节点 1" \
  PRICEAI_COLLECTOR_NODE_REGION="cn" \
  bash -s -- --family shopApi --limit 3 --round --loop --interval 1800
```

当前轻量节点只内置 `shopApi` 解析器，优先用于需要国内 IP 的 `pay.ldxp.cn`、`pay.qxvx.cn`、`catfk.com` 等渠道。中心站点负责下发任务和接收日志，节点只负责执行，不保存长期配置。需要只跑 LDXP 时仍可使用 `--family ldxp` 或 `--family pay.ldxp.cn`。

遇到 `acw_tc`、`cdn_sec_tc`、HTML 脚本挑战页等风控响应时，不应把商品标记为缺货，也不应判定店铺关闭；应记录为采集失败/风控，等待低频复查或切换到合适的采集节点。
