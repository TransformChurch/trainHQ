"""
report_kids_rutherford.py
===========================

Config for the Rutherford campus Kids report. All the actual rendering
logic lives in report_kids.py -- this file just supplies the CampusConfig
that distinguishes Rutherford from Lyndhurst: Rutherford's Kids ministry
runs through 6th grade (see report_kids.py's module docstring).

age_to_fine_grade only needs entries up through the oldest age that still
belongs in Kids -- report_kids.py's _fine_grade() falls back to whatever
grade is mapped at the highest key for any older age, so every age above
11 also lands on "6th" automatically without needing an explicit entry.
"""

from report_kids import CampusConfig

CONFIG = CampusConfig(
    campus_name="Rutherford",
    age_to_fine_grade={
        0: "Infants",
        1: "Toddler", 2: "Toddler",
        3: "Pre-K", 4: "Pre-K",
        5: "K",
        6: "1st",
        7: "2nd",
        8: "3rd",
        9: "4th",
        10: "5th",
        11: "6th",  # highest key -- ages above this also fall back to "6th"
    },
    fine_grade_order=["Infants", "Toddler", "Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th", "6th"],
    chart_band_map={
        "Infants": "Pre-Elementary", "Toddler": "Pre-Elementary", "Pre-K": "Pre-Elementary",
        "K": "K-1st", "1st": "K-1st",
        "2nd": "2nd-3rd", "3rd": "2nd-3rd",
        "4th": "4th-6th", "5th": "4th-6th", "6th": "4th-6th",
    },
    chart_band_order=["Pre-Elementary", "K-1st", "2nd-3rd", "4th-6th"],
)
