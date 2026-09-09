-- Drafts can record a confirmed itinerary before dispatch times are known.
alter table fixed_routes add column notes text not null default '';
alter table fixed_route_stops alter column arrival_time drop not null;
