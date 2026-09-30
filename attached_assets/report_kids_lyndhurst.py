"""Campus config for the Kids Lyndhurst report -- ministry stops at 5th
grade (every 11-15 year old still buckets to "5th grade"). See
report_kids.py for all the actual rendering logic."""

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
    11: "5th", 12: "5th", 13: "5th", 14: "5th", 15: "5th",
}

_FINE_GRADE_ORDER = ["Infants", "Toddler", "Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th"]

_CHART_BAND_MAP = {
    "Infants": "Infants/Toddlers", "Toddler": "Infants/Toddlers",
    "Pre-K": "Preschool",
    "K": "K-1st Grade", "1st": "K-1st Grade",
    "2nd": "2-5th Grade", "3rd": "2-5th Grade", "4th": "2-5th Grade", "5th": "2-5th Grade",
}

_CHART_BAND_ORDER = ["Infants/Toddlers", "Preschool", "K-1st Grade", "2-5th Grade"]

CONFIG = CampusConfig(
    campus_name="Lyndhurst",
    age_to_fine_grade=_AGE_TO_FINE_GRADE,
    fine_grade_order=_FINE_GRADE_ORDER,
    chart_band_map=_CHART_BAND_MAP,
    chart_band_order=_CHART_BAND_ORDER,
)
