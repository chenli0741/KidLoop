import { stageCompanyMail } from "@/lib/company-mail/service";
import { applicationOrigin } from "@/lib/company-mail/config";
export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const state = parameters.get("state") ?? "";
  try {
    const result = await stageCompanyMail(state, parameters.get("code"), parameters.has("error"));
    const destination = new URL(result.native ? "kidloop-mail://complete" : `${applicationOrigin()}/organizations/mail/complete`);
    destination.searchParams.set("state", state);
    if (!result.ok) destination.searchParams.set("failed", "1");
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: destination.toString() } });
  } catch {
    return new Response("This connection request has expired or is unavailable. Close this window and connect Gmail again from company settings. / 连接请求已失效，请关闭窗口，在公司设置重新连接 Gmail。", {
      status: 400, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
