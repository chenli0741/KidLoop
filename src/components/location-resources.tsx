import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { FormPanel } from "@/components/form-panel";
import { MapPin, School } from "lucide-react";
import { LocationMap } from "@/components/location-map";
import { createProgram, createSchool } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";

import { getPrograms, getSchools } from "@/lib/data";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function LocationResources({ section }: { section: "schools" | "programs" }) {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const [schools, programs] = await Promise.all([getSchools(), getPrograms()]);

  return (
    <>
      {section === "schools" && (<div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">{text(locale, "接学生", "Pickup")}</span><h2>{text(locale, "学校", "Schools")}</h2></div><span className="section-count">{schools.length}</span></div>
          {schools.length ? <div className="location-list">{schools.map((school) => (
            <article className="location-card" key={school.id}>
              <div className="location-title"><span className="record-icon"><School size={20} /></span><div><h3>{school.name}</h3><p><MapPin size={14} /> {school.address}</p></div></div>
              <div className="location-details"><Link href={`/schedule?school=${school.id}`}>{text(locale, "学校日历与接送规则", "School calendar & pickup rules")} →</Link><p>{school.pickupInstructions}</p><div className="route-links"><LocationMap name={school.name} address={school.address} /><LocationMap name={school.name} url={school.pickupMapUrl} /></div></div>
            </article>
          ))}</div> : <EmptyState title={text(locale, "暂无学校", "No schools")} body={text(locale, "添加第一个接学生地点。", "Add the first pickup location.")} />}
        </section>
        <FormPanel heading={<div className="panel-heading"><School size={19} /><div><h2>{text(locale, "添加学校", "Add school")}</h2><p>{text(locale, "司机接学生信息", "Driver pickup details")}</p></div></div>}>
          <ActionForm action={createSchool} submitLabel={text(locale, "添加学校", "Add school")}>
            <label><span>{text(locale, "学校名称", "School name")}</span><input name="name" required /></label>
            <label><span>{text(locale, "地址", "Address")}</span><input name="address" required /></label>
            <label><span>{text(locale, "接送示意图 URL（选填）", "Pickup diagram URL (optional)")}</span><input name="pickupMapUrl" type="url" pattern="https://.*" placeholder="https://..." /></label>
            <label className="full"><span>{text(locale, "接送要求", "Pickup requirements")}</span><textarea name="pickupInstructions" rows={3} required /></label>
          </ActionForm>
        </FormPanel>
      </div>)}

      {section === "programs" && (<div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">{text(locale, "送达", "Dropoff")}</span><h2>{text(locale, "培训学校", "After-school programs")}</h2></div><span className="section-count">{programs.length}</span></div>
          {programs.length ? <div className="location-list">{programs.map((program) => (
            <article className="location-card" key={program.id}>
              <div className="location-title"><span className="record-icon coral"><MapPin size={20} /></span><div><h3>{program.name}</h3><p><MapPin size={14} /> {program.address}</p></div></div>
              <div className="location-details"><strong>{text(locale, "送达", "Dropoff")}</strong><p>{program.dropoffInfo}</p><small>{program.requirements}</small></div>
            </article>
          ))}</div> : <EmptyState title={text(locale, "暂无培训学校", "No programs")} body={text(locale, "添加第一个送达地点。", "Add the first dropoff location.")} />}
        </section>
        <FormPanel heading={<div className="panel-heading"><MapPin size={19} /><div><h2>{text(locale, "添加培训学校", "Add program")}</h2><p>{text(locale, "司机送达信息", "Driver dropoff details")}</p></div></div>}>
          <ActionForm action={createProgram} submitLabel={text(locale, "添加培训学校", "Add program")}>
            <label><span>{text(locale, "培训学校名称", "Program name")}</span><input name="name" required /></label>
            <label><span>{text(locale, "地址", "Address")}</span><input name="address" required /></label>
            <label className="full"><span>{text(locale, "送达信息", "Dropoff information")}</span><textarea name="dropoffInfo" rows={3} required /></label>
            <label className="full"><span>{text(locale, "培训学校要求", "Program requirements")}</span><textarea name="requirements" rows={3} required /></label>
          </ActionForm>
        </FormPanel>
      </div>)}
    </>
  );
}
