"""Config for the Youth Monthly report -- grade bands 6-8th/9-10th/11-12th,
"Attendance Summary" = New vs Returning students. See report_youth.py for
the rendering logic."""

from report_youth import YouthConfig

_CHART_BAND_MAP = {
    "6th": "6-8th Grade", "7th": "6-8th Grade", "8th": "6-8th Grade",
    "9th": "9-10th Grade", "10th": "9-10th Grade",
    "11th": "11-12th Grade", "12th": "11-12th Grade",
}
_CHART_BAND_ORDER = ["6-8th Grade", "9-10th Grade", "11-12th Grade"]

CONFIG = YouthConfig(
    report_name="Youth Monthly Report",
    chart_band_map=_CHART_BAND_MAP,
    chart_band_order=_CHART_BAND_ORDER,
    attendance_summary_mode="new_returning",
    has_avg_attendance_chart=False,
    has_notable_first_timers=False,
)
