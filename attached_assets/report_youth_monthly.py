"""
report_youth_monthly.py
=========================

Config for the Youth Monthly report. All the actual rendering logic lives
in report_youth.py -- this file just supplies the YouthConfig that
distinguishes the monthly report from the quarterly one, per
report_youth.py's module docstring:

- Weekly-chart grade bands: 6-8th / 9-10th / 11-12th.
- "Attendance Summary" = New vs Returning students.
- No Quarterly-only extras (no Grade Average Attendance bar, no Notable
  First-Time Students table/bar).
"""

from report_youth import YouthConfig

CONFIG = YouthConfig(
    report_name="Youth Monthly Report",
    chart_band_map={
        "6th": "6-8th", "7th": "6-8th", "8th": "6-8th",
        "9th": "9-10th", "10th": "9-10th",
        "11th": "11-12th", "12th": "11-12th",
    },
    chart_band_order=["6-8th", "9-10th", "11-12th"],
    attendance_summary_mode="new_returning",
    has_avg_attendance_chart=False,
    has_notable_first_timers=False,
)
