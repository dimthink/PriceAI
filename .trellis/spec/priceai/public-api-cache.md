# 公开 API 与缓存

> Route Handler、CDN/ISR/内存缓存、响应体验收。

---

## Scenario: 价格类公开 API

### 1. Scope / Trigger

修改以下内容时必须加载本规范：

- `src/app/api/explorer/route.ts`
- `src/app/api/offers/route.ts`
- `src/app/api/products/[id]/offers/route.ts`
- `src/lib/cache-headers.ts`
- 任何 `revalidate`、`dynamic`、`use cache`、`revalidatePath`、`revalidateTag`、Cloudflare/Vercel cache header。

### 2. Signatures

价格类公开 API 必须使用统一缓存头：

```typescript
priceDataCacheHeaders(): HeadersInit
```

当前约定：

- `Cache-Control: public, max-age=0, must-revalidate`
- `CDN-Cache-Control: public, s-maxage=300`
- `Cloudflare-CDN-Cache-Control: public, s-maxage=300`
- `Vercel-CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=1800`

价格类 TTL 必须从同一个共享策略导出，避免服务端、客户端和 CDN 漂移：

```typescript
PRICE_DATA_EDGE_SECONDS = 300
PRICE_DATA_STALE_SECONDS = 1800
PRICE_DATA_CACHE_TTL_MS = PRICE_DATA_EDGE_SECONDS * 1000
```

`/api/explorer`、`/api/offers`、`/api/products/[id]/offers` 的服务端内存缓存，以及首页探索器、全站报价列表、商品详情报价列表的客户端 session/memory 缓存，都必须使用 `PRICE_DATA_CACHE_TTL_MS`。

公开 API 允许在 TTL 之下进一步使用持久快照：

- `/api/explorer` 使用 `public_api_snapshots(kind='explorer', cache_key='default')`。
- `/api/offers?limit=80&offset=0` 且无筛选/搜索时，使用 `public_api_snapshots(kind='offers', cache_key='default:limit:80')`。
- `/api/products/[id]/offers?limit=80&offset=0` 且无筛选/搜索时，使用 `public_api_snapshots(kind='product_offers', cache_key='default:<id>:limit:80')`。
- 快照只用于默认高频读路径；筛选、搜索、排除词和翻页仍走 RPC。

快照刷新必须走统一节奏：

- 写入路径只调用 `markPublicApiSnapshotsDirty()`，不得在 `crawl-log`、手动报价、隐藏报价、重建分类等写请求里同步全量刷新。
- 写入路径应尽量传入 `affectedProductIds` / `affectedOfferIds` / `affectedSourceIds`，让统一任务只刷新受影响商品快照。
- `POST /api/admin/public-api-snapshots` 默认调用 `refreshPublicApiSnapshotsIfDue()`，只在 dirty 且超过统一冷却时间时刷新；手动 `force=1` 才做强制全量刷新。
- 手动排障或运营强制刷新时才允许传 `force=1`。
- 默认自动刷新节奏是 3 分钟增量合并；商品详情快照按受影响商品增量刷新，`explorer`/默认 `offers` 最多 5 分钟合并刷新一次，全量快照 60 分钟低频兜底。公开读 TTL 仍是 300 秒，stale 窗口仍是 1800 秒。

### 3. Contracts

- Route Handler 默认不缓存；GET 如果要缓存，必须显式设置缓存策略或响应头。
- 价格数据不是请求级实时数据，采集频率远低于访问频率，应接受短 TTL。
- 用户侧新鲜度通过 `generatedAt`、`verifiedAt`、`lastSeenAt`、手动刷新/重新请求表达，不靠每次绕过缓存。
- 当前公共价格读路径的默认 TTL 是 `300s`。除非同时更新成本规划、规格和性能 guard，不要局部改回 `120s` 或更低。
- `no-store` 只能用于强实时、敏感或管理员写路径；公开价格读路径默认禁止。
- `use cache` 不能直接放在 Route Handler body 内；若要用 Next Cache Components 模式，应抽到 helper 并先读本地 Next 文档。

### 4. Validation & Error Matrix

| 条件 | 正确行为 |
|------|----------|
| 价格 API 返回 `no-store` | 视为高风险，需说明原因和成本 |
| CDN HIT 但数据短暂旧 | 可接受，前台必须显示采集/确认时间 |
| 后台写入后前台短暂未更新 | 在 TTL 内可接受；必要时配合 `revalidatePath` |
| 采集回传触发同步全量快照刷新 | 禁止；只标记 dirty 和影响范围，由统一调度增量合并刷新 |
| 客户端与 CDN TTL 不一致 | 视为风险，应统一回 `PRICE_DATA_CACHE_TTL_MS` |
| 快照缺失或版本不匹配 | 回退 RPC，并可在成功后写入快照 |
| `searchParams` 进入 Server Component | 检查是否让页面退出 ISR/静态路径 |
| URL 带大量回跳/筛选参数 | 避免打碎 CDN cache key，canonical 指向无参数主路径 |

### 5. Good/Base/Bad Cases

- Good：公开 API 走 `priceDataCacheHeaders()`，重复请求能看到 CDN/Vercel/Cloudflare 缓存行为。
- Base：短时间旧数据可接受，但界面显示数据更新时间。
- Bad：为了“看起来实时”把价格 API 改成 `no-store`，导致所有请求穿透到 Supabase。

### 6. Tests Required

本地：

- `npm run lint`
- `npm run check:performance`
- `npm run build`

生产或预览：

```bash
curl -sS -D - -o /tmp/priceai-explorer.json https://priceai.cc/api/explorer
curl -sS -D - -o /tmp/priceai-offers.json 'https://priceai.cc/api/offers?limit=80'
curl -sS -D - -o /tmp/priceai-product-offers.json 'https://priceai.cc/api/products/chatgpt-plus/offers?limit=80'
```

验收点：

- status 是 `200`。
- 响应不是 `no-store`。
- 价格 API 响应头包含 `s-maxage=300`。
- 重复请求观察 `age`、`x-vercel-cache`、`cf-cache-status` 或平台等价字段。
- 记录响应体积，公开分页接口不应突然变成数百 KB/MB。

### 7. Wrong vs Correct

#### Wrong

```typescript
return NextResponse.json(result, {
  headers: {
    "Cache-Control": "no-store, max-age=0",
  },
});
```

#### Correct

```typescript
return NextResponse.json(result, {
  headers: priceDataCacheHeaders(),
});
```

## Next.js Version Rule

本项目不是按旧 Next 经验开发。涉及 App Router、Route Handler、Cache Components、`revalidate`、`searchParams`、`headers()`、`cookies()`、`revalidatePath`、`revalidateTag` 时，先阅读：

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`
- 必要时再读 `node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md`

## Common Mistakes

- 只跑构建就宣布缓存修复完成，未验证生产响应头。
- 改了 `src/lib/cache-headers.ts`，但忘记 Cloudflare/Vercel 实际部署层可能覆盖或缓存旧行为。
- 把客户端轮询当作新鲜度方案，导致 SSR 后每个用户固定重复请求。
- 详情页读取服务端 `searchParams` 导致 ISR/静态缓存退化。
