import { requireUser } from "@/lib/auth";
import { FormPanel } from "@/components/form-panel";
import { DriverRecordActions, VehicleRecordActions } from "@/components/fleet-record-actions";
import { BusFront, CircleGauge, Clock3, Phone } from "lucide-react";
import { createDriver, createVehicle } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatTime, todayInOperationsTimeZone } from "@/lib/date";
import { getDrivers, getShifts, getVehicles } from "@/lib/data";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const [vehicles, drivers, shifts] = await Promise.all([
    getVehicles(), getDrivers(), getShifts(todayInOperationsTimeZone()),
  ]);

  return (
    <div className="page-container">
      <PageHeader eyebrow={text(locale, "资源", "Resources")} title={text(locale, "车队与司机", "Fleet & drivers")} description={text(locale, "维护车辆可用状态，并为每位司机安排清晰的工作班次。", "Keep vehicles ready and assign each driver to a clear shift.")} />

      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">{text(locale, "车辆", "Vehicles")}</span><h2>{text(locale, `车队共 ${vehicles.length} 辆`, `${vehicles.length} in fleet`)}</h2></div></div>
          {vehicles.length ? (
            <div className="record-grid">
              {vehicles.map((vehicle) => (
                <article className="record-card" key={vehicle.id}>
                  <div className="record-icon"><BusFront size={21} /></div>
                  <div className="record-main"><strong>{vehicle.name}</strong><span>{vehicle.plate} · {vehicle.capacity} {text(locale, "个座位", "seats")}</span></div>
                  <StatusBadge status={vehicle.status} />
                  <VehicleRecordActions vehicle={vehicle} locale={locale} />
                </article>
              ))}
            </div>
          ) : <EmptyState title={text(locale, "暂无车辆", "No vehicles yet")} body={text(locale, "使用表单添加第一辆车。", "Add the first vehicle using the form.")} />}
        </section>

        <FormPanel heading={<div className="panel-heading"><BusFront size={19} /><div><h2>{text(locale, "添加车辆", "Add vehicle")}</h2><p>{text(locale, "车辆与座位数", "Vehicle and seat capacity")}</p></div></div>}>
          <ActionForm action={createVehicle} submitLabel={text(locale, "添加车辆", "Add vehicle")}>
            <label><span>{text(locale, "车辆名称", "Vehicle name")}</span><input name="name" placeholder={text(locale, "校车 01", "Van 01")} required /></label>
            <label><span>{text(locale, "车牌号", "License plate")}</span><input name="plate" placeholder="8ABC123" required /></label>
            <label><span>{text(locale, "座位数", "Seat capacity")}</span><input name="capacity" type="number" min="1" max="100" placeholder="8" required /></label>
          </ActionForm>
        </FormPanel>
      </div>

      <div className="split-layout">
        <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">{text(locale, "司机", "Drivers")}</span><h2>{drivers.length} {text(locale, "名司机", "drivers")}</h2></div></div>
          {drivers.length ? (
            <div className="record-grid">
              {drivers.map((driver) => (
                <article className="record-card" key={driver.id}>
                  <div className="record-icon teal"><CircleGauge size={21} /></div>
                  <div className="record-main"><strong>{driver.name}</strong><span><Phone size={13} /> {driver.phone}</span></div>
                  <StatusBadge status={driver.status} />
                  <DriverRecordActions driver={driver} locale={locale} />
                </article>
              ))}
            </div>
          ) : <EmptyState title={text(locale, "暂无司机", "No drivers yet")} body={text(locale, "添加司机后即可开始排班。", "Add a driver to start scheduling shifts.")} />}
        </section>

        <FormPanel heading={<div className="panel-heading"><CircleGauge size={19} /><div><h2>{text(locale, "添加司机", "Add driver")}</h2><p>{text(locale, "基本联系方式", "Basic contact details")}</p></div></div>}>
          <ActionForm action={createDriver} submitLabel={text(locale, "添加司机", "Add driver")}>
            <label><span>{text(locale, "司机姓名", "Driver name")}</span><input name="name" placeholder={text(locale, "姓名", "Full name")} required /></label>
            <label><span>{text(locale, "电话", "Phone")}</span><input name="phone" type="tel" placeholder="(555) 123-4567" required /></label>
          </ActionForm>
        </FormPanel>
      </div>

      <section className="content-section">
        <div className="section-heading"><div><span className="eyebrow">{text(locale, "即将开始", "Upcoming")}</span><h2>{text(locale, "司机排班", "Driver shifts")}</h2></div></div>
        {shifts.length ? (
          <div className="table-wrap"><table><thead><tr><th>{text(locale, "日期", "Date")}</th><th>{text(locale, "司机", "Driver")}</th><th>{text(locale, "车辆", "Vehicle")}</th><th>{text(locale, "时间", "Hours")}</th><th>{text(locale, "状态", "Status")}</th></tr></thead>
            <tbody>{shifts.map((shift) => <tr key={shift.id}><td>{formatDate(shift.shiftDate, locale)}</td><td>{shift.driverName}</td><td>{shift.vehicleName} · {shift.vehiclePlate}</td><td><span className="inline-icon"><Clock3 size={14} /> {formatTime(shift.startTime, locale)}–{formatTime(shift.endTime, locale)}</span></td><td><StatusBadge status={shift.status} /></td></tr>)}</tbody>
          </table></div>
        ) : <EmptyState title={text(locale, "暂无后续排班", "No upcoming shifts")} body={text(locale, "请在排班页面创建司机班次。", "Create a shift from the Schedule page.")} />}
      </section>
    </div>
  );
}
