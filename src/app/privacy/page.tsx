import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "隐私说明",
  description: "PriceAI 登录、反馈、模型检测、分析工具、数据保留与用户权利说明。",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f9f9]">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8">
        <p className="text-sm font-semibold text-[#5a6061]">PriceAI</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#202829]">隐私说明</h1>
        <p className="mt-3 text-sm leading-7 text-[#5a6061]">更新时间：2026-07-16。本页说明 PriceAI 在公开浏览、Google 登录、反馈、模型检测和账户功能中处理哪些数据，以及用户如何导出或申请删除。</p>

        <PrivacySection title="公开浏览与分析">
          搜索、比价、查看详情和阅读指南不要求登录。站点由 Cloudflare Workers / OpenNext 提供服务，并使用 Umami、Google Analytics 和 Cloudflare 的基础流量与安全能力观察页面访问、性能和异常。分析事件不应包含 API Key、反馈证据原文或 OAuth token。
        </PrivacySection>
        <PrivacySection title="Google 登录与 Session">
          登录由 Supabase Auth 和 Google OAuth 提供。PriceAI 保存用户 ID、邮箱、展示名、头像、登录提供方和最近登录时间，用于账户入口、反馈归属、检测配额和报告权限。认证 Cookie 设置为 HttpOnly、SameSite=Lax，并在生产环境使用 Secure；公共页面不会因为登录而强制变为私密页面。
        </PrivacySection>
        <PrivacySection title="反馈与证据">
          低风险文字纠错可匿名提交；商家质量、高风险报价和图片证据要求登录。反馈可能包含用户主动填写的联系方式、说明和证据链接。未绑定正式反馈的图片草稿计划在 24 小时后清理；已绑定证据按争议处理和审核需要保留，撤销公开展示不等于立即删除全部审核记录。
        </PrivacySection>
        <PrivacySection title="模型检测与报告">
          检测任务保存账号归属、目标接口地址、模型、协议、强度、状态和任务时间。API Key 仅用于发起检测，不应写入 PriceAI 数据库、浏览器持久存储、分析事件或公开分享。报告默认私密；只有所有者主动生成独立分享链接后才提供脱敏公开视图，分享可以撤销。
        </PrivacySection>
        <PrivacySection title="保留、导出与删除">
          账户设置提供 JSON 数据副本。账号删除采用至少 7 天冷静期：用户可在处理前取消。冷静期到期后，系统会删除 Auth、账户资料、检测任务、报告分享和 R2 图片证据；反馈会撤销公开展示、清除联系方式和用户补充内容，只保留不再关联账号的最小审核事实。处理失败会以退避方式重试并进入运营告警，不会在点击按钮后立即物理删库。
        </PrivacySection>
        <PrivacySection title="服务商与跨区域传输">
          PriceAI 使用 Cloudflare、Supabase、Google OAuth、Umami，以及在用户主动使用模型检测时涉及的检测服务。不同服务可能在不同区域处理网络请求。请不要在反馈或检测参数中提交与任务无关的个人敏感信息。
        </PrivacySection>

        <div className="mt-8 rounded-lg bg-white p-5 ring-1 ring-[#adb3b4]/15">
          <h2 className="text-lg font-semibold text-[#202829]">管理你的数据</h2>
          <p className="mt-2 text-sm leading-6 text-[#5a6061]">已登录用户可在账户设置中导出数据、退出设备或提交删除申请；未登录用户仍可继续使用全部公开浏览功能。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/account/settings" className="inline-flex h-10 items-center rounded-lg bg-[#202829] px-4 text-sm font-semibold text-white">账户与隐私设置</Link>
            <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435]">返回首页</Link>
          </div>
        </div>
      </article>
    </main>
  );
}

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-[#202829]">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[#4d5657]">{children}</p>
    </section>
  );
}
