"""
report_youth_quarterly.py
==========================

Config for the Youth Quarterly report. All the actual rendering logic
lives in report_youth.py -- this file just supplies the YouthConfig that
distinguishes the quarterly report from the monthly one, per
report_youth.py's module docstring:

- Weekly-chart grade bands: 6-7th / 8-10th / 11-12th.
- "Attendance Summary" = Middle School / High School / Unknown headcount.
- Quarterly-only extras: a "Grade Average Attendance" bar and the
  "Notable First-Time Students" table + "First-Time Students by Grade" bar.
"""

from report_youth import YouthConfig

CONFIG = YouthConfig(
    report_name="Youth Quarterly Report",
    chart_band_map={
        "6th": "6-7th", "7th": "6-7th",
        "8th": "8-10th", "9th": "8-10th", "10th": "8-10th",
        "11th": "11-12th", "12th": "11-12th",
    },
    chart_band_order=["6-7th", "8-10th", "11-12th"],
    attendance_summary_mode="ms_hs_unknown",
    has_avg_attendance_chart=True,
    has_notable_first_timers=True,
)
