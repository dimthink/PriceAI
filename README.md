<p align="center">
  <img src="src/app/icon.svg" width="112" height="112" alt="PriceAI logo" />
</p>

<h1 align="center">PriceAI</h1>

<p align="center">
  <strong>AI 订阅卡网与模型 API 比价雷达，把分散渠道报价整理成可比较的标准商品。</strong><br/>
  聚合 100+ 卡网渠道里的 ChatGPT、Claude、Gemini、Grok、邮箱、API/CDK 和模型 API 等多渠道报价，看有货最低价，对比来源，跳转原站购买。
</p>

<p align="center">
  <a href="https://linux.do">
    <img src="https://img.shields.io/badge/LINUX%20DO-%E7%A4%BE%E5%8C%BA-2d3435?style=flat-square" alt="LINUX DO 社区" />
  </a>
</p>

<p align="center">
  <a href="https://priceai.cc">在线访问</a> ·
  <a href="https://linux.do">LINUX DO</a> ·
  <a href="#在线使用">在线使用</a> ·
  <a href="#为什么做-priceai">为什么做</a> ·
  <a href="#适合谁">适合谁</a> ·
  <a href="#priceai-怎么解决">怎么解决</a> ·
  <a href="#用户指南">用户指南</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#文档">文档</a> ·
  <a href="#star-趋势">Star 趋势</a>
</p>

---

<p align="center">
  <img src="docs/assets/priceai-home-2026-06-02.png" alt="PriceAI product screenshot" width="100%" />
</p>

## 在线使用

