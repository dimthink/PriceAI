---
name: transit-onboard
description: 核验并录入 PriceAI API 中转站，默认保存为后台待审核草稿，同时完成公开价格与监测来源发现、定价归一化和冲突标记、配置与回归测试、单站采集入库、Huoshan2 collector runtime 同步及生产验收。用于用户提供中转站网址、New API/Sub2API 系统信息、站长资料，要求“补充中转站”“录入后台”“先别展示前台”“等我审核后上架”，或在审核后明确要求启用前台展示与定时采集时。
---

# Transit Onboard

把 API 中转站从零散资料推进到可审核的 PriceAI 后台记录。默认执行 `draft` 模式；除非用户在当前请求明确授权前台展示，否则不得发布。

## 模式

- `draft`：默认。核验、配置、测试、单站采集、后台入库、runtime 同步，保持 `autoPublish=false`、`published=false`、`pending_review`。
- `activate`：仅在用户明确说“审核通过”“允许前台展示”“上架”时使用。发布前重新核验资料、报价、监测和定时来源选择。

普通的“继续”“同步”“部署”不等于授权 `activate`。

## 开始前

1. 阅读仓库 `AGENTS.md`，遵守 Trellis、提交、Cloudflare 和生产数据库规则。
2. 检查 `git status`，隔离无关 dirty 文件；必要时使用干净 worktree。
3. 实际录入会修改配置、数据库或生产状态时，按当前 workflow 创建并启动 Trellis 实现任务。
4. 读取：
   - `references/intake-fields.md`：输入字段、缺失值和配置映射。
   - `references/new-api-discovery.md`：New API/Sub2API 公开接口发现。
   - `references/pricing-normalization.md`：价格换算和冲突判断。
   - `references/verification-gates.md`：后台、runtime、部署和公开边界验收。
5. 涉及生产发布时加载 `priceai-production-deploy`；涉及 Huoshan2 时加载 `server-ops-live-audit`。服务器和生产操作留在主会话执行。

## Draft 工作流

### 1. 整理输入

- 接受只有官网 URL 的最小输入，自动发现可公开核验的信息。
- 保留站长原始声明与 PriceAI 公开核验结果，不把两者合并成单一事实。
- 非阻塞字段缺失时写 `unknown`、风险标签或待办，不反复追问。
- 只有站点身份不明、网址不可解析、需要凭据、或写入目标不明确时才暂停询问。
- 不读取、回显或保存明文 API Key、密码、Cookie、恢复码。

### 2. 发现公开证据

New API 优先运行：

```bash
node .agents/skills/transit-onboard/scripts/inspect-new-api-source.mjs --url <website-url>
```

结合页面资源和结构化响应确认系统类型、价格接口、状态接口及数据来源。公开状态页属于站方监测，不得写成 PriceAI API Key 实测。

### 3. 分析定价

- 同时保存充值倍率、分组倍率、模型倍率、固定按次价格和原始 payload。
- 计算归一化有效倍率后再比较，不直接比较不同口径的裸倍率。
- 站长声明与公开接口不一致时，两份口径都保留到 `cautions`、`verificationEvents` 和 `adminNote`，标记为待审核，不擅自选边。

### 4. 添加后台来源配置

- 搜索相似来源和现有测试，沿用 `config/api-transit-sources.json` 的字段和排序习惯。
- New API 通常使用 `collectorKind=new_api_pricing`、`stationSystem=new_api`。
- ai-transit.v1 快照通常使用 `collectorKind=ai_transit_snapshot`、`stationSystem=sub_to_api`。
- `draft` 模式必须显式写 `autoPublish=false`。
- 添加 `scripts/test-api-transit.mjs` 回归断言，覆盖身份、公开 URL、用户提供的商业字段、定价差异和不自动发布。

完成配置后运行：

```bash
node .agents/skills/transit-onboard/scripts/verify-source-config.mjs --source <source-id>
npm run test:api-transit
npx eslint scripts/test-api-transit.mjs
npm run typecheck
git diff --check
```

按改动风险决定是否运行完整构建。

### 5. 单站采集并写入后台

先 dry-run：

```bash
node scripts/collect-api-transit.mjs --source <source-id> --dry-run --post
```

核对来源数、模型数、分组、倍率、固定价和监测匹配，再写入：

```bash
node scripts/collect-api-transit.mjs --source <source-id> --post
```

禁止添加 `--publish`。写入后回读数据库/后台，确认站点为待审核、报价为 `needs_review`。

### 6. 验证未公开

同时检查：

- `published=false`
- `data_status=pending_review`
- `autoPublish=false`
- 前台列表无站点名称和 slug
- 公开详情 API 不暴露该草稿

动态路由 HTML 壳的 `200` 不能作为公开证明；优先信任公开详情 API 和列表数据。

### 7. 同步 collector runtime

配置属于 collector runtime watchlist。提交配置与测试后同步 Huoshan2：

```bash
npm run collector-runtime:sync-source -- \
  --apply \
  --host=huoshan2 \
  --remote-root=/opt/priceai-nonshop \
  --base-ref=<base-ref> \
  --target-ref=<commit-ref>
```

回读 `/opt/priceai-nonshop/runtime-manifest.json` 和远端来源配置，确认 SHA 与来源 ID。不要在小型生产服务器上构建、安装依赖或跑测试。

### 8. 提交、推送与部署

- 独立提交本次来源、测试和 Skill 相关改动，不纳入无关 dirty 文件。
- 配置/应用行为需要生产发布时走 `npm run deploy:production -- --wait`，并传入 collector runtime sync SHA。
- 默认生产入口是 Cloudflare Workers + OpenNext，禁止改走 Vercel。
- 无 schema 变更时明确记录“无数据库 migration”。

## Activate 工作流

1. 要求当前请求中存在明确上架授权。
2. 重新采集价格与监测，复核此前所有冲突和待办。
3. 通过后台审核动作或项目既有发布流程启用站点；不要只把配置改为 `autoPublish=true` 来绕过审核。
4. 验证公开列表、详情 API、价格数量、来源标签和缓存头。
5. 验证已发布站点进入定时来源选择。
6. 等待下一轮真实 timer，确认 `lastCollectedAt` 再次推进后才宣布完成。

## 输出

每次交付都报告：

- 已识别资料与仍缺字段。
- 价格页、监测页和结构化接口。
- 站长声明、公开事实、归一化结果及冲突。
- 后台站点/报价/监测写入结果。
- 未公开或已上架的业务证明。
- runtime manifest SHA、提交、推送和部署引用。
- 自动采集是否已验证；未验证时说明原因和下一步。
