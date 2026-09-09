#!/usr/bin/env python3
"""
cleanup_attendance.py
======================

Data-cleanup step for the monthly youth ministry attendance report.

Takes the raw monthly check-ins export (CSV) and produces a cleaned CSV:
duplicate students merged, grades recoded into the template's buckets,
blank genders inferred (or flagged), and anything ambiguous flagged for
human review. Does NOT touch the Excel template -- that's a separate step
(a second script pastes this output into the workbook's raw-attendance
tab and drives the print PDF).

USAGE
-----
    python3 cleanup_attendance.py input.csv output.csv

    # optional: also write a companion text file listing everything
    # flagged for review (in addition to the console summary)
    python3 cleanup_attendance.py input.csv output.csv --flags-out flags.txt

INPUT FORMAT
------------
A CSV with these fixed columns (see FIXED_COLUMNS below to adjust names
if your export headers differ), followed by one TRUE/FALSE column per
service date that month, in date order. Everything that isn't a
recognized fixed column is treated as a week/attendance column, so this
adapts automatically to a 4-week vs. 5-week month -- no code change needed.

    First Name, Last Name, Birthdate, Email, Phone Number (mobile),
    Gender, Grade, First Timers,
    <date col 1>, <date col 2>, ..., [Attendance Rate]

CONFIG -- check these before running each month
-------------------------------------------------
The project's grade-bucket floor and valid categories live in the Excel
template, not in this script, and the template can change. Before each
run, confirm LOWEST_GRADE_BUCKET below still matches the lowest row label
on the template's Performance tab (e.g. "6th grade" for a 6-8/9-10/11-12
split). If the template changes its categories, update this section.
"""

import argparse
import csv
import difflib
import re
import sys
from collections import OrderedDict, defaultdict

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

# Fixed (non-week) columns expected in the raw export. Everything in the
# CSV header that ISN'T one of these is auto-detected as a week/date column.
FIXED_COLUMNS = [
    "Planning Center ID", "First Name", "Last Name", "Birthdate", "Email",
    "Phone Number (home)", "Phone Number (mobile)",
    "Primary Contact Name", "Primary Contact Email",
    "Gender", "Grade", "First Timers",
    "Completed Thrive", "Baptized?", "Last served", "Attendance Rate",
]

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


def contact_completeness(row):
    return sum(1 for f in ("Email", "Phone Number (mobile)")
               if norm(row.get(f)))


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
    week_cols = [c for c in fieldnames if re.fullmatch(r"\d{4}-\d{2}-\d{2}", c or "")]
    extra_cols = [c for c in fieldnames if c not in FIXED_COLUMNS and c not in week_cols]
    return rows, week_cols, extra_cols


# ============================================================================
# Merge duplicates
# ============================================================================

