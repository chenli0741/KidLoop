import { ParentRequests } from "@/components/parent-requests";
import { requireUser } from "@/lib/auth";
import { FormPanel } from "@/components/form-panel";
import { CalendarDays, CircleGauge, Clock3, Route } from "lucide-react";
import { createShift } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TripCard } from "@/components/trip-card";
import { TripPlannerForm } from "@/components/trip-planner-form";
import { formatDate, formatTime, todayInOperationsTimeZone } from "@/lib/date";
import { getDrivers, getPrograms, getSchools, getShifts, getStudents, getTrips, getVehicles } from "@/lib/data";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayInOperationsTimeZone();
  const [drivers, vehicles, schools, programs, students, allShifts, trips] = await Promise.all([
    getDrivers(), getVehicles(), getSchools(), getPrograms(), getStudents(), getShifts(date), getTrips(date),
  ]);
  const shifts = allShifts.filter((shift) => shift.shiftDate === date && shift.status !== "CANCELED");
  const readyForTrip = shifts.length > 0 && schools.length > 0 && programs.length > 0 && students.length > 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={text(locale, "调度", "Dispatch")}
        title={text(locale, "排班", "Schedule")}
        description={text(locale, "为司机分配车辆，再将合适的学生安排到每条路线。", "Pair drivers with vehicles, then assign the right students to each route.")}
        actions={<form className="date-picker" method="get"><CalendarDays size={17} /><input type="date" name="date" defaultValue={date} aria-label={text(locale, "排班日期", "Schedule date")} /><button className="button secondary" type="submit">{text(locale, "查看", "View")}</button></form>}
      />

      <section className="day-banner"><div><span>{formatDate(date, locale)}</span><strong>{shifts.length} {text(locale, "个班次", "shifts")} · {trips.length} {text(locale, "个行程", "trips")}</strong></div><CalendarDays size={22} /></section>

      <div className="planner-grid">
        <FormPanel heading={<div className="panel-heading"><CircleGauge size={19} /><div><h2>{text(locale, "安排司机", "Schedule driver")}</h2><p>{text(locale, "分配车辆和工作时段", "Assign a vehicle and work window")}</p></div></div>}>
          {drivers.length && vehicles.length ? (
            <ActionForm action={createShift} submitLabel={text(locale, "创建排班", "Schedule shift")}>
              <input type="hidden" name="shiftDate" value={date} />
              <label className="full"><span>{text(locale, "司机", "Driver")}</span><select name="driverId" defaultValue="" required><option value="" disabled>{text(locale, "选择司机", "Select driver")}</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
              <label className="full"><span>{text(locale, "车辆", "Vehicle")}</span><select name="vehicleId" defaultValue="" required><option value="" disabled>{text(locale, "选择车辆", "Select vehicle")}</option>{vehicles.filter((vehicle) => vehicle.status === "AVAILABLE").map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {vehicle.plate} · {vehicle.capacity} {text(locale, "座", "seats")}</option>)}</select></label>
              <label><span>{text(locale, "开始时间", "Start time")}</span><input name="startTime" type="time" required /></label>
              <label><span>{text(locale, "结束时间", "End time")}</span><input name="endTime" type="time" required /></label>
            </ActionForm>
          ) : <p className="setup-callout">{text(locale, "请先在车队页面添加至少一名可用司机和一辆车辆。", "Add at least one available driver and vehicle on the Fleet page.")}</p>}
        </FormPanel>

        <FormPanel className="wide" heading={<div className="panel-heading"><Route size={19} /><div><h2>{text(locale, "创建行程", "Build trip")}</h2><p>{text(locale, "发布接送学生清单", "Publish a pickup manifest")}</p></div></div>}>
          {readyForTrip ? <TripPlannerForm date={date} shifts={shifts} schools={schools} programs={programs} students={students} /> : (
            <p className="setup-callout">{text(locale, "发布行程前需要先准备排班、学校、课外班和符合条件的学生。", "A shift, school, program, and eligible student are required to publish a trip.")}</p>
          )}
        </FormPanel>
      </div>

      <ParentRequests date={date} locale={locale} />
      <section className="content-section">
        <div className="section-heading"><div><span className="eyebrow">{text(locale, "已发布路线", "Published routes")}</span><h2>{formatDate(date, locale)}</h2></div><span className="section-count">{trips.length} {text(locale, "个行程", "trips")}</span></div>
        {trips.length ? <div className="trip-list">{trips.map((trip) => <TripCard key={trip.id} trip={trip} locale={locale} />)}</div> : (
          <EmptyState title={text(locale, "该日期暂无行程", "No trips on this date")} body={text(locale, "安排司机并发布第一条学生接送路线。", "Schedule a driver and publish the first student route.")} />
        )}
      </section>

      {shifts.length ? <section className="content-section compact-section"><div className="section-heading"><div><span className="eyebrow">{text(locale, "运力", "Coverage")}</span><h2>{text(locale, "可用班次", "Available shifts")}</h2></div></div><div className="shift-chips">{shifts.map((shift) => <span key={shift.id}><Clock3 size={14} /> {formatTime(shift.startTime, locale)}–{formatTime(shift.endTime, locale)} · {shift.driverName} · {shift.vehicleName}</span>)}</div></section> : null}
    </div>
  );
}
