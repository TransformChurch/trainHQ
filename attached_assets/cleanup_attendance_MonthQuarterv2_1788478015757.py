#!/usr/bin/env python3
"""
cleanup_attendance.py
======================

Data-cleanup step for the monthly OR quarterly youth ministry attendance
report -- this is the PERIOD-AWARE variant. It figures out whether the
raw export is a single month's or a single quarter's worth of service
dates, and drops any date column that doesn't belong to that period
before cleaning anything else. If you don't want that filtering at all
(e.g. you're deliberately handing it a mixed or non-standard date range
and just want everything cleaned as-is), use the sibling script
cleanup_attendance_all_dates.py instead -- same cleanup logic, minus the
period detection and column-dropping step.

Beyond the period check, this does what the original script did: raw
check-ins export (CSV) in, cleaned CSV out -- duplicate students merged,
grades recoded into the template's buckets, blank genders inferred (or
flagged), and anything ambiguous flagged for human review. Does NOT
touch the Excel template -- that's a separate step (a second script
pastes this output into the workbook's raw-attendance tab and drives the
print PDF).

USAGE
-----
    python3 cleanup_attendance.py input.csv output.csv

    # optional: also write a companion text file listing everything
    # flagged for review (in addition to the console summary)
    python3 cleanup_attendance.py input.csv output.csv --flags-out flags.txt

    # optional: force the period instead of auto-detecting it (see
    # PERIOD DETECTION below for what auto-detect does and when to
    # override it)
    python3 cleanup_attendance.py input.csv output.csv --period month
    python3 cleanup_attendance.py input.csv output.csv --period quarter

INPUT FORMAT -- SCHEMA-AGNOSTIC
--------------------------------
This script does not assume a fixed, hardcoded set of column names.
Whatever your export's fixed (non-week) columns actually are -- First
Name/Last Name/Email/Phone/Gender/Grade/First Timers for a youth
roster, or a different set entirely for another ministry's export --
this script reads them from the CSV's own header row rather than
requiring you to edit a hardcoded list to match a different export
shape.

A column is treated as a WEEK/attendance column if its header parses
as a date (see DATE_FORMATS below -- extend it if your export's date
headers use a different format); every other column (except
"Attendance Rate", which is always recomputed, never read) is treated
as a FIXED, passthrough column, carried through unchanged in its
original header order. This is also what lets the week-column count
adapt automatically to a 4-week month, a 5-week month, or a ~13-week
quarter -- no code change needed for the column count itself. Three
column names get special handling, but only when actually present in
your export's header row:

  - "Grade" -- recoded up to the template's floor bucket (see CONFIG).
  - "Gender" -- validated, and inferred from First Name when blank.
  - "First Timers" -- normalized against FIRST_TIMER_VALUE.

Every OTHER fixed column (Email, Phone Number (home/mobile), or
anything else your export happens to have) gets the same generic
duplicate-merge treatment: the most-complete (non-blank) value wins,
and a genuine conflict between two non-blank values across duplicate
rows is flagged for your review rather than silently picked.

    First Name, Last Name, <any other fixed columns you have>,
    <date col 1>, <date col 2>, ..., [Attendance Rate]

PERIOD DETECTION -- what "month" vs "quarter" means here, and what gets
dropped
------------------------------------------------------------------------
With --period auto (the default), every week-column header is parsed as
a date, then:
  1. The single calendar month with the most date columns is the
     "dominant month". If it accounts for a clear majority of all the
     columns (more than all the other columns combined), this export is
     treated as a MONTH report: the dominant month is the target period,
     and any column falling in a different month is dropped as a stray
     (e.g. a leftover or mistyped date from an adjacent month).
  2. Otherwise, this export is treated as a QUARTER report: the
     dominant calendar quarter (by column count) is the target period,
     and any column falling in a different quarter is dropped.
Either way, a MONTH can have at most 5 date columns and a QUARTER at
most 14 (there is no calendar month with 6 occurrences of a given
weekday, and no standard quarter with more than ~13-14 weekly service
dates) -- if more than that remain for the detected period even after
dropping out-of-period columns, something is genuinely wrong (a
duplicate column, a bad date, or the wrong period was detected), and
the script stops with a clear error rather than guessing which columns
to discard. Pass --period month or --period quarter explicitly if
auto-detection picks the wrong one (this can happen with a very small,
ambiguous number of columns).

Every dropped column is named in the cleanup report, with the date it
parsed to and which period it didn't belong to -- always double-check
that list corresponds to genuine stray/mistaken columns and not real
service dates that should have been kept (in which case pass
--period explicitly, or fix the CSV's date headers, and re-run).

CONFIG -- check these before running each month
-------------------------------------------------
The project's grade-bucket floor and valid categories live in the Excel
template, not in this script, and the template can change. Before each
run, confirm LOWEST_GRADE_BUCKET below still matches the lowest row label
on the template's Performance tab (e.g. "6th grade" for a 6-8/9-10/11-12
split). If the template changes its categories, update this section.
This section is simply ignored (no grade flags at all) for a roster
that has no "Grade" column, such as a young-adults export.
"""

