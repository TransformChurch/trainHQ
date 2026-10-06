"""Campus config for the Kids Lyndhurst report. Since Oct 2026 it uses the
same age groups as Rutherford, with 5th-6th Grade as its own group (ages
11-15 bucket to "6th"); before that, Lyndhurst stopped at 5th grade with one
"2-5th Grade" group. See report_kids.py for the rendering logic."""

from report_kids import CampusConfig

_AGE_TO_FINE_GRADE = {
    0: "Infants", 1: "Infants",
    2: "Toddler", 3: "Toddler",
    4: "Pre-K",
    5: "K",
    6: "1st",
    7: "2nd",
    8: "3rd",
    9: "4th",
    10: "5th",
    11: "6th", 12: "6th", 13: "6th", 14: "6th", 15: "6th",
}

_FINE_GRADE_ORDER = ["Infants", "Toddler", "Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th", "6th"]

_CHART_BAND_MAP = {
    "Infants": "Infants/Toddlers", "Toddler": "Infants/Toddlers",
    "Pre-K": "Preschool",
    "K": "K-1st Grade", "1st": "K-1st Grade",
    "2nd": "2nd-4th Grade", "3rd": "2nd-4th Grade", "4th": "2nd-4th Grade",
    "5th": "5th-6th Grade", "6th": "5th-6th Grade",
}

_CHART_BAND_ORDER = ["Infants/Toddlers", "Preschool", "K-1st Grade", "2nd-4th Grade", "5th-6th Grade"]

CONFIG = CampusConfig(
    campus_name="Lyndhurst",
    age_to_fine_grade=_AGE_TO_FINE_GRADE,
    fine_grade_order=_FINE_GRADE_ORDER,
    chart_band_map=_CHART_BAND_MAP,
    chart_band_order=_CHART_BAND_ORDER,
)
