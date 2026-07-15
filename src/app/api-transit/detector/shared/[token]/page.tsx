import type { Metadata } from "next";
import { DetectorReportShell } from "@/components/DetectorReportShell";
import { TransitDetectorReport, TransitDetectorReportUnavailable } from "@/components/TransitDetectorReport";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import {
  hashDetectorReportShareToken,
  isValidDetectorReportShareToken,
} from "@/lib/detector-report-share";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  fetchDetectorReport,
  getDetectorServiceUrl,
  toPublicDetectorReportView,
} from "@/lib/transit-detector-report";

export const metadata: Metadata = {
  title: "已分享的检测报告",
  description: "由报告所有者主动分享的 PriceAI API 中转模型检测报告。",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SharedDetectorReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const familyOptions = getTransitModelFamilyOptions();
  const { token } = await params;
  const access = await resolveSharedReport(token);

  if (access.error) {
    return (
      <DetectorReportShell familyOptions={familyOptions}>
        <TransitDetectorReportUnavailable title="分享不可用" message={access.error} />
      </DetectorReportShell>
    );
  }

  const report = await loadSharedReport(access.detectorJobId, access.serviceUrl);
  if (!report) {
    return (
      <DetectorReportShell familyOptions={familyOptions}>
        <TransitDetectorReportUnavailable title="报告暂时不可用" message="检测服务暂时无法读取这份分享报告，请稍后再试。" />
      </DetectorReportShell>
    );
  }

  return (
    <DetectorReportShell familyOptions={familyOptions}>
      <div className="mb-4 rounded-lg border border-[#cfe5d8] bg-[#edf8f1] px-4 py-3 text-sm leading-6 text-[#2f6f49]">
        这是报告所有者主动创建的脱敏分享。接口地址、Key、内部错误和原始证据字段不会公开；所有者可随时撤销链接。
      </div>
      <TransitDetectorReport report={report} />
    </DetectorReportShell>
  );
}

async function loadSharedReport(detectorJobId: string, serviceUrl: string) {
  try {
    const rawReport = await fetchDetectorReport(detectorJobId, serviceUrl);
    return toPublicDetectorReportView("公开分享", rawReport);
  } catch {
    return null;
  }
}

async function resolveSharedReport(token: string): Promise<
  | { detectorJobId: string; serviceUrl: string; error: "" }
  | { detectorJobId: ""; serviceUrl: ""; error: string }
> {
  if (!isValidDetectorReportShareToken(token)) {
    return { detectorJobId: "", serviceUrl: "", error: "分享链接格式不正确或已经失效。" };
  }
  const serviceUrl = getDetectorServiceUrl();
  const supabase = getSupabaseServerClient();
  if (!serviceUrl || !supabase) {
    return { detectorJobId: "", serviceUrl: "", error: "报告分享服务暂时不可用。" };
  }

  const { data: share, error: shareError } = await supabase
    .from("transit_detector_report_shares")
    .select("job_id,expires_at")
    .eq("token_hash", hashDetectorReportShareToken(token))
    .eq("status", "active")
    .maybeSingle();
  if (shareError || !share) {
    return { detectorJobId: "", serviceUrl: "", error: "分享链接不存在、已撤销或已经失效。" };
  }
  if (share.expires_at && Date.parse(String(share.expires_at)) <= Date.now()) {
    return { detectorJobId: "", serviceUrl: "", error: "分享链接已经过期。" };
  }

  const { data: job, error: jobError } = await supabase
    .from("transit_detector_jobs")
    .select("detector_job_id,status")
    .eq("id", share.job_id)
    .eq("status", "done")
    .maybeSingle();
  if (jobError || !job?.detector_job_id) {
    return { detectorJobId: "", serviceUrl: "", error: "这份报告不存在或尚未完成。" };
  }

  return { detectorJobId: String(job.detector_job_id), serviceUrl, error: "" };
}
