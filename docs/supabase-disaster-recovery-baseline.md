# Supabase 空库恢复 baseline

## 目的

PriceAI 最早的 migration 产生于基础表已经通过 `supabase/schema.sql` 建立之后，因此历史链的第一份文件会直接修改 `raw_offers`。仅把 `supabase/migrations/*.sql` 依次应用到空库不是受支持的恢复方式。

本仓库将 `supabase/schema.sql` 作为版本化 recovery baseline，并由 `supabase/recovery-baseline.json` 固定 checksum、migration head 和已纳入的 migration 数量。它只服务于新环境或灾备恢复，不改变现有生产数据库，也不会让 Supabase GitHub Integration 补跑一份倒序 migration。

## 恢复边界

- 仅用于全新的空 Supabase 项目或隔离恢复演练。
- 不得对当前生产库重复执行，也不得把 baseline 伪装成一份早于生产历史的 migration。
- baseline 包含 `includesMigrationsThrough` 指定版本之前的最终 schema；恢复后只应用时间戳更晚的 migration。
- 将历史版本标为 applied 前，必须先核对目标库关键对象、RLS、函数权限和 baseline checksum。该操作属于真实数据库变更，需要单独审批。

## 本地验证

静态一致性检查：

```bash
npm run check:recovery-baseline
```

隔离 Docker PostgreSQL 空库执行：

```bash
npm run check:recovery-baseline -- --docker
```

Docker 验证会创建临时容器、应用完整 `supabase/schema.sql`、检查核心表与 RPC，然后删除容器；不会连接 Supabase 生产项目。

## 后续维护

新增 migration 时需要同步更新 `supabase/schema.sql`。只有在空库验证通过后，才更新 `schemaSha256`、`includesMigrationsThrough` 和 `includedMigrationCount`。CI checksum 失败表示 baseline 已漂移，不能只改 hash 跳过实际验证。

长期如果要恢复标准 `supabase db reset` 的纯 migration 重放，应在独立分支做历史 squash、Preview 数据库重放和生产 migration history 对齐；不能在日常功能发布中直接重写 100 多份历史 migration。
