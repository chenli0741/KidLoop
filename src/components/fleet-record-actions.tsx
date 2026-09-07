import { RecordActions } from "@/components/record-actions";
import { deleteDriver, deleteVehicle, updateDriver, updateVehicle } from "@/app/fleet/actions";
import { text, type Locale } from "@/lib/i18n";
import type { Driver, Vehicle } from "@/lib/types";

export function VehicleRecordActions({ vehicle, locale }: { vehicle: Vehicle; locale: Locale }) {
  return (
    <RecordActions id={vehicle.id} name={vehicle.name} updatedAt={vehicle.updatedAt} update={updateVehicle} remove={deleteVehicle}
      editTitle={text(locale, "编辑车辆", "Edit vehicle")}
      deleteDescription={text(locale, "车辆将移出可用车队，历史行程保留。如有未完成行程或有效排班，需要先处理后再删除。", "The vehicle will leave the fleet; past trips are retained. Open trips and active schedules must be resolved first.")}>
      <label><span>{text(locale, "车辆名称", "Vehicle name")}</span><input name="name" defaultValue={vehicle.name} required maxLength={200} /></label>
      <label><span>{text(locale, "车牌号", "License plate")}</span><input name="plate" defaultValue={vehicle.plate} required maxLength={30} /></label>
      <label><span>{text(locale, "座位数", "Seat capacity")}</span><input name="capacity" type="number" defaultValue={vehicle.capacity} min={1} max={100} step={1} required /></label>
      <label><span>{text(locale, "状态", "Status")}</span><select name="status" defaultValue={vehicle.status}><option value="AVAILABLE">{text(locale, "可用", "Available")}</option><option value="IN_SERVICE">{text(locale, "使用中", "In service")}</option><option value="MAINTENANCE">{text(locale, "维修中", "Maintenance")}</option></select></label>
    </RecordActions>
  );
}

export function DriverRecordActions({ driver, locale }: { driver: Driver; locale: Locale }) {
  return (
    <RecordActions id={driver.id} name={driver.name} updatedAt={driver.updatedAt} update={updateDriver} remove={deleteDriver}
      editTitle={text(locale, "编辑司机", "Edit driver")}
      deleteDescription={text(locale, "司机将移出名册，关联司机账号停用，历史行程保留。如有未完成行程或有效排班，需要先处理后再删除。", "The driver will leave the roster and their driver account will be disabled. Past trips are retained. Open trips and active schedules must be resolved first.")}>
      <label><span>{text(locale, "司机姓名", "Driver name")}</span><input name="name" defaultValue={driver.name} required maxLength={200} /></label>
      <label><span>{text(locale, "电话", "Phone")}</span><input name="phone" type="tel" defaultValue={driver.phone} maxLength={80} /></label>
      <label><span>{text(locale, "状态", "Status")}</span><select name="status" defaultValue={driver.status}><option value="AVAILABLE">{text(locale, "可用", "Available")}</option><option value="OFF_DUTY">{text(locale, "休息", "Off duty")}</option></select></label>
    </RecordActions>
  );
}
