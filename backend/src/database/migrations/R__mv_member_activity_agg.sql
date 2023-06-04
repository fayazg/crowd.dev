drop materialized view if exists mv_member_activity_agg;
create materialized view mv_member_activity_agg as
select m.id,
       m."tenantId",
       max(a."timestamp")                                   as "lastActive",
       count(a.id)                                          as "activityCount",
       count(distinct a."timestamp"::date)                  as "activeDaysCount",
       round(avg((a.sentiment -> 'sentiment')::numeric), 2) as "averageSentiment"
from members m
         left join activities a on m.id = a."memberId" and a."deletedAt" is null
where m."deletedAt" is null
group by m.id;

create unique index ix_mv_member_activity_agg_memberid
    on mv_member_activity_agg (id);

refresh materialized view mv_member_activity_agg;