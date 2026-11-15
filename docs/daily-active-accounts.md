# 每日活跃登录用户数

登录状态确认后，只要应用页面可见，就计入当天的活跃登录用户。页面恢复可见或获得焦点时重新检查，持续可见的页面每分钟检查一次，以便跨过 UTC+8 零点后也能计入新的一天。后台标签页单独留存不会计入下一天。独立教程页没有登录状态，不在此口径内。

`account_active` 事件包含 UTC+8 日期 `activity_date` 和由账号 ID 算出的稳定散列标识 `account_analytics_id`。同一浏览器页面内每个账号每天最多发送一次，跨页面与跨设备的重复事件在查询时去重。设备数报表继续使用原有事件及设备标识。

部署后可在 PostHog 的 SQL 查询中使用以下统计口径。结果只包含有事件的日期。启用时间之前没有此口径的历史数据。

```sql
SELECT
    properties.activity_date AS activity_day,
    uniqExact(properties.account_analytics_id) AS daily_active_accounts
FROM events
WHERE event = 'account_active'
  AND properties.account_analytics_id != ''
GROUP BY activity_day
ORDER BY activity_day
```
