# NodeBits 公开渠道候选清单

> 文档类型：候选渠道线索清单
> 数据来源：NodeBits 公开接口 `/api/shops`、`/api/products`，NodeBits 前端公开读取的 `shops.url`，以及 PriceAI 当前 `sources` 表
> 更新日期：2026-06-03 16:39（Asia/Shanghai）
> 使用边界：只把公开出现的原站入口作为候选渠道线索，不导入 NodeBits 报价、排序、收藏数、浏览量或描述作为 PriceAI 数据。

## 1. 口径修正

之前版本只有 58 个渠道，是因为提取口径只看了商品记录里的 `raw_text.shopUrl`。这个字段只覆盖已经被 NodeBits 商品采集写入过的店铺，不等于 NodeBits 的完整店铺池。

本版改为以 NodeBits 店铺详情页公开读取的 `shops.url` 为主口径，再用 `/api/shops` 补充店铺标签，用 `/api/products` 仅做商品数量和样例辅助。同时，本版会和 PriceAI 当前 `sources` 表按规范化 `entry_url` 去重，避免重复导入已有渠道。

## 2. 提取与分组结果

- PriceAI 当前渠道表：54 个渠道，其中启用 52 个。
- NodeBits 公开店铺接口返回：117 个店铺。
- NodeBits 店铺表中 active 且带原站 URL：118 个。
- NodeBits 规范化后唯一原站入口：113 个。
- D 组，PriceAI 已有渠道，不重复导入：12 个。
- A 组，可新增候选源并进入采集：2 个。
- B 组，需要复核或补采集器：96 个。
- C 组，暂不导入/可丢弃：3 个。
- 重复 URL 分组：5 组。
- NodeBits 商品接口本次读取：1370 条，仅用于统计和样例，不作为 PriceAI 报价来源。

## 3. 分组规则

- D 组：已经能在 PriceAI 当前 `sources` 表中找到同一规范化入口，保留为已存在记录，不重复导入。
- A 组：不在 PriceAI 当前渠道表内，现有采集器可以识别，入口形态是店铺或站点入口，并且基础探测通过。后续可以新增为候选源，再跑正式试采集。
- B 组：不在 PriceAI 当前渠道表内，链接可能是真实渠道，但当前采集器无法识别，或探测遇到风控/超时/入口形态不够标准。需要人工复核、试采集或补采集器。
- C 组：明显不是可采集渠道，例如本地测试地址、单商品链接、社群邀请链接，或页面已不存在。暂不导入。

## 4. D 组：PriceAI 已有渠道，不重复导入

