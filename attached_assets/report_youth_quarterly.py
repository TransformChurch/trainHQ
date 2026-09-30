"""Config for the Youth Quarterly report -- grade bands 6-7th/8-10th/11-12th,
"Attendance Summary" = Middle School vs High School vs Unknown headcount,
plus the two quarterly-only additions (Grade Average Attendance, Notable
First-Time Students). See report_youth.py for the rendering logic."""

from report_youth import YouthConfig

_CHART_BAND_MAP = {
    "6th": "6-7th Grade", "7th": "6-7th Grade",
    "8th": "8-10th Grade", "9th": "8-10th Grade", "10th": "8-10th Grade",
    "11th": "11-12th Grade", "12th": "11-12th Grade",
}
_CHART_BAND_ORDER = ["6-7th Grade", "8-10th Grade", "11-12th Grade"]

CONFIG = YouthConfig(
    report_name="Youth Quarterly Report",
    chart_band_map=_CHART_BAND_MAP,
    chart_band_order=_CHART_BAND_ORDER,
    attendance_summary_mode="ms_hs_unknown",
    has_avg_attendance_chart=True,
    has_notable_first_timers=True,
)