def merge_duplicates(rows, week_cols, extra_cols, flags):
    groups = OrderedDict()
    for r in rows:
        k = norm(r.get("Planning Center ID")) or name_key(r["First Name"], r["Last Name"])
        groups.setdefault(k, []).append(r)

    merged = []
    for k, grp in groups.items():
        first = grp[0]
        who = f"{first['First Name']} {first['Last Name']}"

        weekly = {w: any(norm(r.get(w, "")).upper() == "TRUE" for r in grp) for w in week_cols}

        grades = [norm(r["Grade"]) for r in grp]
        nonblank_grades = [g for g in grades if g]
        if len(set(nonblank_grades)) > 1:
            flags["grade_conflict"].append(
                f"{who}: {[(r['_rownum'], r['Grade']) for r in grp]} -> kept {nonblank_grades[0]!r} (first-occurring; please confirm)"
            )
        grade_final = nonblank_grades[0] if nonblank_grades else ""

        genders = [norm(r["Gender"]) for r in grp]
        nonblank_genders = [g for g in genders if g]
        if len(set(nonblank_genders)) > 1:
            flags["gender_conflict"].append(
                f"{who}: {[(r['_rownum'], r['Gender']) for r in grp]} -> kept {nonblank_genders[0]!r} (first-occurring; please confirm)"
            )
        gender_final = nonblank_genders[0] if nonblank_genders else ""

        first_timer = any(is_first_timer(r["First Timers"]) for r in grp)

        best = max(grp, key=contact_completeness)
        emails = {norm(r["Email"]).lower() for r in grp if norm(r["Email"])}
        mobiles = {digits_only(r["Phone Number (mobile)"]) for r in grp if norm(r["Phone Number (mobile)"])}
        if len(grp) > 1 and (len(emails) > 1 or len(mobiles) > 1):
            flags["contact_conflict"].append(f"{who} (rows {[r['_rownum'] for r in grp]}): kept most-complete row's contact info")

        if len(grp) > 1:
            flags["merged"].append(f"{who}: rows {[r['_rownum'] for r in grp]} -> 1 record")

        merged.append({
            "Planning Center ID": norm(first.get("Planning Center ID")),
            "First Name": norm(first["First Name"]),
            "Last Name": norm(first["Last Name"]),
            "Birthdate": norm(first.get("Birthdate")),
            "Email": norm(best["Email"]),
            "Phone Number (home)": norm(best.get("Phone Number (home)")),
            "Phone Number (mobile)": norm(best["Phone Number (mobile)"]),
            "Primary Contact Name": norm(best.get("Primary Contact Name")),
            "Primary Contact Email": norm(best.get("Primary Contact Email")),
            "Gender": gender_final,
            "Grade": grade_final,
            "First Timers": FIRST_TIMER_VALUE if first_timer else "",
            "Completed Thrive": norm(best.get("Completed Thrive")),
            "Baptized?": norm(best.get("Baptized?")),
            "Last served": norm(best.get("Last served")),
            **{column: norm(best.get(column)) for column in extra_cols},
            "_weekly": weekly,
            "_orig_rows": [r["_rownum"] for r in grp],
        })
    return merged


# ============================================================================
# Category anomaly checks (recode grade, resolve/flag gender)
# ============================================================================

def apply_anomaly_checks(records, flags):
    for r in records:
        who = f"{r['First Name']} {r['Last Name']}"
        r["Grade"] = recode_grade(r["Grade"], flags, who)
        r["Gender"] = clean_gender(r["Gender"], r["First Name"], flags, who)
        ft = norm(r["First Timers"])
        if ft and not is_first_timer(ft):
            flags["first_timer_unexpected"].append(f"{who}: {ft!r}")


# ============================================================================
# Near-match detection (flag only -- never auto-merge on this)
# ============================================================================

def find_near_matches(records, flags):
    n = len(records)
    seen_pairs = set()

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
            shares_email = norm(a["Email"]).lower() and norm(a["Email"]).lower() == norm(b["Email"]).lower()
            a_phones = {phone_key(a["Phone Number (mobile)"])} - {None}
            b_phones = {phone_key(b["Phone Number (mobile)"])} - {None}
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


def write_output(records, week_cols, extra_cols, out_path):
    fieldnames = [
        "Planning Center ID", "First Name", "Last Name", "Birthdate", "Email",
        "Phone Number (home)", "Phone Number (mobile)",
        "Primary Contact Name", "Primary Contact Email",
        "Gender", "Grade", "First Timers",
        "Completed Thrive", "Baptized?", "Last served",
    ] + extra_cols + week_cols + ["Attendance Rate"]

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
    args = ap.parse_args()

    flags = defaultdict(list)

    rows, week_cols, extra_cols = load_rows(args.input_csv)
    print(f"Loaded {len(rows)} raw rows.")
    print(f"Detected {len(week_cols)} week/date column(s): {week_cols}")

    records = merge_duplicates(rows, week_cols, extra_cols, flags)
    apply_anomaly_checks(records, flags)
    find_near_matches(records, flags)

    write_output(records, week_cols, extra_cols, args.output_csv)

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
        ("merged", "Merges made"),
        ("grade_conflict", "Grade conflicts (provisional pick = first-occurring row)"),
        ("gender_conflict", "Gender conflicts (provisional pick = first-occurring row)"),
        ("contact_conflict", "Contact-info conflicts (kept most-complete row)"),
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
        "grade_conflict", "gender_conflict", "gender_ambiguous",
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