import argparse
import csv
import datetime
import difflib
import re
import sys
from collections import Counter, OrderedDict, defaultdict

# ============================================================================
# CONFIG -- adjust to match the current month's template before running
# ============================================================================

# The lowest grade bucket the template's Performance tab currently expects.
# Any grade below this (in GRADE_ORDER below) gets recoded up into it.
LOWEST_GRADE_BUCKET = "6th Grade"

# Full grade ordering, lowest to highest, used to decide what's "below"
# the template's floor. Extend if your export uses different labels.
GRADE_ORDER = [
    "Pre-K", "Kindergarten",
    "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade",
    "6th Grade", "7th Grade", "8th Grade", "9th Grade",
    "10th Grade", "11th Grade", "12th Grade",
]

VALID_GENDERS = {"Male", "Female"}
FIRST_TIMER_VALUE = "First-timer"

# Recognized formats for a week-column header (e.g. "5-Aug-26" or
# "2026-04-16"). A column is a week/attendance column if -- and only if
# -- its header parses as one of these; everything else is a fixed,
# passthrough column. Extend this if your export's date headers look
# different.
DATE_FORMATS = ["%Y-%m-%d", "%d-%b-%y", "%d-%b-%Y", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y"]

# Columns that always get their own special handling below (when
# present) rather than the generic most-complete-wins merge -- First
# Name/Last Name are the identity/merge key. Everything else in the
# CSV's fixed-column set (whatever that turns out to be) is merged
# generically -- see merge_duplicates().
IDENTITY_COLUMNS = ["First Name", "Last Name"]
SPECIAL_COLUMNS = ["Grade", "Gender", "First Timers"]

# Hard ceilings used by the period check: no calendar month has more
# than 5 occurrences of a given weekday, and a standard 13-week quarter
# tops out around here even allowing a little slack. If more columns
# than this remain for the detected period after dropping out-of-period
# stragglers, the auto-detection (or the data) is wrong -- see
# classify_and_filter_weeks().
MONTH_SESSION_CAP = 5
QUARTER_SESSION_CAP = 14

# Minimum difflib similarity ratio to flag two non-identical names as a
# possible near-match (e.g. "Noahm" vs "Noah"). Tune if you get too much
# or too little noise.
FUZZY_NAME_THRESHOLD = 0.75
FUZZY_FULLNAME_THRESHOLD = 0.85

# Small, deliberately conservative first-name -> gender lookup used only
# to fill blank Gender cells. Names not in here are ALWAYS flagged for
# your review rather than guessed -- per the project rule, silent guessing
# on a genuinely ambiguous name (Angel, Noel, Ariel, Jordan, ...) is worse
# than asking. Extend this dict over time as you confirm names; it will
# just mean fewer flags next month.
NAME_GENDER = {
    # common unambiguous names seen in past rosters -- extend freely
    "female": {
        "allison", "isabella", "sophia", "emma", "olivia", "ava", "mia",
        "charlotte", "amelia", "harper", "evelyn", "abigail", "emily",
        "elizabeth", "victoria", "grace", "chloe", "camila", "luna",
        "penelope", "layla", "nora", "hazel", "aurora", "savannah",
        "brooklyn", "bella", "claire", "skylar", "lucy", "paisley",
        "anna", "caroline", "genesis", "aaliyah", "kennedy", "kinsley",
        "allison", "maya", "sarah", "madison", "jasmine", "valentina",
        "gabriella", "natalie", "alexa", "samantha", "leah", "melanie",
        "kaitlyn", "scarlett", "jennifer", "stephanie", "diana", "laila",
        "adriana", "adrianna", "daniela", "daniella", "gabriela",
        "gabriella", "isamar", "jadilyn", "julianna", "kiara", "miley",
        "rebecca", "vanessa", "yesenia", "ashley", "brianna", "destiny",
        "jazmin", "jazmine", "kayla", "mariana", "nicole", "priscilla",
        "tabitha", "veronica", "yaritza",
    },
    "male": {
        "liam", "noah", "james", "oliver", "elijah", "william", "henry",
        "lucas", "benjamin", "theodore", "mateo", "levi", "sebastian",
        "jack", "owen", "daniel", "samuel", "david", "joseph", "carter",
        "wyatt", "matthew", "luke", "asher", "christopher", "isaac",
        "andrew", "joshua", "caleb", "nathan", "ryan", "adrian", "miles",
        "eli", "nolan", "christian", "aaron", "cameron", "diego",
        "anthony", "kevin", "brandon", "justin", "tyler", "jordan",
        "juan", "carlos", "jose", "luis", "miguel", "jonathan", "kenneth",
        "abraham", "emmanuel", "gabriel", "jayden", "jaden", "damian",
        "damien", "elias", "ezra", "ezequiel", "isaiah", "jacob", "jaime",
        "javier", "jeremiah", "julien", "kaimo", "kian", "kevin", "marcus",
        "mason", "maximus", "nicholas", "nicolas", "niko", "robin",
        "samir", "santiago", "sahid", "steven", "victor", "yahir",
        "zaidynn",
    },
}


# ============================================================================
# Helpers
# ============================================================================

def norm(s):
    """Collapse whitespace and strip. Never returns None."""
    return re.sub(r"\s+", " ", (s or "")).strip()


def name_key(first, last):
    return (norm(first).lower(), norm(last).lower())


def digits_only(phone):
    return re.sub(r"\D", "", phone or "")


def phone_key(phone):
    d = digits_only(phone)
    return d[-10:] if len(d) >= 10 else None


def grade_rank(grade):
    g = norm(grade)
    try:
        return GRADE_ORDER.index(g)
    except ValueError:
        return None  # blank, "Unknown", or unrecognized text


def recode_grade(grade, flags, who):
    """Return the cleaned grade value, logging a recode if one happened."""
    g = norm(grade)
    if not g or g.lower() == "unknown":
        if g:  # was literally "Unknown" already -- fine, leave as-is
            return "Unknown"
        flags["grade_blank"].append(who)
        return "Unknown"
    rank = grade_rank(g)
    floor_rank = grade_rank(LOWEST_GRADE_BUCKET)
    if rank is None:
        flags["grade_unexpected"].append(f"{who}: {g!r} not in GRADE_ORDER")
        return g
    if floor_rank is not None and rank < floor_rank:
        flags["grade_recoded"].append(f"{who}: {g} -> {LOWEST_GRADE_BUCKET}")
        return LOWEST_GRADE_BUCKET
    return g


def infer_gender(first_name, flags, who):
    key = norm(first_name).lower()
    if key in NAME_GENDER["female"]:
        return "Female"
    if key in NAME_GENDER["male"]:
        return "Male"
    flags["gender_ambiguous"].append(who)
    return ""  # left blank -- you decide


def clean_gender(gender, first_name, flags, who):
    g = norm(gender)
    if not g:
        return infer_gender(first_name, flags, who)
    if g not in VALID_GENDERS:
        flags["gender_unexpected"].append(f"{who}: {g!r} not Male/Female")
        return g
    return g


def is_first_timer(value):
    return norm(value).lower() == FIRST_TIMER_VALUE.lower()


# ============================================================================
# Load + detect columns
# ============================================================================

def parse_date_header(s):
    s = norm(s)
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def detect_columns(fieldnames):
    """Split the CSV's header into (fixed_cols, week_cols), in original
    header order. A column is a week column if its header parses as a
    date (see DATE_FORMATS); "Attendance Rate" is always excluded from
    both -- it's recomputed, never read. Everything else is a fixed,
    passthrough column, whatever it's actually called."""
    week_cols, fixed_cols = [], []
    for c in fieldnames:
        if c == "Attendance Rate":
            continue
        if parse_date_header(c) is not None:
            week_cols.append(c)
        else:
            fixed_cols.append(c)
    return fixed_cols, week_cols


def load_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = []
        for i, r in enumerate(reader):
            if not any(norm(v) for v in r.values()):
                continue  # skip fully blank rows
            r["_rownum"] = i + 2  # 1-indexed + header row
            rows.append(r)
    fixed_cols, week_cols = detect_columns(fieldnames)
    for identity_col in IDENTITY_COLUMNS:
        if identity_col not in fixed_cols:
            raise SystemExit(
                f"Expected a {identity_col!r} column in the CSV header -- found fixed columns "
                f"{fixed_cols} and week columns {week_cols}. If {identity_col!r} is present but its "
                f"header happens to parse as a date, or a real week column isn't parsing as one, check "
                f"DATE_FORMATS."
            )
    return rows, fixed_cols, week_cols


# ============================================================================
# Period detection -- is this a month's or a quarter's worth of dates,
# and which columns (if any) don't belong to it
# ============================================================================


def month_key(dt):
    return (dt.year, dt.month)


def quarter_key(dt):
    return (dt.year, (dt.month - 1) // 3 + 1)


def classify_and_filter_weeks(week_cols, flags, period_override=None):
    """Parse every week-column header as a date, decide whether this
    export reads as a single MONTH or a single QUARTER, and drop any
    column that doesn't belong to that period. See the module docstring
    ("PERIOD DETECTION") for the full explanation of the heuristic and
    the two session caps. Returns (period, target_label, kept_week_cols).
    """
    parsed = []
    for w in week_cols:
        dt = parse_date_header(w)
        if dt is None:
            raise SystemExit(
                f"Could not parse week-column header {w!r} as a date (recognized formats: {DATE_FORMATS}). "
                "Every non-fixed column is assumed to be a dated service column -- fix the header, or "
                "extend DATE_FORMATS in this script if your export just uses a different format."
            )
        parsed.append((w, dt))

    month_counts = Counter(month_key(dt) for _, dt in parsed)
    dominant_month, dominant_month_n = month_counts.most_common(1)[0]
    non_dominant_n = len(parsed) - dominant_month_n

    if period_override in ("month", "quarter"):
        period = period_override
    else:
        # auto: a clear majority in one month reads as a MONTH report
        # (the rest are stray dates); otherwise this is a QUARTER report
        period = "month" if dominant_month_n > non_dominant_n else "quarter"

    if period == "month":
        target = dominant_month
        cap = MONTH_SESSION_CAP
        target_label = f"{target[0]}-{target[1]:02d}"
        in_period = lambda dt: month_key(dt) == target
    else:
        quarter_counts = Counter(quarter_key(dt) for _, dt in parsed)
        target, _ = quarter_counts.most_common(1)[0]
        cap = QUARTER_SESSION_CAP
        target_label = f"{target[0]}-Q{target[1]}"
        in_period = lambda dt: quarter_key(dt) == target

    kept = [(w, dt) for w, dt in parsed if in_period(dt)]
    dropped = [(w, dt) for w, dt in parsed if not in_period(dt)]

    for w, dt in dropped:
        flags["week_dropped_out_of_period"].append(
            f"{w} (parsed as {dt.strftime('%Y-%m-%d')}) -- outside the detected {period} ({target_label}); column removed"
        )

    if not kept:
        raise SystemExit(
            f"No week columns left in the detected {period} ({target_label}) -- every column was classified "
            "as out-of-period, which almost certainly means the detection got it wrong. Pass --period month "
            "or --period quarter explicitly, or check the CSV's date headers."
        )
    if len(kept) > cap:
        kept_labels = ", ".join(w for w, _ in kept)
        raise SystemExit(
            f"{len(kept)} week column(s) remain in the detected {period} ({target_label}) after dropping "
            f"out-of-period columns -- more than a {period} can have ({cap}). That usually means the wrong "
            f"period was detected, there's a duplicate or bad date column, or this export genuinely isn't a "
            f"single month/quarter. Columns kept: {kept_labels}. Pass --period month or --period quarter "
            f"explicitly, or fix the CSV's date headers, and re-run."
        )

    return period, target_label, [w for w, _ in kept]


# ============================================================================
# Merge duplicates
# ============================================================================

def merge_duplicates(rows, fixed_cols, week_cols, flags):
    """Merge exact First+Last-Name duplicates. Grade/Gender/First Timers
    (when present in fixed_cols) keep their existing special-cased
    handling; every OTHER fixed column -- whatever this run's export
    actually has -- gets the same generic treatment: the most-complete
    non-blank value wins, and a GENUINE conflict (two different non-
    blank values across the duplicate rows) is flagged for review
    rather than silently picked."""
    generic_cols = [c for c in fixed_cols if c not in IDENTITY_COLUMNS and c not in SPECIAL_COLUMNS]

    groups = OrderedDict()
    for r in rows:
        k = name_key(r["First Name"], r["Last Name"])
        groups.setdefault(k, []).append(r)

    merged = []
    for k, grp in groups.items():
        first = grp[0]
        who = f"{first['First Name']} {first['Last Name']}"

        weekly = {w: any(norm(r.get(w, "")).upper() == "TRUE" for r in grp) for w in week_cols}

        out = {
            "First Name": norm(first["First Name"]),
            "Last Name": norm(first["Last Name"]),
        }

        if "Grade" in fixed_cols:
            grades = [norm(r["Grade"]) for r in grp]
            nonblank_grades = [g for g in grades if g]
            if len(set(nonblank_grades)) > 1:
                flags["grade_conflict"].append(
                    f"{who}: {[(r['_rownum'], r['Grade']) for r in grp]} -> kept {nonblank_grades[0]!r} (first-occurring; please confirm)"
                )
            out["Grade"] = nonblank_grades[0] if nonblank_grades else ""

        if "Gender" in fixed_cols:
            genders = [norm(r["Gender"]) for r in grp]
            nonblank_genders = [g for g in genders if g]
            if len(set(nonblank_genders)) > 1:
                flags["gender_conflict"].append(
                    f"{who}: {[(r['_rownum'], r['Gender']) for r in grp]} -> kept {nonblank_genders[0]!r} (first-occurring; please confirm)"
                )
            out["Gender"] = nonblank_genders[0] if nonblank_genders else ""

        if "First Timers" in fixed_cols:
            first_timer = any(is_first_timer(r["First Timers"]) for r in grp)
            out["First Timers"] = FIRST_TIMER_VALUE if first_timer else ""

        for field in generic_cols:
            vals = [norm(r.get(field, "")) for r in grp]
            populated = [v for v in vals if v]
            # phone-like fields: compare by digits only, so formatting
            # differences ("(973) 555-1212" vs "9735551212") don't read
            # as a conflict
            is_phone = "phone" in field.lower()
            distinct = {digits_only(v) for v in populated} if is_phone else set(populated)
            if len(distinct) > 1:
                flags["field_conflict"].append(
                    f"{who} -- {field!r}: {[(r['_rownum'], r.get(field, '')) for r in grp]} -> kept "
                    f"{populated[0]!r} (first-occurring; please confirm)"
                )
            out[field] = populated[0] if populated else ""

        if len(grp) > 1:
            flags["merged"].append(f"{who}: rows {[r['_rownum'] for r in grp]} -> 1 record")

        out["_weekly"] = weekly
        out["_orig_rows"] = [r["_rownum"] for r in grp]
        merged.append(out)
    return merged


# ============================================================================
# Category anomaly checks (recode grade, resolve/flag gender)
# ============================================================================

def apply_anomaly_checks(records, flags):
    for r in records:
        who = f"{r['First Name']} {r['Last Name']}"
        if "Grade" in r:
            r["Grade"] = recode_grade(r["Grade"], flags, who)
        if "Gender" in r:
            r["Gender"] = clean_gender(r["Gender"], r["First Name"], flags, who)
        if "First Timers" in r:
            ft = norm(r["First Timers"])
            if ft and not is_first_timer(ft):
                flags["first_timer_unexpected"].append(f"{who}: {ft!r}")


# ============================================================================
# Near-match detection (flag only -- never auto-merge on this)
# ============================================================================

def find_near_matches(records, flags):
    n = len(records)
    seen_pairs = set()

    # Discover which of THIS run's actual fixed columns look email-like /
    # phone-like by name, rather than hardcoding "Email"/"Phone Number
    # (home)"/"Phone Number (mobile)" -- a different export might only
    # have "Phone", or neither at all.
    sample = records[0] if records else {}
    field_names = [k for k in sample.keys() if not k.startswith("_")]
    email_fields = [f for f in field_names if "email" in f.lower()]
    phone_fields = [f for f in field_names if "phone" in f.lower()]

    def full_name(r):
        return f"{r['First Name']} {r['Last Name']}"

    for i in range(n):
        for j in range(i + 1, n):
            a, b = records[i], records[j]
            ak, bk = name_key(a["First Name"], a["Last Name"]), name_key(b["First Name"], b["Last Name"])
            if ak == bk:
                continue  # already merged

            same_last = ak[1] == bk[1]
            same_first = ak[0] == bk[0]
            first_ratio = difflib.SequenceMatcher(None, ak[0], bk[0]).ratio()
            last_ratio = difflib.SequenceMatcher(None, ak[1], bk[1]).ratio()
            full_ratio = difflib.SequenceMatcher(None, full_name(a), full_name(b)).ratio()

            name_similar = (
                (same_last and first_ratio > FUZZY_NAME_THRESHOLD)
                or (same_first and last_ratio > FUZZY_NAME_THRESHOLD)
                or full_ratio > FUZZY_FULLNAME_THRESHOLD
            )

            # Shared contact info is also a strong signal, but ONLY when
            # BOTH the first name and last name overlap at least a little
            # (e.g. "Donovan Monzon" / "Donovan Monzon-Sanders", or
            # "Roselynn Anazco" / "Roselynn Nasia Williams Anazco").
            # Requiring overlap on BOTH sides is deliberate: siblings very
            # commonly share a parent's email/phone AND a last name while
            # having completely different first names (e.g. "Carter
            # Burnett" / "Savanna Burnett") -- that's normal, not a
            # duplicate, so last-name-only overlap is intentionally NOT
            # enough to flag. The trade-off: a nickname-only variant with
            # an unrelated-looking last name (e.g. "Niko Gonzalez" /
            # "Nicolas Gonzalez-Cora" -- last names still overlap here,
            # so this example IS caught, but a case with no surname
            # overlap at all would slip through) won't be auto-flagged.
            # Worth an occasional manual skim of rows sharing an
            # email/phone if you want that last bit of coverage.
            shares_email = any(
                norm(a.get(f, "")).lower() and norm(a.get(f, "")).lower() == norm(b.get(f, "")).lower()
                for f in email_fields
            )
            a_phones = {phone_key(a.get(f, "")) for f in phone_fields} - {None}
            b_phones = {phone_key(b.get(f, "")) for f in phone_fields} - {None}
            shares_phone = bool(a_phones & b_phones)

            def overlaps(x, y, min_len=3):
                return x == y or (len(x) >= min_len and len(y) >= min_len and (x in y or y in x))

            first_overlap = overlaps(ak[0], bk[0])
            last_overlap = overlaps(ak[1], bk[1])
            contact_and_name_overlap = (shares_email or shares_phone) and first_overlap and last_overlap

            if name_similar or contact_and_name_overlap:
                pair = tuple(sorted([full_name(a), full_name(b)]))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                reason = []
                if name_similar:
                    reason.append("similar spelling")
                if contact_and_name_overlap:
                    reason.append("shares email/phone")
                flags["near_match"].append(f"{pair[0]} <-> {pair[1]} ({', '.join(reason)}) -- left as separate records")


# ============================================================================
# Output
# ============================================================================

def compute_attendance_rate(weekly, week_cols):
    if not week_cols:
        return 0
    attended = sum(1 for w in week_cols if weekly.get(w))
    return round(attended / len(week_cols), 4)


def write_output(records, fixed_cols, week_cols, out_path):
    # fixed_cols is already in the original CSV's header order (from
    # detect_columns), and already includes First Name/Last Name plus
    # whatever Grade/Gender/First Timers/other columns this export
    # actually had -- so just carry that order through, rather than
    # hardcoding a fixed-column list here too.
    fieldnames = list(fixed_cols) + week_cols + ["Attendance Rate"]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            row = {k: r[k] for k in fieldnames if k in r}
            for w in week_cols:
                row[w] = "TRUE" if r["_weekly"].get(w) else "FALSE"
            row["Attendance Rate"] = compute_attendance_rate(r["_weekly"], week_cols)
            writer.writerow(row)


# ============================================================================
# Main
# ============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input_csv")
    ap.add_argument("output_csv")
    ap.add_argument("--flags-out", help="optional: also write the full review-flag details to this text file")
    ap.add_argument("--period", choices=["auto", "month", "quarter"], default="auto",
                    help="force the reporting period instead of auto-detecting it from the week-column dates "
                         "(default: auto -- see the module docstring's PERIOD DETECTION section)")
    args = ap.parse_args()

    flags = defaultdict(list)

    rows, fixed_cols, week_cols = load_rows(args.input_csv)
    print(f"Loaded {len(rows)} raw rows.")
    print(f"Detected fixed column(s): {fixed_cols}")
    print(f"Detected {len(week_cols)} week/date column(s) before period filtering: {week_cols}")

    period_override = None if args.period == "auto" else args.period
    period, target_label, week_cols = classify_and_filter_weeks(week_cols, flags, period_override)
    n_dropped = len(flags["week_dropped_out_of_period"])
    print(f"Detected period: {period} ({target_label}). Kept {len(week_cols)} week column(s)"
          + (f", dropped {n_dropped} as out-of-period: {[f.split(' (parsed')[0] for f in flags['week_dropped_out_of_period']]}"
             if n_dropped else ", none dropped.")
          )

    records = merge_duplicates(rows, fixed_cols, week_cols, flags)
    apply_anomaly_checks(records, flags)
    find_near_matches(records, flags)

    write_output(records, fixed_cols, week_cols, args.output_csv)

    # ---- report ----
    lines = []
    lines.append("")
    lines.append("=" * 70)
    lines.append("CLEANUP REPORT")
    lines.append("=" * 70)
    lines.append(f"Raw rows in:        {len(rows)}")
    lines.append(f"Individuals out:    {len(records)}")
    lines.append(f"Duplicate groups merged: {len(flags['merged'])}")
    lines.append("")

    section_titles = [
        ("week_dropped_out_of_period", "Week columns dropped as out-of-period"),
        ("merged", "Merges made"),
        ("grade_conflict", "Grade conflicts (provisional pick = first-occurring row)"),
        ("gender_conflict", "Gender conflicts (provisional pick = first-occurring row)"),
        ("field_conflict", "Other field conflicts (kept first-occurring, non-blank value)"),
        ("grade_recoded", f"Grades recoded up to the floor ({LOWEST_GRADE_BUCKET})"),
        ("grade_blank", "Blank Grade -> recoded to Unknown"),
        ("grade_unexpected", "Unexpected Grade values (not in GRADE_ORDER)"),
        ("gender_ambiguous", "Blank Gender NOT inferred (name not in lookup -- needs your call)"),
        ("gender_unexpected", "Unexpected Gender values"),
        ("first_timer_unexpected", "Unexpected First Timers values"),
        ("near_match", "Near-matches flagged (left as separate records, NOT merged)"),
    ]
    for key, title in section_titles:
        items = flags[key]
        lines.append(f"--- {title} ({len(items)}) ---")
        for item in items:
            lines.append(f"  - {item}")
        lines.append("")

    review_keys = [
        "week_dropped_out_of_period",
        "grade_conflict", "gender_conflict", "field_conflict", "gender_ambiguous",
        "grade_unexpected", "gender_unexpected", "first_timer_unexpected",
        "near_match",
    ]
    review_count = sum(len(flags[k]) for k in review_keys)

    report = "\n".join(lines)
    print(report)
    print("=" * 70)
    print(f"ENTRIES NEEDING YOUR REVIEW: {review_count}")
    print("=" * 70)

    if args.flags_out:
        with open(args.flags_out, "w", encoding="utf-8") as f:
            f.write(report)
            f.write(f"\nENTRIES NEEDING YOUR REVIEW: {review_count}\n")
        print(f"\nFull flag details written to {args.flags_out}")

    print(f"Cleaned CSV written to {args.output_csv}")


if __name__ == "__main__":
    main()

# trivial touch to force git to notice this file
