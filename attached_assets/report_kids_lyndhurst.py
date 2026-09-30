"""
report_kids_lyndhurst.py
==========================

Config for the Lyndhurst campus Kids report. All the actual rendering
logic lives in report_kids.py -- this file just supplies the CampusConfig
that distinguishes Lyndhurst from Rutherford: Lyndhurst's Kids ministry
stops at 5th grade, with every 11-15 year old still bucketed as "5th
grade" (see report_kids.py's module docstring).

That 11-15 -> "5th" behavior falls out of report_kids.py's _fine_grade()
fallback automatically: age_to_fine_grade only needs entries through age
10, and any older age not present as a key falls back to whatever grade
is mapped at the highest key (10 -> "5th") -- no explicit 11-15 entries
needed.
"""

from report_kids import CampusConfig

CONFIG = CampusConfig(
    campus_name="Lyndhurst",
    age_to_fine_grade={
        0: "Infants",
        1: "Toddler", 2: "Toddler",
        3: "Pre-K", 4: "Pre-K",
        5: "K",
        6: "1st",
        7: "2nd",
        8: "3rd",
        9: "4th",
        10: "5th",  # highest key -- ages above this (11-15+) also fall back to "5th"
    },
    fine_grade_order=["Infants", "Toddler", "Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th"],
    chart_band_map={
        "Infants": "Pre-Elementary", "Toddler": "Pre-Elementary", "Pre-K": "Pre-Elementary",
        "K": "K-1st", "1st": "K-1st",
        "2nd": "2nd-3rd", "3rd": "2nd-3rd",
        "4th": "4th-5th", "5th": "4th-5th",
    },
    chart_band_order=["Pre-Elementary", "K-1st", "2nd-3rd", "4th-5th"],
)
