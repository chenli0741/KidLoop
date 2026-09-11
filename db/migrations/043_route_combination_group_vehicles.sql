create table if not exists route_combination_group_vehicles (
  group_id uuid not null references route_combination_groups(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  primary key (group_id, vehicle_id)
);

create index if not exists route_combination_group_vehicles_vehicle_idx
  on route_combination_group_vehicles (vehicle_id);
