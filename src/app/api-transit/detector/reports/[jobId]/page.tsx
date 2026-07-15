import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import { getCurrentUser } from "@/lib/auth";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  fetchDetectorReport,
  getDetectorServiceUrl,
  toDetectorReportView,
} from "@/lib/transit-detector-report";
import { DetectorReportShell } from "@/components/DetectorReportShell";
import { TransitDetectorReport, TransitDetectorReportUnavailable } from "@/components/TransitDetectorReport";

interface DetectorReportPageProps {
  params: Promise<{ jobId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: DetectorReportPageProps): Promise<Metadata> {
  const { jobId } = await params;

  return {
    title: `API 中转检测报告 #${jobId}`,
    description: "PriceAI API 中转模型检测报告，展示协议、能力、计费和性能证据链。",
    alternates: { canonical: `/api-transit/detector/reports/${jobId}` },
    robots: { index: false, follow: false },
    openGraph: {
      title: `API 中转检测报告 #${jobId} | PriceAI`,
      description: "查看 PriceAI API 中转模型检测报告的结论、检测项和性能指标。",
    },
  };
}

export default async function ApiTransitDetectorReportPage({ params }: DetectorReportPageProps) {
  const { jobId } = await params;
  const familyOptions = getTransitModelFamilyOptions();
  const serviceUrl = getDetectorServiceUrl();

  if (!serviceUrl) {
    return (
      <DetectorReportShell familyOptions={familyOptions}>
        <TransitDetectorReportUnavailable
          title="检测服务未配置"
          message="当前 PriceAI 前端没有配置检测服务地址，暂时无法读取这份报告。请先配置检测服务地址，再重新打开报告。"
        />
      </DetectorReportShell>
    );
  }

  const access = await resolveDetectorReportAccess(jobId);
  if (access.error) {
    return (
      <DetectorReportShell familyOptions={familyOptions}>
        <TransitDetectorReportUnavailable
          title="报告为私密"
          message={access.error}
        />
      </DetectorReportShell>
    );
  }

  const reportResult = await loadDetectorReport(access.detectorJobId, serviceUrl);
  if (reportResult.error) {
    return (
      <DetectorReportShell familyOptions={familyOptions}>
        <TransitDetectorReportUnavailable
          title="报告暂时不可用"
          message={reportResult.error}
        />
      </DetectorReportShell>
    );
  }

  const report = toDetectorReportView(access.localJobId, reportResult.rawReport);
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: `API 中转检测报告 #${access.localJobId}`,
    dateCreated: reportResult.rawReport.timestamp,
    about: {
      "@type": "Thing",
      name: report.model,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "PriceAI",
      url: "https://priceai.cc",
    },
  };

  return (
    <DetectorReportShell familyOptions={familyOptions} jsonLdData={jsonLdData}>
      <TransitDetectorReport report={report} />
    </DetectorReportShell>
  );
}

async function resolveDetectorReportAccess(jobId: string): Promise<
  | { localJobId: string; detectorJobId: string; error: "" }
  | { localJobId: ""; detectorJobId: ""; error: string }
> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { localJobId: "", detectorJobId: "", error: "登录检测报告需要读取任务归属，但 Supabase 尚未配置。" };
  }

  const [user, adminSession] = await Promise.all([
    getCurrentUser().catch(() => null),
    hasAdminSession(),
  ]);
  if (!user && !adminSession) {
    return {
      localJobId: "",
      detectorJobId: "",
      error: "检测报告默认只允许提交者和后台查看。请先登录，再从账户中心打开自己的检测报告。",
    };
  }

  let directQuery = supabase
    .from("transit_detector_jobs")
    .select("id,user_id,status,detector_job_id")
    .eq("id", jobId);
  if (user && !adminSession) {
    directQuery = directQuery.eq("user_id", user.id);
  }

  const { data: directRow, error: directError } = await directQuery.maybeSingle();
  if (directError) {
    return { localJobId: "", detectorJobId: "", error: "读取检测任务归属失败，请稍后再试。" };
  }

  let row = directRow as Record<string, unknown> | null;
  if (!row) {
    let legacyQuery = supabase
      .from("transit_detector_jobs")
      .select("id,user_id,status,detector_job_id")
      .eq("detector_job_id", jobId)
      .limit(1);
    if (user && !adminSession) {
      legacyQuery = legacyQuery.eq("user_id", user.id);
    }
    const { data: legacyRows, error: legacyError } = await legacyQuery;
    if (legacyError) {
      return { localJobId: "", detectorJobId: "", error: "读取检测任务归属失败，请稍后再试。" };
    }
    row = (legacyRows?.[0] as Record<string, unknown> | undefined) || null;
  }

  if (!row) {
    return {
      localJobId: "",
      detectorJobId: "",
      error: "没有找到这份检测报告，或它不属于当前账号。",
    };
  }

  const ownerId = typeof row.user_id === "string" ? row.user_id : "";
  if (!adminSession && (!user || user.id !== ownerId)) {
    return {
      localJobId: "",
      detectorJobId: "",
      error: "没有找到这份检测报告，或它不属于当前账号。",
    };
  }

  const detectorJobId = typeof row.detector_job_id === "string" ? row.detector_job_id : "";
  if (!detectorJobId || row.status !== "done") {
    return {
      localJobId: "",
      detectorJobId: "",
      error: "这份检测任务还没有生成可查看报告。",
    };
  }

  return {
    localJobId: String(row.id || jobId),
    detectorJobId,
    error: "",
  };
}

async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

async function loadDetectorReport(jobId: string, serviceUrl: string) {
  try {
    const rawReport = await fetchDetectorReport(jobId, serviceUrl);
    return { rawReport, error: "" };
  } catch (error) {
    return {
      rawReport: {},
      error: error instanceof Error ? error.message : "检测报告读取失败，请稍后再试。",
    };
  }
}
