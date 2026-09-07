# 验收门禁

## 本地配置

- 来源 ID 唯一。
- `websiteUrl`、`apiBaseUrl`、价格页和价格接口指向正确站点。
- 监测页与监测接口分别保存。
- `autoPublish=false`。
- 用户声明与公开核验差异未丢失。
- `npm run test:api-transit`、定向 ESLint、typecheck、diff check 通过。

## 后台草稿

- 单站采集使用 `--source <id> --post`，不使用 `--publish`。
- `api_transit_stations.published=false`。
- `data_status=pending_review`。
- 新报价状态为 `needs_review`。
- 价格和监测 `source_url` 可回溯。
- 重复采集不产生无界重复记录。

## 前台隔离

- 公开列表找不到站点 ID、slug 和名称。
- 公开详情 JSON 返回 404/未公开，而不是草稿数据。
- 动态路由 HTML 壳 `200` 不作为发布状态依据。
- 没有后台草稿报告、待审核数量或检测提示泄漏到公开页面。

## Collector runtime

- source/config watchlist 变更已同步 Huoshan2。
- `runtime-manifest.json.gitSha` 等于同步提交。
- 远端 `config/api-transit-sources.json` 恰好包含一个来源 ID。
- systemd timer 保持原有频率，不因录入草稿随意修改。
- 草稿未发布时，不要求公共定时器采集它；上架后必须验证它进入 published-source 选择。

## 生产发布

- `origin/main` 包含工作提交。
- `npm run deploy:production -- --check` 指向 Cloudflare/OpenNext。
- watched config 变更传入 `--collector-runtime-sync-ref=<sha>`。
- GitHub Actions 构建、候选烟测、promotion 和生产 smoke 成功。
- `/api/deployment` 的 `versionTag` 命中工作提交。
- 无 schema 变更则明确“无 migration”；有 migration 时按 Supabase GitHub Integration 验证。

## Activate 额外门禁

- 当前请求有明确上架授权。
- 商业关系、主体、发票、退款、上游、价格差异和监测来源已人工审核。
- 公开详情显示正确价格数量、0 个已知错误/伪分组、正确来源标签。
- 手动采集成功后，再等待下一轮 timer 自动推进 `lastCollectedAt`。
- 自动轮次未发生前不得宣布定时更新已经恢复。
