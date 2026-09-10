import Link from "next/link";
import { BusFront, School, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { FleetResources } from "@/components/fleet-resources";
import { LocationResources } from "@/components/location-resources";
import { TravelTimeResources } from "@/components/travel-time-resources";
import { StudentStatusReasonResources } from "@/components/student-status-reason-resources";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const { tab: value } = await searchParams;
  const tab = value === "schools" || value === "programs" || value === "travel" || value === "reasons" ? value : "fleet";
  const tabs = [{ id: "fleet", label: text(locale, "车队", "Fleet"), icon: BusFront }, { id: "schools", label: text(locale, "学校", "Schools"), icon: School }, { id: "programs", label: text(locale, "培训学校", "Programs"), icon: MapPin }, { id: "travel", label: text(locale, "地点时间", "Travel times"), icon: MapPin }, { id: "reasons", label: text(locale, "接送原因", "Reasons"), icon: MapPin }];
  return <div className="page-container"><PageHeader eyebrow={text(locale, "基础资料", "Resources")} title={text(locale, "车队与学校", "Fleet & schools")} description={text(locale, "统一维护车辆、司机、学校和培训学校的接送资料。", "Manage vehicles, drivers, schools, and after-school pickup and dropoff details.")} />
    <nav className="resource-tabs" aria-label={text(locale, "资料分类", "Resource categories")}>{tabs.map(({ id, label, icon: Icon }) => <Link key={id} href={`/resources?tab=${id}`} aria-current={tab === id ? "page" : undefined}><Icon size={18} />{label}</Link>)}</nav>
    {tab === "fleet" ? <FleetResources /> : tab === "travel" ? <TravelTimeResources /> : tab === "reasons" ? <StudentStatusReasonResources /> : <LocationResources section={tab} />}
  </div>;
}