| # | 原站入口 | NodeBits 店铺名/别名 | 已有 PriceAI 渠道 | 标签线索 | 采集器/状态 | 处理建议 |
|---:|---|---|---|---|---|---|
| 1 | [https://bei-bei.shop/](https://bei-bei.shop/) | 贝贝商店 | beibei(beibei-1d63pj, 启用, beibeiHtml) | ChatGPT, Gemini, Claude, Grok | beibeiHtml / HTTP 200 | 已存在，不重复导入 |
| 2 | [https://pay.ldxp.cn/shop/VUOJQOHY](https://pay.ldxp.cn/shop/VUOJQOHY) | 小久会员店 | 小久(ldxp-vuojqohy, 启用, shopApi) | ChatGPT, Claude, Grok | shopApi / API FAIL | 已存在，不重复导入 |
| 3 | [https://pay.ldxp.cn/shop/Tora](https://pay.ldxp.cn/shop/Tora) | Tora-雪诺AI源头小铺 | LDXP / Tora(ldxp-tora, 启用, shopApi) | ChatGPT, Claude, Discord, Gemini, Grok, Telegram | shopApi / API FAIL | 已存在，不重复导入 |
| 4 | [https://pay.ldxp.cn/shop/aishop1](https://pay.ldxp.cn/shop/aishop1) | GPT大玩家, GPT 大玩家 | LDXP / aishop1(ldxp-aishop1, 启用, shopApi) | ChatGPT, Claude, Outlook | shopApi / API FAIL | 已存在，不重复导入 |
| 5 | [https://pay.ldxp.cn/shop/1D0LD6BR](https://pay.ldxp.cn/shop/1D0LD6BR) | 小猫GPT源头 | LDXP / 1D0LD6BR(ldxp-1d0ld6br, 启用, shopApi) | ChatGPT | shopApi / API FAIL | 已存在，不重复导入 |
| 6 | [https://pay.ldxp.cn/shop/IK7OYLXZ](https://pay.ldxp.cn/shop/IK7OYLXZ) | 猫猫豆 | LDXP / 猫猫豆(ldxp-猫猫豆, 启用, shopApi) | ChatGPT, Grok | shopApi / API FAIL | 已存在，不重复导入 |
| 7 | [https://burstpro-ai.online/](https://burstpro-ai.online/) | BurstPro 智選商城 | Auto Subscribe / BurstPro AI(burstpro-ai-1kplv5, 启用, dujiao) | ChatGPT | dujiao / HTTP 200 | 已存在，不重复导入 |
| 8 | [https://pay.ldxp.cn/shop/7HVUEC3Y](https://pay.ldxp.cn/shop/7HVUEC3Y) | 464 | LDXP / 7HVUEC3Y(ldxp-7hvuec3y, 启用, shopApi) | ChatGPT | shopApi / API FAIL | 已存在，不重复导入 |
| 9 | [https://zzshu.com/](https://zzshu.com/) | 吱吱鼠 | RedeemGPT / zzshu.com(redeemgpt-121whr, 启用, kami) | ChatGPT, Claude, Gemini, Grok | kami / HTTP 200 | 已存在，不重复导入 |
| 10 | [https://pay.ldxp.cn/shop/2E2KPQD1](https://pay.ldxp.cn/shop/2E2KPQD1) | AI杂货 | LDXP / 2E2KPQD1(ldxp-2e2kpqd1, 启用, shopApi) | ChatGPT, Claude | shopApi / API FAIL | 已存在，不重复导入 |
| 11 | [https://pay.ldxp.cn/shop/echo_dream](https://pay.ldxp.cn/shop/echo_dream) | AI小铺 | LDXP / echo_dream(ldxp-echo-dream, 启用, shopApi) | ChatGPT, Gemini, Grok | shopApi / API FAIL | 已存在，不重复导入 |
| 12 | [https://pay.ldxp.cn/shop/AWXK3UJY](https://pay.ldxp.cn/shop/AWXK3UJY) | 彩虹马的AI店 | LDXP / 彩虹马的AI店(ldxp-彩虹马的ai店, 启用, shopApi) | ChatGPT | shopApi / API FAIL | 已存在，不重复导入 |

## 5. A 组：可新增候选源并进入采集

| # | 原站入口 | NodeBits 店铺名/别名 | 标签线索 | 商品样例数 | 采集器/状态 | 处理建议 | 样例商品 |
|---:|---|---|---|---:|---|---|---|
| 1 | [https://pay.qxvx.cn/shop/1V4GVK7D](https://pay.qxvx.cn/shop/1V4GVK7D) | 大发AI资源站 | ChatGPT, Claude, Cursor, Gemini, Grok | 0 | shopApi / API OK | 可新增为候选源并进入试采集 | 无公开商品样例 |
| 2 | [https://yh-mo.xyz/](https://yh-mo.xyz/) | yh-mo | Gemini | 0 | kami / HTTP 200 | 可新增为候选源并进入试采集 | 无公开商品样例 |

## 6. B 组：需要复核或补采集器

B 组不再作为一个平铺大表处理，而是按“当前建议采集器”细分。这里的“采集器”来自 PriceAI 现有识别逻辑；如果是 `待补采集器`，表示目前还没有稳定解析器可以直接接入。

- shopApi：55 个。现有 shopApi 采集器已能识别，但轻量探测未通过，建议优先跑正式试采集或补充重试/风控处理；状态：API FAIL 55 个。
- 待补采集器：41 个。当前无法归入现有采集器，需要按站点形态继续拆分和补采集器；状态：HTTP 200 39 个，probe fail 2 个。

### 6.1 shopApi（55 个）

现有 shopApi 采集器已能识别，但轻量探测未通过，建议优先跑正式试采集或补充重试/风控处理；状态：API FAIL 55 个。

| # | 原站入口 | NodeBits 店铺名/别名 | 标签线索 | 商品样例数 | 采集器/状态 | 处理建议 | 样例商品 |
|---:|---|---|---|---:|---|---|---|
| 1 | [https://pay.ldxp.cn/shop/chenxiaochun](https://pay.ldxp.cn/shop/chenxiaochun) | 高质稳定号 | ChatGPT | 3 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Chatgpt plus 日抛；ChatGPT Pro 5X 无保 |
| 2 | [https://pay.ldxp.cn/shop/1I2Y9GEC](https://pay.ldxp.cn/shop/1I2Y9GEC) | 靠谱AI | ChatGPT | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 28天质保-Gmail/iCloud邮箱plus成品账号；【包过，不过不收费】Chatgpt-cyber认证 |
| 3 | [https://pay.ldxp.cn/shop/J6F0Z1MF](https://pay.ldxp.cn/shop/J6F0Z1MF) | 恶小梦API | ChatGPT, 短信服务 | 5 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软邮箱长效-outlook 长效oauth2令牌；Gpt Free（提供邮箱接码 已经接码）\| 注册地美国 \| outlook.com \| 家庭宽带注册 |
| 4 | [https://pay.ldxp.cn/shop/UW94LBON](https://pay.ldxp.cn/shop/UW94LBON) | yemao-ai源头 | ChatGPT | 5 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | GPT free sub2格式json带rt不带账密质保首登；【日抛--发货格式cpa，sub2】plus成品质保首登，，只能反代codex。 |
| 5 | [https://pay.ldxp.cn/shop/one](https://pay.ldxp.cn/shop/one) | 云边小铺 | ChatGPT, Gemini, Apple Id, Claude, Grok | 41 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软hotmail；GROK【普号\|直登成品｜域名邮箱】只保首登 |
| 6 | [https://pay.ldxp.cn/shop/SB9T68JP](https://pay.ldxp.cn/shop/SB9T68JP) | ai账号乐园 | ChatGPT, Gemini, Apple Id, Claude, Cursor | 208 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 长效hotmail邮箱 OAuth2令牌号【已注册一年以上】 支持imap pop；微软邮箱长效-outlook 长效oauth2令牌 |
| 7 | [https://pay.ldxp.cn/shop/rgzn](https://pay.ldxp.cn/shop/rgzn) | AI小屋 | ChatGPT, Google, Outlook | 8 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软邮箱长效-outlook 长效oauth2令牌；微软长效-outlook-【gr/o2双令牌号】-【英文随机+数字】Graph令牌号和OAuth2-IMAP-POP3 |
| 8 | [https://pay.ldxp.cn/shop/YGOV1U2Q](https://pay.ldxp.cn/shop/YGOV1U2Q) | 虚拟产品批发 | ChatGPT, Gemini, Outlook, Claude, 推特 | 38 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软邮箱长效-outlook  oauth2令牌 refresh_token号  imap pop3；Cursor  美区 接码 业务自测 没问题在批量上（不售后） |
| 9 | [https://pay.ldxp.cn/shop/haifs](https://pay.ldxp.cn/shop/haifs) | 海飞丝 土区PLUS源头供应 | ChatGPT | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |
| 10 | [https://pay.ldxp.cn/shop/52ai](https://pay.ldxp.cn/shop/52ai) | 52AI店铺 | ChatGPT, Gemini, Claude, Grok, 推特 | 50 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【每人限1个】Codex官方中转API 1美元0.1x 倍率=10美元额度；微软长效-outlook-【双令牌号】-【英文随机+数字】Graph令牌号和OAuth2-IMAP-POP3 |
| 11 | [https://pay.ldxp.cn/shop/X273D51R](https://pay.ldxp.cn/shop/X273D51R) | 南乔ai | ChatGPT | 1 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | ChatGPT PLUS 一卡一绑 非常稳定 |
| 12 | [https://ldxp.cn/shop/UHZ7YO17](https://ldxp.cn/shop/UHZ7YO17) | 源头AI | ChatGPT, 短信服务 | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |
| 13 | [https://pay.ldxp.cn/shop/1DM0L7CR](https://pay.ldxp.cn/shop/1DM0L7CR) | 源头GPT | ChatGPT, Google, Gmail, Gemini, Google Voice | 31 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软长效-outlook-API取件-Graph令牌号和OAuth2；微软长效-Hotmail-API取件-Graph令牌号和OAuth2 |
| 14 | [https://pay.ldxp.cn/shop/aiTeam](https://pay.ldxp.cn/shop/aiTeam) | Ai家族 | ChatGPT, Gmail, Claude | 15 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 三水｜普号；画风｜普号 |
| 15 | [https://pay.ldxp.cn/shop/EXZMM8SQ](https://pay.ldxp.cn/shop/EXZMM8SQ) | GPTgemini都有 | ChatGPT, Gemini, Claude | 28 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | CHATGPT FREE号 （已经接过码）；[普号\|白号]  Grok AI 长效微软邮箱 |
| 16 | [https://pay.ldxp.cn/shop/ycyapi](https://pay.ldxp.cn/shop/ycyapi) | YCYAI | ChatGPT, Claude | 8 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Google验证 美国手机号（两个月内可重复接码）（购买前务必看介绍）；质保一天/  ChatGPT Plus 成品号｜自助发货｜24小时发货 |
| 17 | [https://pay.ldxp.cn/shop/4YWWAAFM](https://pay.ldxp.cn/shop/4YWWAAFM) | 蜗的AI | Gmail, Hotmail, 短信服务, Claude, Grok | 22 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | OpenAI Codex 手机接码；ChatGPT 蜗的AI-中转-官方plus号池-100$ |
| 18 | [https://pay.ldxp.cn/shop/C7MLWX4N](https://pay.ldxp.cn/shop/C7MLWX4N) | MortyAi小铺 | ChatGPT, Claude | 17 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Gopay GPT PLUS  CPA json格式卡密，带RT，已绑手机，outlook 邮箱。无质保；【美国+1 】高性价比新号 \| 基础权重 \| 必备小号备用号 |
| 19 | [https://pay.ldxp.cn/shop/yuanAi](https://pay.ldxp.cn/shop/yuanAi) | 元Ai | ChatGPT, Google, Gmail, Gemini, Claude | 131 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | grok普号(限时福利)；grok普号（free） |
| 20 | [https://pay.ldxp.cn/shop/AG7CVCOD](https://pay.ldxp.cn/shop/AG7CVCOD) | 喵喵AI小铺 | Apple Id, ChatGPT, Gemini | 3 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【限时福利】ChatGPT plus成品号（质保首登）；Plus网页号，剩余15-25天（质保首登） |
| 21 | [https://pay.ldxp.cn/shop/gogo](https://pay.ldxp.cn/shop/gogo) | AI gogo渠道 | ChatGPT, Gemini, Claude | 25 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Outlook.de微软德国邮箱（OAuth2令牌邮箱，已开通IMAP POP3）；【日区PP渠道】ChatGPT Plus 独享成品号（质保首登/拍下即发/注意账号格式） |
| 22 | [https://pay.ldxp.cn/shop/9P102ZA3](https://pay.ldxp.cn/shop/9P102ZA3) | aili的gpt | ChatGPT, Apple Id | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Claude普通账号（雅虎邮箱，imap登录，网易邮箱大师接码）；🟨Apple ID【土耳其·原生非改区】土区苹果id·免税【带消费记录·双重号·未激活ic】可做GPT业务🟡自动发货 |
| 23 | [https://pay.ldxp.cn/shop/UHZ7YO18](https://pay.ldxp.cn/shop/UHZ7YO18) | GPT源头店铺 | ChatGPT, 短信服务 | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | CHATGPT FREE号 （已经接过码）；chatgpt-plus（超长存活） |
| 24 | [https://ldxp.cn/shop/UHZ7YO18](https://ldxp.cn/shop/UHZ7YO18) | AI源头 | ChatGPT, 短信服务 | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |
| 25 | [https://pay.ldxp.cn/shop/QLL06630](https://pay.ldxp.cn/shop/QLL06630) | Ai小店 | ChatGPT, Gemini | 16 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Cursor  美区 接码 业务自测 没问题在批量上（不售后） 代理对接：u0fffzj6；OpenAI Codex 手机接码 |
| 26 | [https://pay.ldxp.cn/shop/grokheavy](https://pay.ldxp.cn/shop/grokheavy) | Grok年卡专卖 | Grok | 3 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | SuperGrok 独享账号 三天升级试用号；SuperGrok 独享账号 一月会员 质保5天 新渠道 |
| 27 | [https://pay.ldxp.cn/shop/4GG4E3MF](https://pay.ldxp.cn/shop/4GG4E3MF) | 元筑AI | ChatGPT | 4 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Plus 质保首登。提供账号密码、sub2api/cpa的json；GPT plus账号质保首登。提供账号密码、sub2api/cpa的json |
| 28 | [https://pay.ldxp.cn/shop/N5PXH3GX](https://pay.ldxp.cn/shop/N5PXH3GX) | AI List | ChatGPT, Gmail, Gemini, Apple Id, Claude | 54 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软长效-outlook-【gr/o2双令牌号】-【英文随机+数字】Graph令牌号和OAuth2-IMAP-POP3；微软长效-hotmail-【gr/o2双令牌号】-【英文随机+数字】Graph令牌号和OAuth2-IMAP-POP3 |
| 29 | [https://pay.ldxp.cn/shop/SQ5C82YG](https://pay.ldxp.cn/shop/SQ5C82YG) | 邻家数字铺 | ChatGPT, Gemini, Gmail, Grok | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【美国+1 】高性价比新号 \| 店主亲测手机稳定，不要电脑登录！！！大概率没了！！！ \| 必备小号备用号；｛冲自己号｝Gemini Pro一年会员自动开通CDK 包绑卡订阅 1次 低价不质保 |
| 30 | [https://pay.ldxp.cn/shop/MEDDEX4V](https://pay.ldxp.cn/shop/MEDDEX4V) | AI HOME | ChatGPT, Claude | 52 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | [普号] ChatGPT 长效微软邮箱；GPT账号（微软outlook邮箱） |
| 31 | [https://pay.ldxp.cn/shop/H2QPI3X2](https://pay.ldxp.cn/shop/H2QPI3X2) | 灵AI | ChatGPT | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【包GCP】google邮箱Gmail【稳定老号】【20-24年随机地区】可做Pixel 家庭组 挖矿；Gemini Pro 充值自己账号 订阅12个月【无质保】 |
| 32 | [https://pay.ldxp.cn/shop/KHRR17MS](https://pay.ldxp.cn/shop/KHRR17MS) | 商家9152 | ChatGPT | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |
| 33 | [https://pay.ldxp.cn/shop/ji_su_ai](https://pay.ldxp.cn/shop/ji_su_ai) | 极速AI | ChatGPT, Claude, Grok, Gemini | 6 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | GPT账号（白号）普通号｜账号密码直登｜gpt专用｜高权重家宽｜独享号，长效【微软邮箱交付】；ChatGPT - Plus 月卡【只质保首登，到手即用！】 |
| 34 | [https://pay.ldxp.cn/shop/D92VW084](https://pay.ldxp.cn/shop/D92VW084) | 咔咔 | ChatGPT | 12 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 新手尝鲜套餐｜¥5  ｜轻舟AI中转站 0.25倍率；10刀额度天卡｜¥9  ｜轻舟AI中转站 0.25倍率 |
| 35 | [https://pay.ldxp.cn/shop/GAXW96YR](https://pay.ldxp.cn/shop/GAXW96YR) | LynnZee | ChatGPT | 9 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软Outlook Trusted 邮箱- OAuth2 + Graph 长期有效；GPT plus 成品号日抛x1【质保首登】 |
| 36 | [https://pay.ldxp.cn/shop/22DHYNNV](https://pay.ldxp.cn/shop/22DHYNNV) | 哈哈的ai杂货铺 | ChatGPT, Gemini | 6 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | GROK【普号\|直登成品｜域名邮箱】只保首登；Gemini pro一年CDK充值  包绑卡 1次  （充值无叠加 有会员不能充值） |
| 37 | [https://pay.ldxp.cn/shop/qingqing](https://pay.ldxp.cn/shop/qingqing) | 青卿 | ChatGPT | 5 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【无质保】plus 1月直充卡【需新号】；Plus 土区自助卡密【秒充】【不用等凭证排队】【保证正规渠道土区】 |
| 38 | [https://pay.ldxp.cn/shop/YTR60TGVK](https://pay.ldxp.cn/shop/YTR60TGVK) | Ai小熊 | ChatGPT, Gmail, Gemini, Grok | 7 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 22-24GMAIL邮箱/2FA/随机地区；Gemini3.1pro一年（直冲）到你自己的账号 |
| 39 | [https://pay.ldxp.cn/shop/AEUQ8PP3](https://pay.ldxp.cn/shop/AEUQ8PP3) | ai教父 | ChatGPT, Gemini, Hotmail, Claude, 虚拟卡 | 54 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | outlook-令牌长效-邮件获取:imap,pop3,graph(双令牌通用)；hotmail-令牌长效-已绑辅邮-卡密带辅邮账密-(已授权oauth2，IMAP GRAPH) |
| 40 | [https://pay.ldxp.cn/shop/gpt5.5](https://pay.ldxp.cn/shop/gpt5.5) | AI华强北 | ChatGPT, 虚拟卡 | 4 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | CHATGPTPlus RT 成品号（带rt+已绑手机号验证）；chatgpt-cdk 直充 |
| 41 | [https://pay.ldxp.cn/shop/DJFT26BF](https://pay.ldxp.cn/shop/DJFT26BF) | 映核素材馆 | Gemini | 6 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | Kiro Pro 1000积分 成品号 质保首登 gmail邮箱；【日区PP渠道】ChatGPT Plus 独享成品号（质保首登/拍下即发/注意账号格式） |
| 42 | [https://pay.ldxp.cn/shop/SubAIP](https://pay.ldxp.cn/shop/SubAIP) | AI源头批发旗舰店 | ChatGPT, Claude, Perplexity | 17 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | ChatGPT - Plus 月卡 成品号质保首登；【包GCP】美区google邮箱Gmail【稳定老号】【20-24年】可做Pixel 家庭组 挖矿 |
| 43 | [https://pay.ldxp.cn/shop/ZM24RG4J](https://pay.ldxp.cn/shop/ZM24RG4J) | 伊莉雅ai会员店 | ChatGPT, Gmail, Gemini, Telegram | 42 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 微软邮箱长效-outlook  oauth2令牌 refresh_token号  imap pop3；coedx 接码 （一次码）【出现手机号已被使用这种情况，直接带着截图投诉退款】 |
| 44 | [https://pay.ldxp.cn/shop/5NVWW2PJ](https://pay.ldxp.cn/shop/5NVWW2PJ) | 元元低价ai店 | ChatGPT, Gmail, Gemini, Claude | 12 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | ChatGPT Plus  在线代开Puls （冲自己号，新渠道稳定1）；【日抛2- team发货格式cpa，sub2】 team成品质保首登，带rt，只能反代codex ，15刀 左右 |
| 45 | [https://pay.ldxp.cn/shop/anon](https://pay.ldxp.cn/shop/anon) | 千早爱音的AI小铺 | ChatGPT, Gemini, Claude, Grok | 4 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 【包GCP】美区｜google邮箱【稳定老号】【22-24年】；【包GCP】Gemini Pro 1年订阅成品号【26年随机地区比老号稳】 |
| 46 | [https://pay.ldxp.cn/shop/ymymai](https://pay.ldxp.cn/shop/ymymai) | 亚米的整合服务供应商 | ChatGPT, Gmail, Gemini | 7 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 提取12个月优惠链接 一次 gemin pro（不会用别买不退不换，小白别买）；GPT PLUS成品。质保首登 购买之前先看商品描述 |
| 47 | [https://pay.ldxp.cn/shop/Q0GWJ4YV](https://pay.ldxp.cn/shop/Q0GWJ4YV) | Ai小店 | ChatGPT, Gemini, Grok | 41 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | super grok3天试用 质保首登；20-24GMAIL邮箱/2FA/随机地区 |
| 48 | [https://pay.ldxp.cn/shop/RXKT7LFX](https://pay.ldxp.cn/shop/RXKT7LFX) | 商家9237 | ChatGPT, Gemini | 6 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | gemini pro一年  （绑定手机号就可以用）需要绑定手机号                   2-4年老邮箱；Gemini pro一年CDK充值一年（关闭支付资料） |
| 49 | [https://pay.ldxp.cn/shop/2W1EEK4J](https://pay.ldxp.cn/shop/2W1EEK4J) | AI主理人 | ChatGPT, Google, Gemini, Claude, Telegram | 27 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 验证码接码-可接google。；微软邮箱长效-outlook 满周长效oauth2令牌 |
| 50 | [https://pay.ldxp.cn/shop/AZX4SPJ0](https://pay.ldxp.cn/shop/AZX4SPJ0) | Gemini批发 | ChatGPT | 1 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | GPT Plus成品号（质保两周） |
| 51 | [https://pay.ldxp.cn/shop/ai.shop](https://pay.ldxp.cn/shop/ai.shop) | AI开发商 | ChatGPT, Gemini, Grok, Gmail | 13 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | ChatGPT Team 成品母号（无质保）；提取12个月优惠链接 一次 gemin pro（懂的买 无教程）小白勿拍 |
| 52 | [https://pay.ldxp.cn/shop/TSW7DIEI](https://pay.ldxp.cn/shop/TSW7DIEI) | ai主理人 | Claude, ChatGPT, Gemini | 6 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | claude max 中转满血api；claude max api10刀兑换码 |
| 53 | [https://pay.ldxp.cn/shop/F06LXGPS](https://pay.ldxp.cn/shop/F06LXGPS) | aikami | Claude, ChatGPT | 2 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | gemini pro 一年 代订阅包含绑卡cdkey 无质保；Claude Pro 直充月卡 |
| 54 | [https://pay.ldxp.cn/shop/7DQD04V0](https://pay.ldxp.cn/shop/7DQD04V0) | AI货源小店 | ChatGPT, Gemini | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |
| 55 | [https://pay.ldxp.cn/shop/RYGO8TOG](https://pay.ldxp.cn/shop/RYGO8TOG) | GV全球供应商 | Google Voice | 0 | shopApi / API FAIL | 采集器已识别但探测未完全通过，先加入试采集复核 | 无公开商品样例 |

### 6.2 待补采集器（41 个）

当前无法归入现有采集器，需要按站点形态继续拆分和补采集器；状态：HTTP 200 39 个，probe fail 2 个。

| # | 原站入口 | NodeBits 店铺名/别名 | 标签线索 | 商品样例数 | 采集器/状态 | 处理建议 | 样例商品 |
|---:|---|---|---|---:|---|---|---|
| 1 | [https://catfk.com/shop/Antipro](https://catfk.com/shop/Antipro) | Antipro（源头低价AI会员） | ChatGPT, Gemini, 短信服务, Claude, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 2 | [https://storeacc.com/](https://storeacc.com/) | 号士多 HStore | Apple Id, ChatGPT, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 3 | [https://xingbao-ai.shop/](https://xingbao-ai.shop/) | 星宝小店 | ChatGPT, Claude, Gemini | 9 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | ChatGPT Pro 20X 月卡｜官方卡充｜1个月｜支持续费｜正规充值；ChatGPT Plus 月卡｜成品号｜ 质保首登【默认日抛，用多久看天】【自动发货】 |
| 4 | [https://ouvg.top/](https://ouvg.top/) | 麦门商店 | Google, Gemini, 短信服务, 私人住宅IP, Claude | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 5 | [http://mxshop.vip/](http://mxshop.vip/) | 小马解忧 | ChatGPT, Claude | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 6 | [https://11.id2323.top/](https://11.id2323.top/) | 账号小卖铺 | Gemini, Apple Id, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 7 | [https://fk.txspvip.xyz/](https://fk.txspvip.xyz/) | 星枢 AI（源头GPT) | ChatGPT | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 8 | [https://ai666.id/](https://ai666.id/) | 会员权益在线 | ChatGPT, Gemini, Apple Id, Claude, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 9 | [https://mamabt.top/](https://mamabt.top/) | MMBT源头批发 | ChatGPT, Gemini, Claude, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 10 | [https://dimosky.com/](https://dimosky.com/) | Ai能量小店 | ChatGPT, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 11 | [https://douyiner.cn/](https://douyiner.cn/) | Gemini账号批发, douyiner | ChatGPT, Gemini, Google, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 12 | [https://woaimaihao.com/](https://woaimaihao.com/) | 我爱买号 | ChatGPT, Gmail, Gemini, Apple Id, Claude | 22 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 苹果礼品卡 联系客服购买；claude max 20X 充值 |
| 13 | [https://123456787kelie.top/](https://123456787kelie.top/) | TG飞机号源头机房 | Gmail, Outlook, 推特, Telegram, Tiktok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 14 | [https://faka.6188.store:8443/cat/2](https://faka.6188.store:8443/cat/2) | 网流工作室 | ChatGPT, GitHub, Google, Perplexity, 私人住宅IP | 0 | 待补采集器 / probe fail | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 15 | [https://lemon-watermelon.com/](https://lemon-watermelon.com/) | 柠檬西瓜 | ChatGPT, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 16 | [https://fk1.ybkjs.top/](https://fk1.ybkjs.top/) | 月饼科技社 | ChatGPT, Gmail, Gemini, Claude, Cursor | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 17 | [https://web3chirou.com/](https://web3chirou.com/) | WEB3Al | ChatGPT, Gemini, 私人住宅IP, Claude, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 18 | [http://lynnzee.myweb999.cfd/](http://lynnzee.myweb999.cfd/) | LynnZee 店铺 | ChatGPT, Gemini, Claude | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 19 | [https://fk.ybkjs.top/](https://fk.ybkjs.top/) | 惠民ai | ChatGPT, Google, Apple Id, Claude, Cursor | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 20 | [https://zhanghao66.com/](https://zhanghao66.com/) | 全网最低批发ai账号店铺 | ChatGPT, Claude, Grok, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 21 | [https://tgkey.cc/](https://tgkey.cc/) | Telegram会员自助充值 | Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 22 | [https://a1gmail.com/](https://a1gmail.com/) | A1gmail谷歌邮箱批发, a1gmail | Gmail, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 23 | [https://catcard.uk/](https://catcard.uk/) | 猫咔～ | Gemini, ChatGPT, 短信服务 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 24 | [https://hiemail.store/](https://hiemail.store/) | 谷歌邮箱 AI源头批发 | ChatGPT, Google, Gmail, Gemini, Claude | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 25 | [https://lubansms.com/](https://lubansms.com/) | Luban Sms | 短信服务 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 26 | [https://nikoers.com/](https://nikoers.com/) | NikoCard | 短信服务, 教育邮箱, ChatGPT, Gemini, 虚拟卡 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 27 | [https://meowka.vip/](https://meowka.vip/) | Meowka喵卡 | 教育邮箱 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 28 | [https://shop.bmoplus.com/](https://shop.bmoplus.com/) | bmoplus | ChatGPT, 虚拟卡, Grok, Claude, Google, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 29 | [https://shihuiai.cn/](https://shihuiai.cn/) | shihuiai | Gemini, Google | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 30 | [https://m.ifaka.cloud/](https://m.ifaka.cloud/) | AI源头 | ChatGPT, Google, Grok | 0 | 待补采集器 / probe fail | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 31 | [https://gmail1888.com/](https://gmail1888.com/) | gmail1888 | Gemini, Gmail, Hotmail, Outlook | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 32 | [https://19cm.tech/](https://19cm.tech/) | 大白发卡 | ChatGPT, Gemini, Outlook, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 33 | [https://bio.link/gouqi](https://bio.link/gouqi) | 枸杞⭕ | Apple Id, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 34 | [https://academicgate.org/](https://academicgate.org/) | 苏哲AI订阅中心 | ChatGPT, Claude, Apple Id, Grok, Outlook | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 35 | [https://tehuio.com/](https://tehuio.com/) | tehuio | ChatGPT, Claude, Cursor, Google, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 36 | [https://xxxyan.cc/](https://xxxyan.cc/) | xxxyan | Apple Id, ChatGPT, Discord, Gemini, Google, Google Voice, Grok, Telegram, Tiktok, 推特 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 37 | [https://sd.ncet.top/](https://sd.ncet.top/) | 发卡网 | Gemini, 虚拟卡 | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 38 | [https://ccdawang.win/products](https://ccdawang.win/products) | cc-cat | ChatGPT, Claude, Gemini, Grok | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 39 | [https://gemini91.shop/](https://gemini91.shop/) | R佬的ai小店 | Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 40 | [https://gmail91.shop/](https://gmail91.shop/) | 91网\|一手货源 | ChatGPT, Google, Grok, Outlook, Telegram | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |
| 41 | [https://morimm.com/](https://morimm.com/) | 小恐龙发卡网 | ChatGPT, Claude, Grok, Google, Gemini | 0 | 待补采集器 / HTTP 200 | 需要确认真实店铺并补采集器 | 无公开商品样例 |

## 7. C 组：暂不导入/可丢弃

| # | 原站入口 | NodeBits 店铺名/别名 | 标签线索 | 商品样例数 | 采集器/状态 | 处理建议 | 样例商品 |
|---:|---|---|---|---:|---|---|---|
| 1 | [https://t.me/+M7VO4xxDa8pjYzhl](https://t.me/+M7VO4xxDa8pjYzhl) | Google Voice专卖 | Google Voice | 0 | 待补采集器 / unsupported | 暂不导入 | 无公开商品样例 |
| 2 | [https://pay.ldxp.cn/item/rih4zc](https://pay.ldxp.cn/item/rih4zc) | 极速AI | ChatGPT, Gemini | 0 | shopApi / invalid | 暂不导入 | 无公开商品样例 |
| 3 | [http://localhost:3000/](http://localhost:3000/) | 测试店铺 | 未标注 | 0 | 待补采集器 / invalid | 暂不导入 | 无公开商品样例 |

## 8. 重复 URL 分组

这些是 NodeBits 中不同店铺记录指向同一规范化入口的情况。导入 PriceAI 候选池前应按规范化 URL 去重，只保留一个渠道源，再把别名写入备注或别名字段。

| # | 规范化入口 | NodeBits 店铺名 |
|---:|---|---|
| 1 | [https://douyiner.cn/](https://douyiner.cn/) | Gemini账号批发, douyiner |
| 2 | [https://pay.ldxp.cn/shop/aishop1](https://pay.ldxp.cn/shop/aishop1) | GPT大玩家, GPT 大玩家 |
| 3 | [https://pay.ldxp.cn/shop/MEDDEX4V](https://pay.ldxp.cn/shop/MEDDEX4V) | AI HOME, AI HOME |
| 4 | [https://pay.ldxp.cn/shop/IK7OYLXZ](https://pay.ldxp.cn/shop/IK7OYLXZ) | 猫猫豆, 猫猫豆 |
| 5 | [https://a1gmail.com/](https://a1gmail.com/) | A1gmail谷歌邮箱批发, a1gmail |

## 9. 后续处理建议

1. D 组不导入，只作为“NodeBits 也收录了这些渠道”的参考。
2. A 组可以新增为候选渠道源，采集器按表内建议写入；导入后跑一轮正式采集，成功后再启用。
3. B 组先进入“待试采/待补采集器”，不要直接进正式采集池；优先处理有明确 AI 订阅标签、且用户价值高的独立站。
4. C 组暂不导入；如果后续用户再次提交同域名，再作为新线索重新判断。
5. 单商品链接只能作为反查线索，不应直接成为渠道入口；正式渠道入口以店铺或站点入口为准。

## 10. 导入状态

2026-06-03 已将 A 组和 B 组共 98 个候选渠道导入后台审核队列，作为 `pending` 渠道提交处理，不直接进入正式 `sources` 表，也不直接参与正式采集。

导入口径：

- A/ready：2 个，进入普通审核列表，建议先试采集再通过。
- B/shopApi：55 个，进入普通审核列表，采集器已能识别但需要正式试采集复核。
- B/needsCollector：41 个，进入采集待办列表，后续需要补解析器或确认是否已有解析器可覆盖。
- D 组：12 个，PriceAI 已有渠道，跳过不重复导入。
- C 组：3 个，无效或暂不适合作为渠道入口，跳过不导入。

导入后的后台处理原则：

1. 能试采集成功的候选渠道，再审核通过并写入正式渠道。
2. 已确认真实但当前无法采集的渠道，保留在采集待办，不人工补录报价。
3. 无效、重复、非店铺入口或价值不足的渠道，在审核队列中拒绝。