| 需求 | 入口 |
| --- | --- |
| 查看 AI 订阅卡网渠道报价 | [priceai.cc](https://priceai.cc) |
| 比较 ChatGPT Plus / Pro / Team 报价 | [ChatGPT 比价](https://priceai.cc/platforms/chatgpt) |
| 查看官方订阅地区价 | [官方订阅地区价](https://priceai.cc/official-prices) |
| 比较模型 API 和免费 API 渠道 | [模型 API](https://priceai.cc/api-models) |
| 了解卡网渠道是否靠谱 | [AI 订阅卡网渠道靠谱吗？](https://priceai.cc/guides/are-ai-subscription-card-shops-reliable) |

## 为什么做 PriceAI

PriceAI 的起点是一个很具体的购买困惑：为什么同样是 Gemini Pro、ChatGPT Plus、Claude Pro 这类 AI 订阅，有人按官网正价购买，有人能用地区价、学生资格或设备权益拿到更低价格，也有人在闲鱼、群聊或各种代购页面里花高得多的价格购买？

AI 订阅已经不再只有“去官网付费”这一种路径。对很多国内用户来说，还会遇到海外银行卡、App Store / Google Play 地区优惠、账号免费使用资格、代订、成品号、卡密、CDK、共享号、渠道批发等一串复杂问题。便宜渠道确实存在，但它们往往分散在闲鱼、卡网、Telegram 群和个人收藏链接里，而且每个渠道擅长的品类不一样。

结果就是：用户想买一个 ChatGPT Plus 或 Gemini Pro，可能要打开十几个网页，自己判断哪个有货、哪个最低、哪个标题其实不是同一种商品、哪个链接已经失效。这个过程低效，也很容易买贵、买错、买到缺货商品。

PriceAI 想把这件事变成一个清楚的购买前参考工具。它把分散在多个渠道里的 AI 订阅报价收拢起来，按平台和标准商品重新整理，让用户快速回答三个问题：

- 这个商品现在有没有货？
- 有货报价里的最低价是多少？
- 这个价格来自哪个渠道，什么时候确认过？

PriceAI 不卖货、不收款、不担保渠道售后。它更像一个价格雷达：帮用户少开几个网页，少踩一点信息差。

## 适合谁

**经常购买 AI 订阅、账号或额度的人。**  
比如正在找 ChatGPT Plus、ChatGPT Pro、Claude Pro、Gemini Pro、Super Grok、Gmail 老号、API/CDK 额度等商品，希望购买前先横向比较价格和库存。

**注重性价比、但不想自己折腾复杂渠道的人。**  
这类用户愿意为 AI 付费，但不想总按最高价付费，也不想自己研究地区号、海外支付、学生资格、设备权益、bug 号和各种临时教程。

**海外支付受限的用户。**  
他们知道官方服务在哪里买，但缺少合适的支付条件，于是需要代订或渠道服务，同时又担心加价过高、来源不清、售后不稳。

**已经收藏了多个卡网或群链接的进阶用户。**  
他们知道低价渠道存在，也愿意自己判断风险，但缺少一个统一面板来比较不同渠道的价格、库存和更新时间。

**同时使用多个 AI 产品的人。**  
ChatGPT、Claude、Gemini、Grok、Cursor、API 额度叠加起来会变成长期成本。PriceAI 可以作为持续观察 AI 工具栈成本的小面板。

## 解决的痛点

- **价格不透明**：官网正价、地区价、代订价、渠道价和低价账号被不同卡网混在一起，用户很难看到横向关系。
- **渠道太分散**：卡网、Telegram 群、聚合站、二手平台、私人收藏链接都可能有报价，手动打开和比较很耗时间。
- **商品命名混乱**：`Plus 土区直充`、`GPT PLUS 月卡`、`Plus 成品号` 可能都在描述相近商品，但标题并不统一。
- **库存和更新时间不可靠**：低价不代表现在能买，缺货报价如果还参与最低价，会误导用户。
- **风险层级混在一起**：官网代订、地区价、学生权益、设备权益、成品号、共享号、来源不透明账号的风险不同，但常常都被包装成“低价 AI 订阅”。

## PriceAI 怎么解决

PriceAI 的核心不是简单堆商品，而是把“原始报价”整理成“可比较的标准商品”。

```text
多个自有或用户配置渠道
  -> 自动采集原始标题、价格、库存、购买链接
  -> 归类为 ChatGPT Plus / Gemini Pro / Super Grok 等标准商品
  -> 展示有货最低价、渠道数、更新时间和详情报价
  -> 跳转原站购买
```

产品原则：

- **有货最低价优先**：列表页最低价只取有货报价，缺货不会冒充可买价格。
- **保留原始来源**：展示原始渠道名、商品标题、价格、状态、更新时间和购买链接。
- **标准商品归类**：把乱标题整理为 `ChatGPT Plus`、`Claude Pro`、`Gemini Pro` 等可比较对象。
- **自动采集优先**：尽量从原站同步价格和库存，不把人工补录当长期方案。
- **不过度担保**：PriceAI 负责整理信息，不替任何渠道背书；最终购买风险仍由用户判断。

## 当前能力

- **标准商品比价**：按 ChatGPT、Claude、Gemini、Grok、API/CDK、邮箱、其他等平台整理报价；其他类下包含接码、虚拟卡、明确品牌工具账号和其他商品，未单独拆出的工具账号统一并入其他商品。
- **有货 / 缺货**：前台只保留两个明确状态，缺货弱化展示。
- **全部报价视图**：可以直接查看某个平台下所有原始报价。
- **详情对比页**：展示渠道、原始标题、价格、更新时间和原站购买入口。
- **渠道提交**：用户可提交新渠道，后台通过试采集和采集器待办形成扩展闭环。
- **自动采集**：支持公开接口、Shop API、HTML 解析和浏览器兜底采集。
- **后台管理**：管理来源、试采集、批量采集、报价隐藏、分类重建和采集日志。
- **访问分析**：可选接入 Google Analytics 4，用于查看访问和推广效果。

当前线上版本：<https://priceai.cc>

## 不做什么

PriceAI 当前不做交易闭环，不收款，不做担保，也不承诺任何渠道的售后或长期可用性。

## 用户指南

- [AI 订阅卡网渠道靠谱吗？](https://priceai.cc/guides/are-ai-subscription-card-shops-reliable)
- [为什么同一个 AI 订阅价格差这么多？](https://priceai.cc/guides/why-ai-subscription-prices-differ)
- [ChatGPT 有哪些获取方式？](https://priceai.cc/guides/chatgpt-subscription-options)

## FAQ

### AI 卡网渠道是什么？

这里的卡网渠道指售卖 AI 订阅、账号、卡密、CDK、邮箱、API 额度等数字商品的发卡站或渠道站。PriceAI 只整理公开报价和原站链接，不参与交易。

### PriceAI 会卖货或担保渠道吗？

不会。PriceAI 不卖货、不收款、不担保售后，只展示来源、原始标题、价格、库存和更新时间。购买前仍需要到原平台核验。

### 为什么同一个 AI 订阅价格差这么多？

常见原因包括官网正价、官方地区价、代订服务、成品号、卡密、CDK、团队邀请、短期权益和 API 额度等交付方式不同。

### GitHub 这个项目和 priceai.cc 是什么关系？

GitHub 仓库是 PriceAI 的开源代码和文档入口，priceai.cc 是线上可使用的比价工具。

## 快速开始

```bash
npm install
npm run dev
```

默认访问：

- 前台：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`

未配置 Supabase 时，前台会使用内置演示数据。完整环境变量见 [配置说明](./docs/configuration.md)。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run collect:prices -- --all --post
npm run collect:prices -- --source aisou-pro --post
npm run collect:browser -- --url https://aisou.pro/ --password your-admin-password --post
```

## 文档

- [项目介绍长文](./docs/project-intro.md)
- [配置说明](./docs/configuration.md)
- [部署与定时采集](./docs/deployment.md)
- [采集器与来源扩展](./docs/collectors.md)
- [架构说明](./docs/architecture.md)
- [数据策略](./docs/data-policy.md)
- [数据与内容授权](./DATA_LICENSE.md)
- [品牌与商标政策](./TRADEMARKS.md)
- [产品原则](./PRODUCT.md)
- [设计系统](./DESIGN.md)
- [GA4 分析](./docs/analytics.md)

`PRODUCT.md` 和 `DESIGN.md` 保留在根目录，供设计与产品工作流直接读取。

## Star 趋势

<a href="https://star-history.com/#physics-dimension/PriceAI&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=physics-dimension/PriceAI&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=physics-dimension/PriceAI&type=Date" />
    <img alt="PriceAI Star History Chart" src="https://api.star-history.com/svg?repos=physics-dimension/PriceAI&type=Date" />
  </picture>
</a>

## Roadmap

- 提高采集稳定性，减少失败来源，完善重试和最近确认时间展示。
- 优化 ChatGPT、Claude、Gemini、Grok、邮箱、API/CDK、其他辅助商品等分类规则。
- 让用户提交渠道后的解析、试采集、待办和纳入采集形成闭环。
- 在不做担保的前提下，补充更清晰的交付方式、套餐差异和风险提示。
- 继续验证它是否适合长期运营、开源协作和社区共建。

## 贡献

欢迎通过 Issue 或 Pull Request 提交：

- 新渠道采集器
- 价格解析修复
- 商品分类规则优化
- UI/交互改进
- 文档补充

开始前建议先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。涉及验证码、登录墙、WAF 或敏感凭据的站点，不应通过绕过限制的方式采集。

## License

PriceAI 的软件代码使用 [GNU Affero General Public License v3.0](./LICENSE) 开源。

`PriceAI` 名称、Logo、域名、视觉品牌、线上生产数据、渠道数据、价格快照、指南内容和截图不随软件代码授权。Fork、二次开发或部署公开服务时，请阅读 [数据与内容授权](./DATA_LICENSE.md) 和 [品牌与商标政策](./TRADEMARKS.md)，并避免让用户误认为你的服务是官方 PriceAI。
