create table if not exists canonical_products (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  platform text not null,
  product_type text not null,
  spec text not null default '',
  summary text not null default '',
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id text primary key,
  name text not null,
  base_url text,
  entry_url text not null,
  collection_method text not null default 'manual',
  collector_kind text,
  runtime_region text not null default 'default',
  enabled boolean not null default true,
  notes text,
  health_status text not null default 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  collector_lock_until timestamptz,
  collector_lock_owner text,
  collector_lock_started_at timestamptz,
  shop_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sources add column if not exists health_status text not null default 'unknown';
alter table sources add column if not exists last_checked_at timestamptz;
alter table sources add column if not exists last_success_at timestamptz;
alter table sources add column if not exists consecutive_failures integer not null default 0;
alter table sources add column if not exists last_error text;
alter table sources add column if not exists collector_kind text;
alter table sources add column if not exists runtime_region text not null default 'default';
alter table sources add column if not exists collector_lock_until timestamptz;
alter table sources add column if not exists collector_lock_owner text;
alter table sources add column if not exists collector_lock_started_at timestamptz;
alter table sources add column if not exists shop_created_at timestamptz;

create table if not exists raw_offers (
  id text primary key,
  source_id text references sources(id) on delete set null,
  source_name text not null,
  source_store_name text,
  source_title text not null,
  price numeric,
  listed_price numeric,
  fee_amount numeric,
  price_basis text,
  currency text not null default 'CNY',
  status text not null default 'unknown',
  source_status text not null default 'unknown',
  effective_status text not null default 'low_confidence',
  freshness_status text not null default 'fresh',
  url text not null,
  tags text[] not null default '{}',
  stock_count integer,
  hidden boolean not null default false,
  canonical_product_id text references canonical_products(id) on delete set null,
  category_slug text,
  captured_at timestamptz not null default now(),
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer not null default 50,
  confidence numeric not null default 0.5,
  last_failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table raw_offers add column if not exists source_status text not null default 'unknown';
alter table raw_offers add column if not exists listed_price numeric;
alter table raw_offers add column if not exists fee_amount numeric;
alter table raw_offers add column if not exists price_basis text;
alter table raw_offers add column if not exists effective_status text not null default 'low_confidence';
alter table raw_offers add column if not exists freshness_status text not null default 'fresh';
alter table raw_offers add column if not exists verified_at timestamptz;
alter table raw_offers add column if not exists expires_at timestamptz;
alter table raw_offers add column if not exists source_priority integer not null default 50;
alter table raw_offers add column if not exists confidence numeric not null default 0.5;
alter table raw_offers add column if not exists last_failed_at timestamptz;
alter table raw_offers add column if not exists failure_reason text;

update raw_offers
set
  source_status = status,
  verified_at = coalesce(verified_at, last_seen_at, captured_at, source_updated_at),
  source_priority = case
    when exists (
      select 1 from sources
      where sources.id = raw_offers.source_id
        and sources.collection_method = 'public_json'
    ) then 40
    else 90
  end,
  confidence = case
    when exists (
      select 1 from sources
      where sources.id = raw_offers.source_id
        and sources.collection_method = 'public_json'
    ) then 0.55
    else 0.90
  end,
  effective_status = case
    when status = 'out_of_stock' then 'unavailable'
    else 'available'
  end,
  freshness_status = case
    when coalesce(expires_at, verified_at + interval '24 hours', last_seen_at + interval '24 hours', captured_at + interval '24 hours') < now() then 'expired'
    else 'fresh'
  end,
  expires_at = coalesce(
    expires_at,
    coalesce(verified_at, last_seen_at, captured_at, source_updated_at) +
      interval '24 hours'
  )
where true;

create table if not exists raw_offer_confirmations (
  raw_offer_id text primary key references raw_offers(id) on delete cascade,
  source_id text references sources(id) on delete set null,
  confirmed_at timestamptz not null,
  captured_at timestamptz,
  last_seen_at timestamptz not null,
  verified_at timestamptz not null,
  expires_at timestamptz,
  source_status text not null default 'unknown',
  effective_status text not null default 'low_confidence',
  freshness_status text not null default 'fresh',
  source_priority integer,
  confidence numeric,
  price numeric,
  stock_count integer,
  updated_at timestamptz not null default now()
);

create table if not exists offer_matches (
  id text primary key,
  raw_offer_id text not null references raw_offers(id) on delete cascade,
  canonical_product_id text not null references canonical_products(id) on delete cascade,
  match_method text not null default 'rule',
  confidence numeric not null default 0.75,
  created_at timestamptz not null default now(),
  unique(raw_offer_id, canonical_product_id)
);

create table if not exists crawl_runs (
  id text primary key,
  source_id text references sources(id) on delete set null,
  source_name text,
  mode text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  message text,
  details jsonb not null default '{}'::jsonb
);

create table if not exists crawl_log_ingest_runs (
  id text primary key,
  source_id text references sources(id) on delete set null,
  source_name text,
  started_at timestamptz not null,
  batch_index integer,
  batch_count integer,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collection_jobs (
  id text primary key,
  job_type text not null check (job_type in ('all', 'source', 'official_prices', 'api_models', 'api_transit_public_pricing')),
  source_id text references sources(id) on delete set null,
  source_name text,
  status text not null default 'pending' check (status in ('pending', 'running', 'success', 'failed', 'cancelled')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 1,
  requested_by text,
  locked_by text,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collector_heartbeats (
  node_id text primary key,
  node_name text not null,
  node_type text,
  runtime text,
  region text,
  scope text,
  status text not null default 'unknown' check (status in ('running', 'success', 'partial', 'failed', 'idle', 'unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  last_seen_at timestamptz not null default now(),
  success_count integer not null default 0,
  failure_count integer not null default 0,
  skipped_count integer not null default 0,
  offer_count integer not null default 0,
  message text,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raw_offers_canonical_product_id_idx on raw_offers(canonical_product_id);
create index if not exists raw_offers_source_id_idx on raw_offers(source_id);
create index if not exists raw_offers_status_idx on raw_offers(status);
create index if not exists raw_offers_effective_status_idx on raw_offers(effective_status);
create index if not exists raw_offers_verified_at_idx on raw_offers(verified_at desc);
create index if not exists raw_offers_expires_at_idx on raw_offers(expires_at);
create index if not exists raw_offers_hidden_idx on raw_offers(hidden);
create index if not exists raw_offers_product_public_page_idx
on raw_offers (
  canonical_product_id,
  hidden,
  status,
  price,
  verified_at desc,
  last_seen_at desc,
  captured_at desc,
  source_updated_at desc,
  id
);
create index if not exists canonical_products_slug_idx on canonical_products(slug);
create index if not exists sources_health_status_idx on sources(health_status);
create index if not exists sources_last_checked_at_idx on sources(last_checked_at desc);
create index if not exists sources_collector_kind_idx on sources(collector_kind);
create index if not exists sources_collector_lock_until_idx on sources(collector_lock_until);
create index if not exists sources_shop_created_at_idx on sources(shop_created_at desc);
create index if not exists raw_offers_visible_product_price_idx
  on raw_offers(canonical_product_id, price)
  where hidden = false and price is not null;
create index if not exists crawl_runs_started_at_idx on crawl_runs(started_at desc);
create index if not exists crawl_log_ingest_runs_status_expires_at_idx
  on crawl_log_ingest_runs(status, expires_at);
create index if not exists crawl_log_ingest_runs_source_started_at_idx
  on crawl_log_ingest_runs(source_id, started_at desc);
create index if not exists collection_jobs_status_created_at_idx on collection_jobs(status, created_at desc);
create index if not exists collection_jobs_source_status_idx on collection_jobs(source_id, status);
create index if not exists collection_jobs_locked_until_idx on collection_jobs(locked_until);
create index if not exists collector_heartbeats_last_seen_at_idx on collector_heartbeats(last_seen_at desc);
create index if not exists collector_heartbeats_status_last_seen_at_idx on collector_heartbeats(status, last_seen_at desc);

create or replace function priceai_public_offer_filter_tags(
  p_source_title text,
  p_tags text[] default '{}'
)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  text_value text := regexp_replace(
    lower(
      regexp_replace(
        coalesce(p_source_title, '') || ' ' || array_to_string(coalesce(p_tags, array[]::text[]), ' '),
        '[[:space:]]+',
        '',
        'g'
      )
    ),
    '[【】\[\]（）()]',
    ' ',
    'g'
  );
  title_text text := regexp_replace(
    lower(
      regexp_replace(coalesce(p_source_title, ''), '[[:space:]]+', '', 'g')
    ),
    '[【】\[\]（）()]',
    ' ',
    'g'
  );
  tags_text text := regexp_replace(
    lower(
      regexp_replace(array_to_string(coalesce(p_tags, array[]::text[]), ' '), '[[:space:]]+', '', 'g')
    ),
    '[【】\[\]（）()]',
    ' ',
    'g'
  );
  global_warranty_text text;
  output text[] := array[]::text[];
begin
  global_warranty_text := regexp_replace(
    text_value,
    '(不质保(封号|封禁|被封|账号|账户)|封号(不质保|无质保|无售后|不保|不售后|不在售后范围)|封禁(不质保|无质保|无售后|不保|不售后|不在售后范围)|不保(封号|封禁|被封|账号|账户)|不管(封号|封禁|被封)|封号不管)',
    '',
    'g'
  );

  if text_value !~ '(非拼车|不是拼车|不拼车|无拼车|拒绝拼车|非团购|不是团购|不团购|非共享|不是共享|不共享|无共享|非合租|不是合租|不合租|非车位|不是车位)'
    and (
      text_value ~ '(拼车|团购|拼团|车位|多人共享|多人共用|(多人|二人|两人|双人|三人|四人|五人|六人|七人|八人|九人|十人|[2-9]人|[1-9][0-9]人)体验(号|账号|帐号)|(二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车)'
      or (
        text_value !~ '(独享|独立|一人一号|一人一户|专享)'
        and text_value ~ '(共享|共用|合租|共享号)'
      )
    )
  then
    output := array_append(output, 'shared_access');
  end if;

  if text_value ~ '(国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror)' then
    output := array_append(output, 'domestic_mirror_site');
  end if;

  if title_text ~ '(自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|直充|代充|卡充|充值|续费|代开|内购|激活码|兑换码|cdk|卡密|提链|提取链接|支付二维码|扫码对接|upi扫码|pix渠道|ideal渠道|i deal渠道)'
    or tags_text ~ '(自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|直充|代充|卡充|充值|续费|代开|内购|激活码|兑换码|cdk|提链|提取链接|支付二维码|扫码对接|upi扫码|pix渠道|ideal渠道|i deal渠道)'
  then
    output := array_append(output, 'delivery_recharge');
  end if;

  if text_value !~ '(非成品|不是成品|非账号|不是账号|非账户|不是账户|不交付账号|不发账号|不提供账号|不含账号|无需账号|自备账号|自备号|自己账号|自己的账号|到自己账号|冲自己号|充值自己号|给自己号)'
    and title_text !~ '(自助充值|自助开通|自助领取|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|免费试用资格|试用资格|资格新号|仅支持新号|老号有试用|新号都可以|充值渠道非成品|非成品|自备账号|国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror|拼车|团购|拼团|车位|多人共享|多人共用|多人体验号)'
    and title_text ~ '(成品号|成品账号|成品帐号|成品会员账号|成品|账号购买|账号|帐号|账户|账密|独享号|独享账号|独享账户|库存号|会员号|普通号|普号|白号|网页号|半成品|首登|保首登|质保首登|直登|未接码|已接码|已接|未接|带2fa|带二验|可二验|已绑手机|未绑手机)'
  then
    output := array_append(output, 'delivery_account');
  end if;

  if text_value ~ 'k12' then
    output := array_append(output, 'team_k12');
  end if;

  if text_value ~ '(bugteam|teambug|bug号|bug號|漏洞)' then
    output := array_append(output, 'team_bug');
  end if;

  if text_value ~ '(正价|正规官方|官方.{0,12}(team|business|团队|席位)|business\(team\)|gptbusiness|48个月|48月|四十八个月|4年|四年|全程质保订阅|无限续费|可无限续费|可用pro模型额度比plus高|首次激活码|续费码)' then
    output := array_append(output, 'team_official');
  end if;

  if text_value ~ '(12个月|十二个月|一年|1年|365天|三百六十五天|年卡|年度|全年)' then
    output := array_append(output, 'duration_year');
  end if;

  if text_value ~ '(6个月|六个月|180天|一百八十天|半年|半年卡)' then
    output := array_append(output, 'duration_half_year');
  end if;

  if text_value ~ '(3个月|三个月|90天|九十天|季度|季卡)' then
    output := array_append(output, 'duration_quarter');
  end if;

  if text_value ~ '(月卡|月会员|一个月|1个月|30天|三十天|一月|单月)' then
    output := array_append(output, 'duration_month');
  end if;

  if text_value ~ '((^|[^0-9])([1-9]|10)天(号|会员|体验)?|(二|两|三|四|五|六|七|八|九|十)天(号|会员|体验)?|[1-9]-10天|2到10天|2至10天|3-7天|7-10天|周会员|一周会员|体验卡|短期体验)' then
    output := array_append(output, 'duration_trial');
  end if;

  if text_value ~ '(月租|包月接码|接码包月|包月号码|长期租号|月付接码|30天接码|一个月接码|1个月接码)' then
    output := array_append(output, 'verification_monthly');
  elsif text_value ~ '(长效接码|长期接码|长效手机号|长期手机号|原始接码链接|电话接码链接|带电话接码链接|接码链接|取码url|取码链接|可续接|续接)' then
    output := array_append(output, 'verification_long');
  elsif text_value ~ '(短效接码|短效手机号|短期接码|短时接码|临时号码|短效号码|实卡接码|实体卡接码)' then
    output := array_append(output, 'verification_short');
  elsif text_value ~ '(单次接码|一次性接码|一次性验证|1次接码|1次验证|一次码|单号接码|接一次|质保1次成功接码|质保一次成功接码)' then
    output := array_append(output, 'verification_single');
  end if;

  if text_value !~ '(仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代)'
    and text_value ~ '(可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式)'
  then
    output := array_append(output, 'proxy_supported');
  end if;

  if (
      (
        text_value ~ '(包gcp|支持gcp|gcp可用|gcp已开|gcp正常|googlecloud|谷歌云)'
        and text_value !~ '(不包gcp|无gcp|gcp已禁用|gcp禁用|不支持gcp|gcp不可用|不带gcp|不含gcp|不送gcp)'
      )
      or (
        text_value ~ '(包反重力|支持反重力|反重力直接用|反重力可用|可用反重力|antigravity)'
        and text_value !~ '(不包反重力|不支持反重力|反重力不可用|无法反重力|不能反重力|不等于反重力)'
      )
      or (
        text_value ~ '((gemini|googleai|googleaipro|gcp|反重力|antigravity).{0,16}cli|cli.{0,16}(gemini|googleai|googleaipro|gcp|反重力|antigravity)|codeassist)'
        and text_value !~ '(不支持cli|cli不可用|无法cli|不能cli)'
      )
    )
  then
    output := array_append(output, 'gemini_antigravity_gcp');
  end if;

  if text_value !~ '(无需绑定手机|无需绑手机|无须绑定手机|无须绑手机|免绑手机|不用绑手机|不需要绑定手机|不需要绑手机)'
    and text_value ~ '(需要绑定手机|需绑定手机|需要绑手机|需绑手机|绑定手机号|绑定手机|手机号接码|手机接码|长效接码|接码|人机号|人机账号|人机帐号)'
  then
    output := array_append(output, 'gemini_phone_required');
  end if;

  if text_value !~ '(无需申诉|无须申诉|免申诉|不用申诉|不需要申诉|无需注册|无须注册|免注册|不用注册|不需要注册)'
    and text_value ~ '(首登需要申诉|需要申诉|需申诉|申诉|需注册|需要注册|没注册过谷歌|未注册过谷歌|没注册过google|未注册过google)'
  then
    output := array_append(output, 'gemini_appeal_required');
  end if;

  if global_warranty_text !~ '(无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|售后不管|一律不售后|无售后|不作售后条件|不做售后|不管售后)'
    and text_value !~ '(质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次|质保购买一小时内首登|质保[0-9]+h?内首登|质保(一|二|三|四|五|六|七|八|九|十)+小时内首登|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保|质保登上|质保登录|质保登陆|质保直登|质保首登成功)'
    and text_value !~ '(质保([1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|(^|[^0-9])([1-9]|1[0-4])天质保|(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天质保|质保(一周|1周|两周|2周|二周)|(一周|1周|两周|2周|二周)质保|7天售后|七天售后|质保[0-9]{1,2}h|质保(24|48|72)小时|质保[0-9]+小时|[0-9]+h质保|[0-9]+小时质保|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次成功接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次|质保额度|质保不来码|质保开通|仅质保开通|只质保开通|质保充值成功|质保激活成功|质保到手|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保)'
    and text_value ~ '(质保(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天|(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天|质保(十五|二十|二十五|二十八|三十|一百八十)天|(十五|二十|二十五|二十八|三十|一百八十)天质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(十五|二十|二十五|二十八|三十|一百八十)天|质保(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|全程质保|全程保|质保全程(订阅|定阅|权益|会员)?|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[/丨·、,，和+&-]){1,6}全程|全程((订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[/丨·、,，和+&-]){1,6}质保|包月售后|包月质保|质保包月)'
  then
    output := array_append(output, 'warranty_long');
  end if;

  return output;
end;
$$;

alter table raw_offers
  add column if not exists public_filter_tags text[]
  generated always as (priceai_public_offer_filter_tags(source_title, tags)) stored;

create index if not exists raw_offers_public_filter_tags_idx
  on raw_offers using gin (public_filter_tags)
  where hidden = false;

create index if not exists raw_offer_confirmations_confirmed_at_idx
  on raw_offer_confirmations(confirmed_at desc);

create index if not exists raw_offer_confirmations_source_confirmed_at_idx
  on raw_offer_confirmations(source_id, confirmed_at desc);

create index if not exists raw_offer_confirmations_expires_at_idx
  on raw_offer_confirmations(expires_at);

drop view if exists raw_offer_public_state;

create view raw_offer_public_state as
select
  raw_offers.id,
  raw_offers.source_id,
  raw_offers.source_name,
  raw_offers.source_store_name,
  raw_offers.source_title,
  raw_offers.price,
  raw_offers.listed_price,
  raw_offers.fee_amount,
  raw_offers.price_basis,
  raw_offers.currency,
  raw_offers.status,
  coalesce(raw_offer_confirmations.source_status, raw_offers.source_status) as source_status,
  coalesce(raw_offer_confirmations.effective_status, raw_offers.effective_status) as effective_status,
  coalesce(raw_offer_confirmations.freshness_status, raw_offers.freshness_status) as freshness_status,
  raw_offers.url,
  raw_offers.tags,
  raw_offers.public_filter_tags,
  raw_offers.stock_count,
  raw_offers.hidden,
  raw_offers.canonical_product_id,
  raw_offers.category_slug,
  coalesce(raw_offer_confirmations.captured_at, raw_offers.captured_at) as captured_at,
  raw_offers.source_updated_at,
  coalesce(raw_offer_confirmations.last_seen_at, raw_offers.last_seen_at) as last_seen_at,
  coalesce(raw_offer_confirmations.verified_at, raw_offers.verified_at) as verified_at,
  coalesce(raw_offer_confirmations.expires_at, raw_offers.expires_at) as expires_at,
  coalesce(raw_offer_confirmations.source_priority, raw_offers.source_priority) as source_priority,
  coalesce(raw_offer_confirmations.confidence, raw_offers.confidence) as confidence,
  raw_offers.last_failed_at,
  raw_offers.failure_reason,
  raw_offers.created_at,
  raw_offers.updated_at
from raw_offers
left join raw_offer_confirmations
  on raw_offer_confirmations.raw_offer_id = raw_offers.id;

create or replace function acquire_source_collection_lock(
  p_source_id text,
  p_owner text,
  p_lock_seconds integer default 600
)
returns table(acquired boolean, lock_owner text, lock_until timestamptz)
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(secs => greatest(60, least(coalesce(p_lock_seconds, 600), 3600)));
begin
  update sources
  set
    collector_lock_owner = p_owner,
    collector_lock_started_at = v_now,
    collector_lock_until = v_lock_until,
    updated_at = v_now
  where id = p_source_id
    and (
      collector_lock_until is null
      or collector_lock_until < v_now
      or collector_lock_owner = p_owner
    );

  if found then
    return query select true, p_owner, v_lock_until;
    return;
  end if;

  return query
  select
    false,
    sources.collector_lock_owner,
    sources.collector_lock_until
  from sources
  where sources.id = p_source_id;
end;
$$;

create or replace function release_source_collection_lock(
  p_source_id text,
  p_owner text
)
returns boolean
language plpgsql
security definer
as $$
begin
  update sources
  set
    collector_lock_owner = null,
    collector_lock_started_at = null,
    collector_lock_until = null,
    updated_at = now()
  where id = p_source_id
    and collector_lock_owner = p_owner;

  return found;
end;
$$;

create or replace function list_public_product_offers_page(
  p_product_id text,
  p_limit integer default 80,
  p_offset integer default 0
)
returns table (
  id text,
  source_id text,
  source_name text,
  source_store_name text,
  source_title text,
  price numeric,
  currency text,
  status text,
  url text,
  tags text[],
  stock_count integer,
  hidden boolean,
  canonical_product_id text,
  category_slug text,
  captured_at timestamptz,
  source_updated_at timestamptz,
  last_seen_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer,
  confidence numeric,
  effective_status text,
  freshness_status text,
  last_failed_at timestamptz,
  failure_reason text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      raw_offers.*,
      count(*) over() as total_count,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then 0
        else 1
      end as availability_rank,
      case
        when coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) && array['shared_access', 'domestic_mirror_site']::text[]
        then 1
        else 0
      end as special_delivery_rank,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label
    from raw_offer_public_state raw_offers
    where raw_offers.hidden = false
      and raw_offers.canonical_product_id = p_product_id
  )
  select
    ranked.id,
    ranked.source_id,
    ranked.source_name,
    ranked.source_store_name,
    ranked.source_title,
    ranked.price,
    ranked.currency,
    ranked.status,
    ranked.url,
    ranked.tags,
    ranked.stock_count,
    ranked.hidden,
    ranked.canonical_product_id,
    ranked.category_slug,
    ranked.captured_at,
    ranked.source_updated_at,
    ranked.last_seen_at,
    ranked.verified_at,
    ranked.expires_at,
    ranked.source_priority,
    ranked.confidence,
    ranked.effective_status,
    ranked.freshness_status,
    ranked.last_failed_at,
    ranked.failure_reason,
    ranked.total_count
  from ranked
  order by
    ranked.availability_rank asc,
    ranked.special_delivery_rank asc,
    ranked.price asc nulls last,
    ranked.public_updated_at desc nulls last,
    ranked.public_source_label asc,
    ranked.source_title asc,
    ranked.url asc,
    ranked.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function list_public_product_offers_page_v2(
  p_product_id text,
  p_filter_tags text[] default '{}',
  p_query text default null,
  p_exclude_query text default null,
  p_collector text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_limit integer default 80,
  p_offset integer default 0
)
returns table (
  id text,
  source_id text,
  source_name text,
  source_store_name text,
  source_title text,
  price numeric,
  currency text,
  status text,
  url text,
  tags text[],
  stock_count integer,
  hidden boolean,
  canonical_product_id text,
  category_slug text,
  captured_at timestamptz,
  source_updated_at timestamptz,
  last_seen_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer,
  confidence numeric,
  effective_status text,
  freshness_status text,
  last_failed_at timestamptz,
  failure_reason text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with product as (
    select id
    from canonical_products
    where is_active = true
      and (canonical_products.id = p_product_id or canonical_products.slug = p_product_id)
    limit 1
  ),
  filtered as (
    select
      raw_offers.*,
      sources.collector_kind,
      concat_ws(
        ' ',
        raw_offers.source_title,
        raw_offers.source_name,
        raw_offers.source_store_name,
        raw_offers.url,
        array_to_string(raw_offers.tags, ' ')
      ) as public_haystack,
      case
        when sources.collector_kind = 'shopApi' then 'shopApi'
        when sources.collector_kind = 'dujiao' then 'dujiao'
        when sources.collector_kind = 'kami' then 'kami'
        else 'other'
      end as collector_group
    from raw_offer_public_state raw_offers
    join product on product.id = raw_offers.canonical_product_id
    left join sources on sources.id = raw_offers.source_id
    where raw_offers.hidden = false
  ),
  ranked as (
    select
      filtered.*,
      count(*) over() as total_count,
      case
        when filtered.status <> 'out_of_stock'
          and filtered.price is not null
          and filtered.url <> ''
          and coalesce(filtered.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(filtered.freshness_status, '') not in ('expired', 'failed')
          and (filtered.expires_at is null or filtered.expires_at > now())
        then 0
        else 1
      end as availability_rank,
      case
        when filtered.public_filter_tags && array['shared_access', 'domestic_mirror_site']::text[]
        then 1
        else 0
      end as special_delivery_rank,
      coalesce(filtered.verified_at, filtered.last_seen_at, filtered.captured_at, filtered.source_updated_at) as public_updated_at,
      coalesce(filtered.source_store_name, filtered.source_name, '') as public_source_label
    from filtered
    where (coalesce(array_length(p_filter_tags, 1), 0) = 0 or filtered.public_filter_tags @> p_filter_tags)
      and (p_query is null or trim(p_query) = '' or filtered.public_haystack ilike ('%' || trim(p_query) || '%'))
      and (
        p_exclude_query is null
        or trim(p_exclude_query) = ''
        or not exists (
          select 1
          from regexp_split_to_table(trim(p_exclude_query), '[,，[:space:]]+') as excluded_term(term)
          where excluded_term.term <> ''
            and filtered.public_haystack ilike ('%' || excluded_term.term || '%')
        )
      )
      and (p_collector is null or trim(p_collector) = '' or p_collector = 'all' or filtered.collector_group = p_collector)
      and (p_min_price is null or filtered.price >= p_min_price)
      and (p_max_price is null or filtered.price <= p_max_price)
  )
  select
    ranked.id,
    ranked.source_id,
    ranked.source_name,
    ranked.source_store_name,
    ranked.source_title,
    ranked.price,
    ranked.currency,
    ranked.status,
    ranked.url,
    ranked.tags,
    ranked.stock_count,
    ranked.hidden,
    ranked.canonical_product_id,
    ranked.category_slug,
    ranked.captured_at,
    ranked.source_updated_at,
    ranked.last_seen_at,
    ranked.verified_at,
    ranked.expires_at,
    ranked.source_priority,
    ranked.confidence,
    ranked.effective_status,
    ranked.freshness_status,
    ranked.last_failed_at,
    ranked.failure_reason,
    ranked.total_count
  from ranked
  order by
    ranked.availability_rank asc,
    ranked.special_delivery_rank asc,
    ranked.price asc nulls last,
    ranked.public_updated_at desc nulls last,
    ranked.public_source_label asc,
    ranked.source_title asc,
    ranked.url asc,
    ranked.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function list_public_product_offer_filter_facets(
  p_product_id text
)
returns table (
  tag_id text,
  offer_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with product as (
    select id
    from canonical_products
    where is_active = true
      and (canonical_products.id = p_product_id or canonical_products.slug = p_product_id)
    limit 1
  ),
  tag_rows as (
    select distinct
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as offer_key,
      unnest(raw_offers.public_filter_tags) as tag_id
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
      and coalesce(array_length(raw_offers.public_filter_tags, 1), 0) > 0
  )
  select
    tag_rows.tag_id,
    count(*) as offer_count
  from tag_rows
  where tag_rows.tag_id is not null
    and tag_rows.tag_id <> ''
  group by tag_rows.tag_id
  order by array_position(
    array[
      'shared_access',
      'domestic_mirror_site',
      'delivery_recharge',
      'delivery_account',
      'team_k12',
      'team_bug',
      'team_official',
      'duration_trial',
      'duration_month',
      'duration_quarter',
      'duration_half_year',
      'duration_year',
      'verification_single',
      'verification_short',
      'verification_long',
      'verification_monthly',
      'telegram_region_us',
      'telegram_region_india',
      'telegram_premium_quarter',
      'telegram_premium_half_year',
      'telegram_premium_year',
      'telegram_stars',
      'proxy_supported',
      'gemini_antigravity_gcp',
      'gemini_phone_required',
      'gemini_appeal_required',
      'warranty_long'
    ]::text[],
    tag_rows.tag_id
  ),
  tag_rows.tag_id;
$$;

drop function if exists get_public_product_summary(text);
drop function if exists list_public_product_summaries();

create or replace function list_public_product_summaries()
returns table (
  id text,
  slug text,
  display_name text,
  platform text,
  product_type text,
  spec text,
  summary text,
  aliases text[],
  updated_at timestamptz,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  lowest_price numeric,
  warranty_lowest_price numeric,
  warranty_offer_count bigint,
  latest_seen_at timestamptz,
  lowest_offer jsonb,
  warranty_lowest_offer jsonb,
  has_out_of_stock boolean,
  offer_search_text text
)
language sql
stable
security definer
set search_path = public
as $$
  with products as (
    select *
    from canonical_products
    where is_active = true
  ),
  offers as (
    select
      raw_offers.*,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then true
        else false
      end as is_public_available,
      coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) as public_offer_filter_tags,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label
    from raw_offer_public_state raw_offers
    join products on products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  ),
  lowest_ranked as (
    select
      offers.*,
      row_number() over (
        partition by offers.canonical_product_id
        order by
          offers.price asc nulls last,
          offers.public_updated_at desc nulls last,
          offers.public_source_label asc,
          offers.source_title asc,
          offers.url asc,
          offers.id asc
      ) as lowest_rank
    from offers
    where offers.is_public_available = true
      and not (offers.public_offer_filter_tags @> array['shared_access']::text[])
      and not (offers.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  warranty_lowest_ranked as (
    select
      offers.*,
      row_number() over (
        partition by offers.canonical_product_id
        order by
          offers.price asc nulls last,
          offers.public_updated_at desc nulls last,
          offers.public_source_label asc,
          offers.source_title asc,
          offers.url asc,
          offers.id asc
      ) as warranty_lowest_rank
    from offers
    where offers.is_public_available = true
      and offers.public_offer_filter_tags @> array['warranty_long']::text[]
      and not (offers.public_offer_filter_tags @> array['shared_access']::text[])
      and not (offers.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  stats as (
    select
      offers.canonical_product_id,
      count(*) as offer_count,
      count(*) filter (where offers.is_public_available = true) as in_stock_count,
      count(*) filter (
        where offers.is_public_available = true
          and offers.public_offer_filter_tags @> array['warranty_long']::text[]
      ) as warranty_offer_count,
      count(*) filter (where offers.is_public_available = false) as out_of_stock_count,
      max(offers.public_updated_at) as latest_seen_at,
      bool_or(offers.is_public_available = false) as has_out_of_stock,
      left(
        string_agg(
          distinct concat_ws(' ', offers.source_title, offers.source_name, offers.source_store_name),
          ' '
        ),
        480
      ) as offer_search_text
    from offers
    group by offers.canonical_product_id
  )
  select
    products.id,
    products.slug,
    products.display_name,
    products.platform,
    products.product_type,
    products.spec,
    products.summary,
    products.aliases,
    products.updated_at,
    coalesce(stats.offer_count, 0) as offer_count,
    coalesce(stats.in_stock_count, 0) as in_stock_count,
    coalesce(stats.out_of_stock_count, 0) as out_of_stock_count,
    lowest.price as lowest_price,
    warranty_lowest.price as warranty_lowest_price,
    coalesce(stats.warranty_offer_count, 0) as warranty_offer_count,
    stats.latest_seen_at,
    case
      when lowest.id is null then null
      else jsonb_build_object(
        'id', lowest.id,
        'source_id', lowest.source_id,
        'source_name', lowest.source_name,
        'source_store_name', lowest.source_store_name,
        'source_title', lowest.source_title,
        'price', lowest.price,
        'currency', lowest.currency,
        'status', lowest.status,
        'url', lowest.url
      )
    end as lowest_offer,
    case
      when warranty_lowest.id is null then null
      else jsonb_build_object(
        'id', warranty_lowest.id,
        'source_id', warranty_lowest.source_id,
        'source_name', warranty_lowest.source_name,
        'source_store_name', warranty_lowest.source_store_name,
        'source_title', warranty_lowest.source_title,
        'price', warranty_lowest.price,
        'currency', warranty_lowest.currency,
        'status', warranty_lowest.status,
        'url', warranty_lowest.url
      )
    end as warranty_lowest_offer,
    coalesce(stats.has_out_of_stock, false) as has_out_of_stock,
    coalesce(stats.offer_search_text, '') as offer_search_text
  from products
  left join stats on stats.canonical_product_id = products.id
  left join lowest_ranked lowest
    on lowest.canonical_product_id = products.id
    and lowest.lowest_rank = 1
  left join warranty_lowest_ranked warranty_lowest
    on warranty_lowest.canonical_product_id = products.id
    and warranty_lowest.warranty_lowest_rank = 1
  order by products.platform, products.display_name, products.id;
$$;

create or replace function get_public_product_summary(p_product_key text)
returns table (
  id text,
  slug text,
  display_name text,
  platform text,
  product_type text,
  spec text,
  summary text,
  aliases text[],
  updated_at timestamptz,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  lowest_price numeric,
  warranty_lowest_price numeric,
  warranty_offer_count bigint,
  latest_seen_at timestamptz,
  lowest_offer jsonb,
  warranty_lowest_offer jsonb,
  has_out_of_stock boolean,
  offer_search_text text
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from list_public_product_summaries()
  where list_public_product_summaries.id = p_product_key
    or list_public_product_summaries.slug = p_product_key
  limit 1;
$$;

revoke execute on function priceai_public_offer_filter_tags(text, text[]) from anon, public;
revoke execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
revoke execute on function list_public_product_offer_filter_facets(text) from anon, authenticated, public;
revoke execute on function list_public_product_summaries() from anon, public;
revoke execute on function get_public_product_summary(text) from anon, public;

grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
grant execute on function list_public_product_summaries() to service_role;
grant execute on function get_public_product_summary(text) to service_role;

create or replace function claim_collection_job(
  p_worker text,
  p_lock_seconds integer default 1800
)
returns setof collection_jobs
language plpgsql
security definer
as $$
declare
  v_job_id text;
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(secs => greatest(60, least(coalesce(p_lock_seconds, 1800), 7200)));
begin
  select id into v_job_id
  from collection_jobs
  where
    status = 'pending'
    or (
      status = 'running'
      and locked_until is not null
      and locked_until < v_now
      and attempts < max_attempts
    )
  order by priority desc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update collection_jobs
  set
    status = 'running',
    locked_by = p_worker,
    locked_until = v_lock_until,
    started_at = coalesce(started_at, v_now),
    finished_at = null,
    attempts = attempts + 1,
    updated_at = v_now
  where id = v_job_id;

  return query
  select *
  from collection_jobs
  where id = v_job_id;
end;
$$;

create or replace function claim_collection_job_by_id(
  p_job_id text,
  p_worker text,
  p_lock_seconds integer default 1800
)
returns setof collection_jobs
language plpgsql
security definer
as $$
declare
  v_job_id text;
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(secs => greatest(60, least(coalesce(p_lock_seconds, 1800), 7200)));
begin
  select id into v_job_id
  from collection_jobs
  where id = p_job_id
    and (
      status = 'pending'
      or (
        status = 'running'
        and locked_until is not null
        and locked_until < v_now
        and attempts < max_attempts
      )
    )
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update collection_jobs
  set
    status = 'running',
    locked_by = p_worker,
    locked_until = v_lock_until,
    started_at = coalesce(started_at, v_now),
    finished_at = null,
    attempts = attempts + 1,
    updated_at = v_now
  where id = v_job_id;

  return query
  select *
  from collection_jobs
  where id = v_job_id;
end;
$$;

alter function claim_collection_job_by_id(text, text, integer) set search_path = public;

revoke execute on function claim_collection_job_by_id(text, text, integer) from anon, authenticated, public;
grant execute on function claim_collection_job_by_id(text, text, integer) to service_role;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists canonical_products_set_updated_at on canonical_products;
create trigger canonical_products_set_updated_at
before update on canonical_products
for each row execute function set_updated_at();

drop trigger if exists sources_set_updated_at on sources;
create trigger sources_set_updated_at
before update on sources
for each row execute function set_updated_at();

drop trigger if exists raw_offers_set_updated_at on raw_offers;
create trigger raw_offers_set_updated_at
before update on raw_offers
for each row execute function set_updated_at();

drop trigger if exists raw_offer_confirmations_set_updated_at on raw_offer_confirmations;
create trigger raw_offer_confirmations_set_updated_at
before update on raw_offer_confirmations
for each row execute function set_updated_at();

drop trigger if exists crawl_log_ingest_runs_set_updated_at on crawl_log_ingest_runs;
create trigger crawl_log_ingest_runs_set_updated_at
before update on crawl_log_ingest_runs
for each row execute function set_updated_at();

drop trigger if exists collection_jobs_set_updated_at on collection_jobs;
create trigger collection_jobs_set_updated_at
before update on collection_jobs
for each row execute function set_updated_at();

drop trigger if exists collector_heartbeats_set_updated_at on collector_heartbeats;
create trigger collector_heartbeats_set_updated_at
before update on collector_heartbeats
for each row execute function set_updated_at();

-- Default-deny RLS. The Next.js app talks to Supabase via the service role key
-- (server-only), which bypasses RLS. The anon key cannot read or write.
alter table canonical_products enable row level security;
alter table sources enable row level security;
alter table raw_offers enable row level security;
alter table raw_offer_confirmations enable row level security;
alter table offer_matches enable row level security;
alter table crawl_runs enable row level security;
alter table crawl_log_ingest_runs enable row level security;
alter table collection_jobs enable row level security;
alter table collector_heartbeats enable row level security;

create table if not exists channel_submissions (
  id text primary key,
  url text not null,
  name text,
  contact text,
  notes text,
  parsed_title text,
  parsed_meta jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  reviewer_note text,
  approved_source_id text references sources(id) on delete set null,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists channel_submissions_status_idx on channel_submissions(status);
create index if not exists channel_submissions_created_at_idx on channel_submissions(created_at desc);
create index if not exists channel_submissions_url_idx on channel_submissions(url);

alter table channel_submissions enable row level security;

create table if not exists offer_feedback (
  id text primary key,
  product_id text,
  product_slug text,
  product_name text,
  offer_id text references raw_offers(id) on delete set null,
  source_id text references sources(id) on delete set null,
  source_name text,
  source_title text,
  offer_url text,
  offer_price numeric,
  offer_currency text,
  offer_status text,
  offer_captured_at timestamptz,
  offer_source_updated_at timestamptz,
  offer_last_seen_at timestamptz,
  reason text not null,
  user_expected_action text not null default 'recheck',
  suggested_action text not null default 'recollect',
  evidence_text text,
  evidence_urls jsonb not null default '[]'::jsonb,
  ai_review_result jsonb,
  notes text,
  contact text,
  status text not null default 'pending',
  reviewer_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table offer_feedback
  add column if not exists verification_status text not null default 'not_needed',
  add column if not exists verification_result text,
  add column if not exists verification_message text,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists created_collection_job_id text references collection_jobs(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offer_feedback_verification_status_check'
  ) then
    alter table offer_feedback
      add constraint offer_feedback_verification_status_check
      check (
        verification_status in (
          'not_needed',
          'pending',
          'running',
          'auto_fixed',
          'recollection_created',
          'manual_review',
          'failed'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'offer_feedback_verification_result_check'
  ) then
    alter table offer_feedback
      add constraint offer_feedback_verification_result_check
      check (
        verification_result is null
        or verification_result in (
          'offer_changed',
          'item_removed',
          'out_of_stock',
          'still_available',
          'recollection_created',
          'inconclusive',
          'blocked'
        )
      );
  end if;
end $$;

create index if not exists offer_feedback_status_idx on offer_feedback(status);
create index if not exists offer_feedback_created_at_idx on offer_feedback(created_at desc);
create index if not exists offer_feedback_offer_id_idx on offer_feedback(offer_id);
create index if not exists offer_feedback_source_id_idx on offer_feedback(source_id);
create index if not exists offer_feedback_suggested_action_idx on offer_feedback(suggested_action);
create index if not exists offer_feedback_verification_status_idx
  on offer_feedback(verification_status, created_at desc);
create index if not exists offer_feedback_created_collection_job_id_idx
  on offer_feedback(created_collection_job_id);

alter table offer_feedback enable row level security;

create or replace function reap_expired_collection_jobs(
  p_worker text default 'collector-agent',
  p_limit integer default 50
)
returns setof collection_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
begin
  return query
  with expired as (
    select id
    from collection_jobs
    where status = 'running'
      and locked_until is not null
      and locked_until < v_now
      and attempts >= max_attempts
    order by locked_until asc, created_at asc
    for update skip locked
    limit v_limit
  ),
  reaped as (
    update collection_jobs jobs
    set
      status = 'failed',
      finished_at = v_now,
      locked_by = null,
      locked_until = null,
      last_error = coalesce(
        jobs.last_error,
        '采集任务锁已过期，且重试次数已用尽；系统已自动收敛为失败。'
      ),
      result = coalesce(jobs.result, '{}'::jsonb) || jsonb_build_object(
        'reapedBy', coalesce(nullif(p_worker, ''), 'collector-agent'),
        'reapedAt', v_now,
        'reapReason', 'expired_lock_max_attempts'
      ),
      updated_at = v_now
    from expired
    where jobs.id = expired.id
    returning jobs.*
  ),
  feedback_updated as (
    update offer_feedback feedback
    set
      verification_status = 'failed',
      verification_result = 'blocked',
      verification_message = '自动重采任务锁已过期且重试次数已用尽；请人工复核或重新触发重采。',
      verification_checked_at = v_now,
      ai_review_result = coalesce(feedback.ai_review_result, '{}'::jsonb) || jsonb_build_object(
        'verificationStatus', 'failed',
        'verificationResult', 'blocked',
        'verificationMessage', '自动重采任务锁已过期且重试次数已用尽；请人工复核或重新触发重采。',
        'verifiedAt', v_now,
        'completedCollectionJobId', feedback.created_collection_job_id,
        'reapReason', 'expired_lock_max_attempts'
      )
    from reaped
    where feedback.created_collection_job_id = reaped.id
      and reaped.requested_by = 'feedback'
      and feedback.verification_status in ('pending', 'running', 'recollection_created')
    returning feedback.id
  )
  select * from reaped;
end;
$$;

revoke execute on function reap_expired_collection_jobs(text, integer) from anon, authenticated, public;
grant execute on function reap_expired_collection_jobs(text, integer) to service_role;

create or replace function list_public_merchant_summaries()
returns table (
  id text,
  source_id text,
  name text,
  store_name text,
  source_name text,
  entry_url text,
  shop_url text,
  host text,
  collector_kind text,
  health_status text,
  last_success_at timestamptz,
  consecutive_failures integer,
  product_count bigint,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  platform_count bigint,
  platforms text[],
  product_types text[],
  lowest_hit_count bigint,
  warranty_lowest_hit_count bigint,
  risk_feedback_count bigint,
  latest_seen_at timestamptz,
  observation_started_at timestamptz,
  included_at timestamptz,
  shop_created_at timestamptz,
  representative_product text,
  representative_offer_title text,
  representative_price numeric,
  representative_currency text,
  has_platform_aftersales_mechanism boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with products as (
    select *
    from canonical_products
    where is_active = true
  ),
  offers as (
    select
      raw_offers.*,
      products.display_name as product_display_name,
      products.platform as product_platform,
      products.product_type as product_type,
      coalesce(sources.name, raw_offers.source_name, raw_offers.source_store_name, '') as resolved_source_name,
      sources.entry_url,
      sources.base_url,
      sources.collector_kind,
      sources.health_status,
      sources.last_success_at,
      sources.consecutive_failures,
      sources.created_at as source_created_at,
      sources.shop_created_at,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then true
        else false
      end as is_public_available,
      coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) as public_offer_filter_tags,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, sources.name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offer_public_state raw_offers
    join products on products.id = raw_offers.canonical_product_id
    left join sources on sources.id = raw_offers.source_id
    where raw_offers.hidden = false
  ),
  deduped as (
    select *
    from (
      select
        offers.*,
        row_number() over (
          partition by offers.public_dedupe_key
          order by
            case when offers.is_public_available then 0 else 1 end asc,
            offers.source_priority desc nulls last,
            offers.confidence desc nulls last,
            offers.public_updated_at desc nulls last,
            offers.public_source_label asc,
            offers.source_title asc,
            offers.url asc,
            offers.id asc
        ) as dedupe_rank
      from offers
    ) ranked
    where ranked.dedupe_rank = 1
  ),
  lowest_ranked as (
    select
      deduped.*,
      row_number() over (
        partition by deduped.canonical_product_id
        order by
          deduped.price asc nulls last,
          deduped.public_updated_at desc nulls last,
          deduped.public_source_label asc,
          deduped.source_title asc,
          deduped.url asc,
          deduped.id asc
      ) as lowest_rank
    from deduped
    where deduped.is_public_available = true
      and not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
      and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  warranty_lowest_ranked as (
    select
      deduped.*,
      row_number() over (
        partition by deduped.canonical_product_id
        order by
          deduped.price asc nulls last,
          deduped.public_updated_at desc nulls last,
          deduped.public_source_label asc,
          deduped.source_title asc,
          deduped.url asc,
          deduped.id asc
      ) as warranty_lowest_rank
    from deduped
    where deduped.is_public_available = true
      and deduped.public_offer_filter_tags @> array['warranty_long']::text[]
      and not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
      and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  feedback as (
    select
      source_id,
      count(*) as risk_feedback_count
    from offer_feedback
    where status <> 'ignored'
      and source_id is not null
      and ai_review_result -> 'riskPrecheck' is not null
      and ai_review_result -> 'riskPrecheck' ->> 'status' = 'ready'
      and ai_review_result -> 'riskPrecheck' ->> 'canShowPublicly' = 'true'
      and coalesce(ai_review_result -> 'riskPrecheck' ->> 'publicHidden', 'false') <> 'true'
      and ai_review_result -> 'riskPrecheck' ->> 'sourceCanShowPublicly' = 'true'
    group by source_id
  ),
  merchant_rows as (
    select
      coalesce(deduped.source_id, 'fallback:' || md5(coalesce(deduped.public_source_label, '') || '|' || coalesce(deduped.collector_kind, '') || '|' || coalesce(deduped.url, ''))) as merchant_key,
      min(deduped.source_id) as source_id,
      coalesce(max(deduped.public_source_label), max(deduped.resolved_source_name), '未记录商家') as name,
      max(deduped.source_store_name) as store_name,
      coalesce(max(deduped.source_name), max(deduped.resolved_source_name), max(deduped.public_source_label), '未记录渠道') as source_name,
      max(deduped.entry_url) as entry_url,
      coalesce(
        max(deduped.entry_url) filter (where deduped.entry_url ~ '/shop/'),
        max(deduped.entry_url) filter (where deduped.entry_url !~ '/item/'),
        'https://pay.ldxp.cn/shop/' || nullif(substring(
          coalesce(
            min(deduped.source_id) filter (where deduped.source_id ~* '^ldxp-[^/]+$' and deduped.source_id <> 'ldxp-cn'),
            max(deduped.source_name) filter (where deduped.source_name ~* 'LDXP\s*/\s*[^/\s]+')
          )
          from '(?:^ldxp-|LDXP\s*/\s*)([^/\s]+)'
        ), ''),
        max(deduped.base_url)
      ) as shop_url,
      lower(regexp_replace((regexp_match(coalesce(max(deduped.entry_url), max(deduped.base_url), ''), '^https?://(?:www\.)?([^/?#]+)'))[1], '^www\.', '')) as host,
      max(deduped.collector_kind) as collector_kind,
      max(deduped.health_status) as health_status,
      max(deduped.last_success_at) as last_success_at,
      max(deduped.consecutive_failures) as consecutive_failures,
      count(distinct deduped.canonical_product_id) as product_count,
      count(*) as offer_count,
      count(*) filter (where deduped.is_public_available = true) as in_stock_count,
      count(*) filter (where deduped.is_public_available = false) as out_of_stock_count,
      count(distinct deduped.product_platform) as platform_count,
      array_agg(distinct deduped.product_platform order by deduped.product_platform) as platforms,
      array_agg(distinct deduped.product_type order by deduped.product_type) as product_types,
      count(*) filter (where lowest_ranked.lowest_rank = 1) as lowest_hit_count,
      count(*) filter (where warranty_lowest_ranked.warranty_lowest_rank = 1) as warranty_lowest_hit_count,
      max(coalesce(feedback.risk_feedback_count, 0)) as risk_feedback_count,
      max(deduped.public_updated_at) as latest_seen_at,
      min(coalesce(deduped.public_updated_at, deduped.captured_at)) as observation_started_at,
      min(deduped.source_created_at) as included_at,
      min(deduped.shop_created_at) as shop_created_at,
      (array_agg(deduped.product_display_name order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_product,
      (array_agg(deduped.source_title order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_offer_title,
      (array_agg(deduped.price order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_price,
      (array_agg(deduped.currency order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_currency,
      bool_or(deduped.collector_kind = 'shopApi') as has_platform_aftersales_mechanism
    from deduped
    left join lowest_ranked
      on lowest_ranked.id = deduped.id
      and lowest_ranked.lowest_rank = 1
    left join warranty_lowest_ranked
      on warranty_lowest_ranked.id = deduped.id
      and warranty_lowest_ranked.warranty_lowest_rank = 1
    left join feedback on feedback.source_id = deduped.source_id
    group by coalesce(deduped.source_id, 'fallback:' || md5(coalesce(deduped.public_source_label, '') || '|' || coalesce(deduped.collector_kind, '') || '|' || coalesce(deduped.url, '')))
  )
  select
    'merchant-' || md5(merchant_rows.merchant_key) as id,
    merchant_rows.source_id,
    merchant_rows.name,
    merchant_rows.store_name,
    merchant_rows.source_name,
    merchant_rows.entry_url,
    merchant_rows.shop_url,
    merchant_rows.host,
    merchant_rows.collector_kind,
    merchant_rows.health_status,
    merchant_rows.last_success_at,
    merchant_rows.consecutive_failures,
    merchant_rows.product_count,
    merchant_rows.offer_count,
    merchant_rows.in_stock_count,
    merchant_rows.out_of_stock_count,
    merchant_rows.platform_count,
    merchant_rows.platforms,
    merchant_rows.product_types,
    merchant_rows.lowest_hit_count,
    merchant_rows.warranty_lowest_hit_count,
    merchant_rows.risk_feedback_count,
    merchant_rows.latest_seen_at,
    merchant_rows.observation_started_at,
    merchant_rows.included_at,
    merchant_rows.shop_created_at,
    merchant_rows.representative_product,
    merchant_rows.representative_offer_title,
    merchant_rows.representative_price,
    merchant_rows.representative_currency,
    merchant_rows.has_platform_aftersales_mechanism,
    count(*) over() as total_count
  from merchant_rows
  order by
    merchant_rows.in_stock_count desc,
    merchant_rows.warranty_lowest_hit_count desc,
    merchant_rows.lowest_hit_count desc,
    merchant_rows.has_platform_aftersales_mechanism desc,
    merchant_rows.latest_seen_at desc nulls last,
    merchant_rows.product_count desc,
    merchant_rows.risk_feedback_count asc,
    merchant_rows.name asc;
$$;

revoke execute on function list_public_merchant_summaries() from anon, public;
grant execute on function list_public_merchant_summaries() to service_role;

create table if not exists site_feedback (
  id text primary key,
  type text not null,
  message text not null,
  contact text,
  page_url text,
  status text not null default 'pending',
  reviewer_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists site_feedback_status_idx on site_feedback(status);
create index if not exists site_feedback_created_at_idx on site_feedback(created_at desc);

alter table site_feedback enable row level security;

create extension if not exists pgcrypto;

create table if not exists official_subscription_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  provider text not null,
  app_store_id text not null,
  app_store_slug text not null,
  logo_key text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists official_subscription_regions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  storefront_code text not null,
  country_label text not null,
  currency_code text not null,
  enabled boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists official_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  slug text not null,
  label text not null,
  billing_period text not null check (billing_period in ('monthly', 'annual', 'one_time')),
  notes text,
  aliases text[] not null default '{}'::text[],
  match_rules jsonb not null default '{}'::jsonb,
  canonical_product_id text references canonical_products(id) on delete set null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug)
);

create table if not exists official_subscription_collect_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'manual' check (mode in ('manual', 'cron', 'worker')),
  target_app_slug text,
  target_region_codes text[],
  status text not null check (status in ('success', 'partial_success', 'failed')),
  success_count integer not null default 0,
  failure_count integer not null default 0,
  unmatched_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  logs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists official_subscription_region_prices (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  plan_id uuid not null references official_subscription_plans(id) on delete cascade,
  region_id uuid not null references official_subscription_regions(id) on delete cascade,
  price_text text,
  price_value numeric,
  currency_code text,
  cny_price numeric,
  fx_rate_to_cny numeric,
  fx_date date,
  source_url text not null,
  evidence_source text not null default 'app_store_html' check (evidence_source in ('app_store_html', 'amp_catalog', 'manual_verified')),
  status text not null check (status in ('available', 'stale', 'missing', 'parse_failed', 'needs_review')),
  raw_title text,
  raw_snippet_hash text,
  last_success_at timestamptz,
  last_checked_at timestamptz not null default now(),
  failure_reason text,
  updated_at timestamptz not null default now(),
  unique (app_id, plan_id, region_id)
);

create table if not exists official_subscription_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references official_subscription_collect_runs(id) on delete set null,
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  plan_id uuid not null references official_subscription_plans(id) on delete cascade,
  region_id uuid not null references official_subscription_regions(id) on delete cascade,
  price_text text,
  price_value numeric,
  currency_code text,
  cny_price numeric,
  fx_rate_to_cny numeric,
  fx_date date,
  source_url text not null,
  evidence_source text not null default 'app_store_html' check (evidence_source in ('app_store_html', 'amp_catalog', 'manual_verified')),
  raw_title text,
  raw_snippet_hash text,
  fetched_at timestamptz not null,
  status text not null check (status in ('available', 'stale', 'missing', 'parse_failed', 'needs_review')),
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  target_currency text not null,
  rate numeric not null,
  date date not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (base_currency, target_currency, date, source)
);

create index if not exists official_subscription_apps_enabled_sort_idx
  on official_subscription_apps(enabled, sort_order);
create index if not exists official_subscription_plans_app_sort_idx
  on official_subscription_plans(app_id, enabled, sort_order);
create index if not exists official_subscription_regions_enabled_priority_idx
  on official_subscription_regions(enabled, priority);
create index if not exists official_subscription_region_prices_status_idx
  on official_subscription_region_prices(status, updated_at desc);
create index if not exists official_subscription_region_prices_plan_idx
  on official_subscription_region_prices(plan_id, status, cny_price);
create index if not exists official_subscription_price_snapshots_run_idx
  on official_subscription_price_snapshots(run_id, created_at desc);
create index if not exists official_subscription_collect_runs_finished_idx
  on official_subscription_collect_runs(finished_at desc);

drop trigger if exists official_subscription_apps_set_updated_at on official_subscription_apps;
create trigger official_subscription_apps_set_updated_at
before update on official_subscription_apps
for each row execute function set_updated_at();

drop trigger if exists official_subscription_regions_set_updated_at on official_subscription_regions;
create trigger official_subscription_regions_set_updated_at
before update on official_subscription_regions
for each row execute function set_updated_at();

drop trigger if exists official_subscription_plans_set_updated_at on official_subscription_plans;
create trigger official_subscription_plans_set_updated_at
before update on official_subscription_plans
for each row execute function set_updated_at();

drop trigger if exists official_subscription_region_prices_set_updated_at on official_subscription_region_prices;
create trigger official_subscription_region_prices_set_updated_at
before update on official_subscription_region_prices
for each row execute function set_updated_at();

alter table official_subscription_apps enable row level security;
alter table official_subscription_regions enable row level security;
alter table official_subscription_plans enable row level security;
alter table official_subscription_collect_runs enable row level security;
alter table official_subscription_region_prices enable row level security;
alter table official_subscription_price_snapshots enable row level security;
alter table fx_rates enable row level security;
create table if not exists api_model_families (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo_url text,
  official_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_models (
  id text primary key,
  family_id text not null references api_model_families(id) on delete restrict,
  display_name text not null,
  model_id text not null,
  aliases text[] not null default '{}'::text[],
  context_window text,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'needs_review')),
  source_url text not null,
  source_label text not null default '公开来源',
  capabilities text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_providers (
  id text primary key,
  name text not null,
  slug text not null unique,
  type text not null check (type in ('official', 'router', 'free', 'subscription')),
  billing_mode text not null,
  official_url text not null,
  pricing_url text,
  logo_url text,
  description text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  source_label text not null default '公开来源',
  collector_kind text,
  enabled boolean not null default true,
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_plans (
  id text primary key,
  provider_id text not null references api_providers(id) on delete cascade,
  name text not null,
  type text not null check (type in ('official', 'router', 'free', 'subscription')),
  price_label text not null default '',
  price_usd_monthly numeric,
  price_cny_monthly numeric,
  quota_summary text not null default '',
  reset_summary text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  coverage_label text,
  compatibility text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  source_url text not null,
  source_label text not null default '公开来源',
  enabled boolean not null default true,
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_plan_models (
  plan_id text not null references api_plans(id) on delete cascade,
  model_id text not null references api_models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, model_id)
);

create table if not exists api_model_offers (
  id text primary key,
  model_id text not null references api_models(id) on delete cascade,
  provider_id text not null references api_providers(id) on delete cascade,
  plan_id text references api_plans(id) on delete set null,
  route_model_id text,
  input_price jsonb not null default '{"kind":"text","text":"待确认"}'::jsonb,
  output_price jsonb not null default '{"kind":"text","text":"待确认"}'::jsonb,
  cache_read_price jsonb,
  cache_write_price jsonb,
  free_or_plan text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  compatibility text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  pricing_url text,
  source_label text not null default '公开来源',
  collected_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive', 'needs_review')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_provider_submissions (
  id text primary key,
  submitted_url text not null,
  submitted_name text,
  submitted_contact text,
  submitted_note text,
  parsed_provider_url text,
  parsed_provider_name text,
  parsed_type text,
  parse_status text not null default 'pending',
  probe_status text not null default 'pending',
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'collector_todo', 'rejected')),
  admin_note text,
  provider_id text references api_providers(id) on delete set null,
  parsed_meta jsonb not null default '{}'::jsonb,
  submitter_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_collection_runs (
  id text primary key,
  provider_id text references api_providers(id) on delete set null,
  collector_kind text,
  status text not null check (status in ('success', 'partial', 'failed')),
  model_count integer not null default 0,
  offer_count integer not null default 0,
  error_message text,
  raw_snapshot_url text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  logs jsonb not null default '{}'::jsonb
);

create index if not exists api_models_family_id_idx on api_models(family_id);
create index if not exists api_models_status_idx on api_models(status);
create index if not exists api_providers_type_idx on api_providers(type);
create index if not exists api_providers_enabled_idx on api_providers(enabled);
create index if not exists api_plans_provider_id_idx on api_plans(provider_id);
create index if not exists api_model_offers_model_id_idx on api_model_offers(model_id);
create index if not exists api_model_offers_provider_id_idx on api_model_offers(provider_id);
create index if not exists api_model_offers_status_idx on api_model_offers(status);
create index if not exists api_collection_runs_started_at_idx on api_collection_runs(started_at desc);
create index if not exists api_provider_submissions_review_status_idx on api_provider_submissions(review_status);
create index if not exists api_provider_submissions_created_at_idx on api_provider_submissions(created_at desc);

drop trigger if exists api_model_families_set_updated_at on api_model_families;
create trigger api_model_families_set_updated_at
before update on api_model_families
for each row execute function set_updated_at();

drop trigger if exists api_models_set_updated_at on api_models;
create trigger api_models_set_updated_at
before update on api_models
for each row execute function set_updated_at();

drop trigger if exists api_providers_set_updated_at on api_providers;
create trigger api_providers_set_updated_at
before update on api_providers
for each row execute function set_updated_at();

drop trigger if exists api_plans_set_updated_at on api_plans;
create trigger api_plans_set_updated_at
before update on api_plans
for each row execute function set_updated_at();

drop trigger if exists api_model_offers_set_updated_at on api_model_offers;
create trigger api_model_offers_set_updated_at
before update on api_model_offers
for each row execute function set_updated_at();

drop trigger if exists api_provider_submissions_set_updated_at on api_provider_submissions;
create trigger api_provider_submissions_set_updated_at
before update on api_provider_submissions
for each row execute function set_updated_at();

alter table api_model_families enable row level security;
alter table api_models enable row level security;
alter table api_providers enable row level security;
alter table api_plans enable row level security;
alter table api_plan_models enable row level security;
alter table api_model_offers enable row level security;
alter table api_provider_submissions enable row level security;
alter table api_collection_runs enable row level security;

create table if not exists app_runtime_settings (
  id text primary key,
  provider text not null default 'opencode',
  base_url text not null,
  model text not null,
  timeout_ms integer not null default 12000 check (timeout_ms between 3000 and 60000),
  encrypted_api_key jsonb,
  api_key_hint text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_runtime_settings_set_updated_at on app_runtime_settings;
create trigger app_runtime_settings_set_updated_at
before update on app_runtime_settings
for each row execute function set_updated_at();

alter table app_runtime_settings enable row level security;

create or replace function prune_priceai_operational_logs(
  p_crawl_runs_per_source integer default 5,
  p_crawl_run_failure_retention_days integer default 7,
  p_crawl_run_global_limit integer default 1000,
  p_collection_jobs_limit integer default 200,
  p_official_collect_runs_limit integer default 5,
  p_api_collect_runs_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crawl_runs_per_source integer := greatest(1, least(coalesce(p_crawl_runs_per_source, 5), 50));
  v_crawl_run_failure_retention_days integer := greatest(1, least(coalesce(p_crawl_run_failure_retention_days, 7), 90));
  v_crawl_run_global_limit integer := greatest(100, least(coalesce(p_crawl_run_global_limit, 1000), 100000));
  v_collection_jobs_limit integer := greatest(30, least(coalesce(p_collection_jobs_limit, 200), 10000));
  v_official_collect_runs_limit integer := greatest(1, least(coalesce(p_official_collect_runs_limit, 5), 5000));
  v_api_collect_runs_limit integer := greatest(1, least(coalesce(p_api_collect_runs_limit, 5), 5000));
  v_crawl_success_deleted integer := 0;
  v_crawl_failure_deleted integer := 0;
  v_crawl_global_deleted integer := 0;
  v_collection_jobs_deleted integer := 0;
  v_official_snapshots_deleted integer := 0;
  v_official_runs_deleted integer := 0;
  v_api_runs_deleted integer := 0;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by coalesce(source_id, source_name, 'unknown')
        order by started_at desc nulls last, id desc
      ) as run_rank
    from crawl_runs
    where status = 'success'
  )
  delete from crawl_runs
  using ranked
  where crawl_runs.id = ranked.id
    and ranked.run_rank > v_crawl_runs_per_source;
  get diagnostics v_crawl_success_deleted = row_count;

  delete from crawl_runs
  where status <> 'success'
    and started_at < now() - make_interval(days => v_crawl_run_failure_retention_days);
  get diagnostics v_crawl_failure_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by started_at desc nulls last, id desc
      ) as global_rank
    from crawl_runs
  )
  delete from crawl_runs
  using ranked
  where crawl_runs.id = ranked.id
    and ranked.global_rank > v_crawl_run_global_limit;
  get diagnostics v_crawl_global_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by created_at desc nulls last, id desc
      ) as job_rank
    from collection_jobs
    where status in ('success', 'failed', 'cancelled')
  )
  delete from collection_jobs
  using ranked
  where collection_jobs.id = ranked.id
    and ranked.job_rank > v_collection_jobs_limit;
  get diagnostics v_collection_jobs_deleted = row_count;

  with stale_runs as (
    select id
    from (
      select
        id,
        row_number() over (
          order by finished_at desc nulls last, created_at desc nulls last, id desc
        ) as run_rank
      from official_subscription_collect_runs
    ) ranked
    where run_rank > v_official_collect_runs_limit
  )
  delete from official_subscription_price_snapshots
  using stale_runs
  where official_subscription_price_snapshots.run_id = stale_runs.id;
  get diagnostics v_official_snapshots_deleted = row_count;

  with stale_runs as (
    select id
    from (
      select
        id,
        row_number() over (
          order by finished_at desc nulls last, created_at desc nulls last, id desc
        ) as run_rank
      from official_subscription_collect_runs
    ) ranked
    where run_rank > v_official_collect_runs_limit
  )
  delete from official_subscription_collect_runs
  using stale_runs
  where official_subscription_collect_runs.id = stale_runs.id;
  get diagnostics v_official_runs_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by started_at desc nulls last, id desc
      ) as run_rank
    from api_collection_runs
  )
  delete from api_collection_runs
  using ranked
  where api_collection_runs.id = ranked.id
    and ranked.run_rank > v_api_collect_runs_limit;
  get diagnostics v_api_runs_deleted = row_count;

  return jsonb_build_object(
    'crawlRunsDeleted',
      v_crawl_success_deleted + v_crawl_failure_deleted + v_crawl_global_deleted,
    'crawlSuccessRunsDeleted', v_crawl_success_deleted,
    'crawlFailureRunsDeleted', v_crawl_failure_deleted,
    'crawlGlobalCapDeleted', v_crawl_global_deleted,
    'collectionJobsDeleted', v_collection_jobs_deleted,
    'officialSnapshotsDeleted', v_official_snapshots_deleted,
    'officialRunsDeleted', v_official_runs_deleted,
    'apiRunsDeleted', v_api_runs_deleted,
    'settings', jsonb_build_object(
      'crawlRunsPerSource', v_crawl_runs_per_source,
      'crawlRunFailureRetentionDays', v_crawl_run_failure_retention_days,
      'crawlRunGlobalLimit', v_crawl_run_global_limit,
      'collectionJobsLimit', v_collection_jobs_limit,
      'officialCollectRunsLimit', v_official_collect_runs_limit,
      'apiCollectRunsLimit', v_api_collect_runs_limit
    )
  );
end;
$$;

revoke execute on function prune_priceai_operational_logs(
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function prune_priceai_operational_logs(
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;
create table if not exists api_transit_stations (
  id text primary key,
  slug text not null unique,
  name text not null,
  website_url text not null,
  logo_url text,
  api_base_url text,
  pricing_url text,
  monitor_url text,
  status text not null default 'unknown' check (status in ('active', 'limited', 'unavailable', 'unknown')),
  source_type text not null default 'manual_collected' check (source_type in ('manual_collected', 'user_submitted', 'merchant_submitted')),
  commercial_relation text not null default 'unknown' check (commercial_relation in ('none', 'listed', 'partner', 'affiliate', 'sponsored', 'unknown')),
  station_system text check (station_system in ('new_api', 'sub_to_api', 'custom', 'unknown')),
  operator_type text not null default 'individual' check (operator_type in ('company', 'individual', 'unknown')),
  invoice_support text not null default 'unknown' check (invoice_support in ('supported', 'unsupported', 'unknown')),
  summary text not null default '',
  channel_types text[] not null default '{}'::text[],
  account_pools text[] not null default '{}'::text[],
  payment_methods text[] not null default '{}'::text[],
  minimum_top_up text,
  balance_expiry text,
  support_channels text[] not null default '{}'::text[],
  refund_policy text,
  risk_labels text[] not null default '{}'::text[],
  usage_advice text not null default 'pending' check (usage_advice in ('try_small', 'cautious', 'not_recommended', 'pending')),
  data_status text not null default 'pending_review' check (data_status in ('sample', 'pending_review', 'verified')),
  availability_seven_day_rate numeric,
  availability_seven_day_samples integer not null default 0,
  availability_first_checked_at timestamptz,
  availability_last_checked_at timestamptz,
  availability_latest_latency_ms integer,
  availability_avg_latency_7d_ms integer,
  availability_note text,
  feedback_pending_count integer not null default 0,
  feedback_verified_risk_count integer not null default 0,
  feedback_merchant_responded_count integer not null default 0,
  feedback_main_themes text[] not null default '{}'::text[],
  feedback_public_notes text,
  strengths text[] not null default '{}'::text[],
  cautions text[] not null default '{}'::text[],
  commercial_offers jsonb not null default '[]'::jsonb,
  verification_events jsonb not null default '[]'::jsonb,
  collector_kind text not null default 'manual_review',
  pricing_endpoint_url text,
  collection_status text not null default 'pending' check (collection_status in ('pending', 'success', 'partial', 'failed', 'manual_review')),
  collection_error text,
  last_collected_at timestamptz,
  last_updated_at timestamptz not null default now(),
  published boolean not null default false,
  removed_at timestamptz,
  removed_reason text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_transit_offers (
  id text primary key,
  station_id text not null references api_transit_stations(id) on delete cascade,
  family text not null check (family in ('gpt', 'claude', 'gemini', 'glm', 'deepseek', 'image', 'video')),
  standard_model text not null,
  raw_model_name text not null,
  group_name text not null,
  recharge_ratio text,
  model_multiplier numeric,
  input_price numeric,
  output_price numeric,
  cache_read_price numeric,
  cache_write_price numeric,
  cache_hit_rate numeric,
  cache_hit_sample_tokens bigint not null default 0,
  image_output_price numeric,
  currency text not null default 'CNY',
  account_pool text not null default 'undisclosed',
  channel_type text not null default 'undisclosed',
  price_source text not null default '公开价格页',
  source_url text,
  availability_seven_day_rate numeric,
  availability_seven_day_samples integer not null default 0,
  availability_first_checked_at timestamptz,
  availability_last_checked_at timestamptz,
  availability_latest_latency_ms integer,
  availability_avg_latency_7d_ms integer,
  availability_note text,
  last_verified_at timestamptz,
  status text not null default 'needs_review' check (status in ('active', 'needs_review', 'inactive')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, standard_model, group_name)
);

create table if not exists api_transit_submissions (
  id text primary key,
  submission_type text not null default 'user' check (submission_type in ('user', 'merchant')),
  submitted_url text not null,
  submitted_name text,
  api_base_url text,
  pricing_url text,
  contact text,
  notes text,
  submitted_models text[] not null default '{}'::text[],
  submitted_meta jsonb not null default '{}'::jsonb,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  probe_status text not null default 'pending' check (probe_status in ('pending', 'public_pricing_found', 'needs_login', 'failed')),
  review_status text not null default 'pending' check (review_status in ('pending', 'collector_todo', 'approved', 'rejected')),
  station_id text references api_transit_stations(id) on delete set null,
  normalized_url text,
  normalized_host text,
  duplicate_of text references api_transit_submissions(id) on delete set null,
  duplicate_count integer not null default 0,
  admin_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_transit_credentials (
  id text primary key,
  submission_id text not null references api_transit_submissions(id) on delete cascade,
  station_id text references api_transit_stations(id) on delete set null,
  credential_type text not null check (credential_type in ('test_key', 'test_account')),
  status text not null default 'submitted' check (status in ('submitted', 'ready', 'failed', 'revoked', 'deleted')),
  encrypted_payload jsonb not null,
  credential_meta jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  failure_message text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, credential_type)
);

create table if not exists api_transit_detection_runs (
  id text primary key,
  station_id text references api_transit_stations(id) on delete cascade,
  run_type text not null default 'public_pricing' check (run_type in ('public_pricing', 'model_list', 'api_probe', 'manual_review')),
  status text not null check (status in ('success', 'partial', 'failed')),
  model_count integer not null default 0,
  offer_count integer not null default 0,
  error_message text,
  source_url text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  raw_snapshot jsonb not null default '{}'::jsonb,
  logs jsonb not null default '{}'::jsonb
);

create table if not exists api_transit_availability_samples (
  id text primary key,
  run_id text not null references api_transit_detection_runs(id) on delete cascade,
  station_id text not null references api_transit_stations(id) on delete cascade,
  scope text not null check (scope in ('station', 'offer')),
  standard_model text,
  group_name text,
  ok boolean not null,
  latency_ms integer,
  ping_latency_ms integer,
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists api_transit_feedback (
  id text primary key,
  station_id text references api_transit_stations(id) on delete set null,
  station_name text,
  station_url text,
  feedback_type text not null default 'general' check (feedback_type in ('general', 'price_change', 'unavailable', 'risk', 'merchant_response')),
  message text not null,
  evidence_urls jsonb not null default '[]'::jsonb,
  contact text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'rejected')),
  reviewer_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists api_transit_stations_published_idx on api_transit_stations(published, updated_at desc);
create index if not exists api_transit_stations_removed_at_idx on api_transit_stations(removed_at, published, updated_at desc);
create index if not exists api_transit_stations_status_idx on api_transit_stations(status);
create index if not exists api_transit_stations_collector_kind_idx on api_transit_stations(collector_kind);
create index if not exists api_transit_offers_station_id_idx on api_transit_offers(station_id);
create index if not exists api_transit_offers_family_idx on api_transit_offers(family);
create index if not exists api_transit_offers_status_idx on api_transit_offers(status);
create index if not exists api_transit_submissions_review_status_idx on api_transit_submissions(review_status, created_at desc);
create index if not exists api_transit_submissions_submitted_url_idx on api_transit_submissions(submitted_url);
create index if not exists api_transit_submissions_normalized_host_idx on api_transit_submissions(normalized_host, review_status, created_at desc);
create index if not exists api_transit_submissions_normalized_url_idx on api_transit_submissions(normalized_url, review_status, created_at desc);
create index if not exists api_transit_submissions_duplicate_of_idx on api_transit_submissions(duplicate_of);
create index if not exists api_transit_stations_commercial_offers_idx on api_transit_stations using gin (commercial_offers);
create index if not exists api_transit_stations_verification_events_idx on api_transit_stations using gin (verification_events);
create index if not exists api_transit_credentials_submission_id_idx on api_transit_credentials(submission_id);
create index if not exists api_transit_credentials_status_idx on api_transit_credentials(status, created_at desc);
create index if not exists api_transit_detection_runs_started_at_idx on api_transit_detection_runs(started_at desc);
create index if not exists api_transit_detection_runs_station_id_idx on api_transit_detection_runs(station_id);
create index if not exists api_transit_availability_samples_station_time_idx on api_transit_availability_samples(station_id, checked_at desc);
create index if not exists api_transit_availability_samples_offer_time_idx on api_transit_availability_samples(station_id, scope, standard_model, group_name, checked_at desc);
create index if not exists api_transit_feedback_status_idx on api_transit_feedback(status, created_at desc);

drop trigger if exists api_transit_stations_set_updated_at on api_transit_stations;
create trigger api_transit_stations_set_updated_at
before update on api_transit_stations
for each row execute function set_updated_at();

drop trigger if exists api_transit_offers_set_updated_at on api_transit_offers;
create trigger api_transit_offers_set_updated_at
before update on api_transit_offers
for each row execute function set_updated_at();

drop trigger if exists api_transit_submissions_set_updated_at on api_transit_submissions;
create trigger api_transit_submissions_set_updated_at
before update on api_transit_submissions
for each row execute function set_updated_at();

drop trigger if exists api_transit_credentials_set_updated_at on api_transit_credentials;
create trigger api_transit_credentials_set_updated_at
before update on api_transit_credentials
for each row execute function set_updated_at();

alter table api_transit_stations enable row level security;
alter table api_transit_offers enable row level security;
alter table api_transit_submissions enable row level security;
alter table api_transit_credentials enable row level security;
alter table api_transit_detection_runs enable row level security;
alter table api_transit_availability_samples enable row level security;
alter table api_transit_feedback enable row level security;
