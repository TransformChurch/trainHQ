#!/usr/bin/env python3
"""
paste_to_template.py
=====================

Second step of the monthly youth ministry attendance report pipeline.
Takes the cleaned CSV produced by cleanup_attendance.py and pastes it
into a copy of the Excel template's "Raw Data" sheet, updates the
month/year on the Print PDF tab, refreshes the "Number of Weeks" setup
cell, and (optionally) exports a print-ready PDF.

WHY DIRECT XML EDITS (read this before changing this script)
--------------------------------------------------------------
The workbook has native Excel charts with hand-tuned color/style parts
and manually positioned plot areas. openpyxl does not fully round-trip
native charts -- re-saving the workbook through openpyxl (even for
unrelated cell edits), or running it through a LibreOffice recalc pass,
silently drops the chart color/style XML and resets the plot-area
layout. Bars/pies visibly shrink and shift on reopen even though the
data itself is untouched.

So: the DELIVERED .xlsx is never openpyxl- or LibreOffice-resaved. This
script extracts the .xlsx as a zip and edits only the specific
worksheet XML parts it needs (via direct text/regex edits), leaving
every other part of the zip -- especially everything under xl/charts/
-- byte-identical. LibreOffice is only ever used against a disposable
copy, for the optional PDF export (rendering to PDF doesn't need to
preserve editable chart XML) and for QA.

USAGE
-----
    python3 paste_to_template.py \\
        --template "07 YOUTH Report.xlsx" \\
        --data cleaned_september.csv \\
        --out-xlsx "09 YOUTH September Report.xlsx" \\
        --out-pdf "09 YOUTH September Report.pdf"

    # Month/year are auto-detected from the CSV's date-column headers.
    # Override if you need to (e.g. ambiguous or missing dates):
    #   --month September --year 2026

WHAT THIS SCRIPT ASSUMES ABOUT THE TEMPLATE
--------------------------------------------
These are read from the template file itself each run, NOT hardcoded,
so a template that has drifted (different week count, different style
IDs, different sheet order) is handled automatically. What IS assumed
-- and checked with a clear error rather than silently guessed at if
missing -- is the overall shape:
  - A sheet literally named "Raw Data" with columns, in order:
    First Name, Last Name, Email, Phone Number (home),
    Phone Number (mobile), Gender, Grade, First Timers,
    <one column per service week>, (blank spacer), Attendance Rate,
    ID, Dupe Check.
  - Real student rows start at row 2; a block of placeholder rows
    whose First Name is literally "Unknown" follows immediately after
    (carried forward unchanged -- these feed a real "Unknown Age"
    weekly headcount bucket on the Performance tab).
  - A sheet named "Performance" with a cell literally labeled
    "Number of Weeks" one row above the value cell it feeds.
  - A sheet named "Print PDF" with exactly one cell containing the
    report title in the form "<year> <month> Report", and a defined
    print area (used to identify it as the one sheet that belongs in
    the exported PDF -- Performance and Raw Data are working tabs and
    are excluded from the PDF).

A NOTE ON WEEK-COUNT CHANGES
-----------------------------
When the new month has a different number of service weeks than the
starting file, the Attendance Rate / ID / Dupe Check columns on Raw
Data shift right (or left) to make room. This script does NOT hunt
down and fix every other formula on Performance or Print PDF that
references those columns by a hardcoded letter (e.g.
COUNTIF('Raw Data'!N:N,...)) -- there can be 100+ such formulas, and
silently rewriting them is exactly the kind of "touches formula
ranges on the Performance tab" situation the project brief says to
flag rather than do silently. Instead, this script scans for exactly
that pattern and lists every specific cell affected in its warnings
output, since those formulas return a wrong number rather than a
formula error and are otherwise very easy to miss.
"""

import argparse
import csv
import datetime
import re
import shutil
import sys
import zipfile
from pathlib import Path

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

FIXED_LEAD_COLUMNS = [
    "First Name", "Last Name", "Email",
    "Phone Number (home)", "Phone Number (mobile)",
    "Gender", "Grade", "First Timers",
]
TRAILING_LABELS = ["Attendance Rate", "ID", "Dupe Check"]
CSV_ONLY_COLUMNS = [
    "Planning Center ID", "Birthdate",
    "Primary Contact Name", "Primary Contact Email",
    "Completed Thrive", "Baptized?", "Last served",
]
PLACEHOLDER_MARKER = "Unknown"

DATE_FORMATS = ["%d-%b-%y", "%d-%b-%Y", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%B %d, %Y"]


# ============================================================================
# Column-letter helpers
# ============================================================================

def col_to_letters(idx):
    """1-indexed column number -> Excel column letters."""
    letters = ""
    while idx > 0:
        idx, rem = divmod(idx - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def letters_to_col(letters):
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - 64)
    return idx


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref)
    return m.group(1), int(m.group(2))


# ============================================================================
# Minimal XML helpers (regex-based -- deliberately not using a full XML
# library to write, so we can touch exactly the bytes we mean to and
# leave everything else in the file untouched)
# ============================================================================

def get_shared_strings(xml_text):
    """Return list of shared strings (plain text only, good enough for
    the label cells we need to locate -- doesn't handle rich-text runs,
    which none of our target labels use)."""
    items = re.findall(r"<si>(.*?)</si>", xml_text, re.S)
    out = []
    for item in items:
        texts = re.findall(r"<t[^>]*>(.*?)</t>", item, re.S)
        out.append("".join(texts))
    return out


def unescape_xml(s):
    return (s.replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&apos;", "'")
             .replace("&amp;", "&"))


def cell_text(cell_xml, shared_strings):
    """Resolve a <c>...</c> element's display text, for t='s' or t='inlineStr'."""
    if cell_xml is None:
        return None
    t_match = re.search(r'\bt="([^"]+)"', cell_xml)
    ctype = t_match.group(1) if t_match else None
    if ctype == "s":
        v = re.search(r"<v>(\d+)</v>", cell_xml)
        if not v:
            return None
        return unescape_xml(shared_strings[int(v.group(1))])
    if ctype == "inlineStr":
        m = re.search(r"<t[^>]*>(.*?)</t>", cell_xml, re.S)
        return unescape_xml(m.group(1)) if m else None
    v = re.search(r"<v>(.*?)</v>", cell_xml, re.S)
    return unescape_xml(v.group(1)) if v else None


def find_cell(row_xml, ref):
    m = re.search(r'<c r="' + re.escape(ref) + r'"[^>]*?(?:/>|>.*?</c>)', row_xml, re.S)
    return m.group(0) if m else None


def get_row_xml(sheet_xml, row_num):
    m = re.search(r'<row r="' + str(row_num) + r'"[^>]*>.*?</row>', sheet_xml, re.S)
    return m.group(0) if m else None


def cell_style(cell_xml):
    if cell_xml is None:
        return None
    m = re.search(r'\bs="(\d+)"', cell_xml)
    return m.group(1) if m else None


# ============================================================================
# Locate sheets by name via workbook.xml + rels
# ============================================================================

def locate_sheets(extract_dir):
    wb_xml = (extract_dir / "xl" / "workbook.xml").read_text(encoding="utf-8")
    rels_xml = (extract_dir / "xl" / "_rels" / "workbook.xml.rels").read_text(encoding="utf-8")

    sheets = {}  # name -> {"sheetId":..., "rId":...}
    for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"[^>]*/>', wb_xml):
        sheets[m.group(1)] = m.group(2)

    rel_targets = {}
    for m in re.finditer(r'<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml):
        rel_targets[m.group(1)] = m.group(2)

    result = {}
    for name, rid in sheets.items():
        target = rel_targets.get(rid)
        if target:
            result[name] = extract_dir / "xl" / target.replace("worksheets/", "worksheets/")
    return result, wb_xml


# ============================================================================
# Read the template's current Raw Data structure
# ============================================================================

class RawDataLayout:
    def __init__(self, sheet_path):
        self.path = sheet_path
        self.xml = sheet_path.read_text(encoding="utf-8")

        row1 = get_row_xml(self.xml, 1)
        if row1 is None:
            raise SystemExit("Could not find header row 1 on 'Raw Data' -- template structure has changed more than this script expects.")

        # locate trailing label columns by header text
        header_cells = re.findall(r'<c r="([A-Z]+)1"[^>]*?(?:/>|>.*?</c>)', row1, re.S)
        # rebuild full cell xml per column letter for header row
        col_cells = {}
        for m in re.finditer(r'<c r="([A-Z]+)1"[^>]*?(?:/>|>.*?</c>)', row1, re.S):
            col_cells[m.group(1)] = m.group(0)

        ss_path = sheet_path.parent.parent / "sharedStrings.xml"
        self.shared_strings = get_shared_strings(ss_path.read_text(encoding="utf-8")) if ss_path.exists() else []

        ar_col = id_col = dupe_col = None
        for letters, cxml in col_cells.items():
            text = cell_text(cxml, self.shared_strings)
            if text == "Attendance Rate":
                ar_col = letters
            elif text == "ID":
                id_col = letters
            elif text == "Dupe Check":
                dupe_col = letters
        if not ar_col:
            raise SystemExit("Could not find an 'Attendance Rate' column header on 'Raw Data' -- template structure has changed.")

        ar_idx = letters_to_col(ar_col)
        self.spacer_col_idx = ar_idx - 1          # "M" -- blank buffer column
        self.ar_col_idx = ar_idx                  # "N"
        self.id_col_idx = letters_to_col(id_col) if id_col else ar_idx + 1
        self.dupe_col_idx = letters_to_col(dupe_col) if dupe_col else ar_idx + 2

        self.week_start_idx = len(FIXED_LEAD_COLUMNS) + 1  # column I = 9
        self.week_end_idx = self.spacer_col_idx - 1        # last week column
        self.n_weeks_current = self.week_end_idx - self.week_start_idx + 1
        if self.n_weeks_current < 1:
            raise SystemExit("Could not locate any week columns between 'First Timers' and 'Attendance Rate' on 'Raw Data'.")

        # style ids to reuse (read from the template, never hardcoded)
        self.date_cell_style = cell_style(col_cells.get(col_to_letters(self.week_start_idx)))
        self.spacer_style = cell_style(col_cells.get(col_to_letters(self.spacer_col_idx)))
        n2_cell = find_cell(get_row_xml(self.xml, 2) or "", f"{ar_col}2")
        self.ar_data_style = cell_style(n2_cell)
        self.ar_header_style = cell_style(col_cells.get(ar_col))

        # find the real-data / placeholder-row boundary and the
        # trailing blank rows, by scanning column A
        self.last_real_row = None
        self.last_placeholder_row = None
        r = 2
        while True:
            row_xml = get_row_xml(self.xml, r)
            if row_xml is None:
                break
            a_cell = find_cell(row_xml, f"A{r}")
            text = cell_text(a_cell, self.shared_strings)
            if text is None or text == "":
                break
            if text == PLACEHOLDER_MARKER:
                if self.last_placeholder_row is None:
                    self.last_real_row = r - 1
                self.last_placeholder_row = r
            r += 1
        if self.last_placeholder_row is None:
            # no placeholder block found -- whole populated range is "real"
            self.last_real_row = r - 1
            self.last_placeholder_row = r - 1
        self.end_of_data_row = r - 1  # last non-blank row of any kind

        # capture the placeholder rows verbatim (raw XML), for reuse
        self.placeholder_rows_xml = []
        if self.last_placeholder_row and self.last_real_row and self.last_placeholder_row > self.last_real_row:
            for pr in range(self.last_real_row + 1, self.last_placeholder_row + 1):
                self.placeholder_rows_xml.append(get_row_xml(self.xml, pr))

        self.num_placeholder_rows = len(self.placeholder_rows_xml)


# ============================================================================
# Read cleaned CSV
# ============================================================================

def parse_date_header(s):
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def excel_serial(dt):
    epoch = datetime.date(1899, 12, 30)
    return (dt.date() - epoch).days


def load_cleaned_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    week_cols = [c for c in fieldnames if c not in FIXED_LEAD_COLUMNS and c not in CSV_ONLY_COLUMNS and c not in TRAILING_LABELS]
    week_dates = []
    for w in week_cols:
        dt = parse_date_header(w)
        if dt is None:
            raise SystemExit(
                f"Could not parse '{w}' as a date. Recognized formats: {DATE_FORMATS}. "
                f"Rename the column header to a recognized format, or extend DATE_FORMATS in this script."
            )
        week_dates.append(dt)
    return rows, week_cols, week_dates


# ============================================================================
# Build the new Raw Data sheet XML
# ============================================================================

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def inline_cell(ref, text, style=None):
    if text is None or text == "":
        return ""
    s_attr = f' s="{style}"' if style else ""
    return f'<c r="{ref}"{s_attr} t="inlineStr"><is><t xml:space="preserve">{esc(text)}</t></is></c>'


def bool_cell(ref, val):
    return f'<c r="{ref}" t="b"><v>{1 if val else 0}</v></c>'


def build_raw_data_rows(layout, rows, week_cols, week_dates, warnings):
    """Rebuild the ENTIRE Raw Data sheetData from scratch -- including
    row 1 -- rather than patching the template's existing rows in
    place. This matters when the week count changes: the spacer /
    Attendance Rate / ID / Dupe Check columns all need to shift right
    to make room for extra week columns (or left, for fewer), so their
    column positions are computed fresh for THIS run rather than reused
    from wherever the template happened to have them. The three helper
    formulas (Attendance Rate, ID, Dupe Check) are likewise always
    constructed fresh from the live column letters, rather than
    generalized from the template's literal formula text -- template
    formula text hardcodes column letters that go stale the moment the
    week span moves, which is exactly the bug this replaced.
    """
    n = len(rows)
    n_weeks_new = len(week_cols)
    if n_weeks_new < 1:
        raise SystemExit("Cleaned CSV has no week columns.")

    week_letters = [col_to_letters(layout.week_start_idx + i) for i in range(n_weeks_new)]
    spacer_col = layout.week_start_idx + n_weeks_new
    ar_col = spacer_col + 1
    id_col = ar_col + 1
    dupe_col = ar_col + 2
    spacer_letters = col_to_letters(spacer_col)
    ar_letters = col_to_letters(ar_col)
    id_letters = col_to_letters(id_col)
    dupe_letters = col_to_letters(dupe_col)
    last_col_letters = col_to_letters(dupe_col)

    if n_weeks_new != layout.n_weeks_current:
        warnings.append(
            f"Week count changed ({layout.n_weeks_current} -> {n_weeks_new}). Header dates, and every column "
            f"after the week columns (spacer/Attendance Rate/ID/Dupe Check), shifted accordingly. Double-check "
            f"the Performance tab's week-count-dependent formulas (anything using IF($G$28=4,...) or similar) "
            f"still make sense for {n_weeks_new} weeks -- this script does NOT edit Performance formulas."
        )

    # ---- header row (rebuilt fresh) ----
    header_xml = get_row_xml(layout.xml, 1)
    lead_cells = []
    for col_idx in range(1, len(FIXED_LEAD_COLUMNS) + 1):
        letters = col_to_letters(col_idx)
        old_cell = find_cell(header_xml, f"{letters}1")
        if old_cell:
            lead_cells.append(old_cell)
    date_cells = []
    for i, letters in enumerate(week_letters):
        serial = excel_serial(week_dates[i])
        style_attr = f' s="{layout.date_cell_style}"' if layout.date_cell_style else ""
        date_cells.append(f'<c r="{letters}1"{style_attr}><v>{serial}</v></c>')
    spacer_style_attr = f' s="{layout.spacer_style}"' if layout.spacer_style else ""
    trailer_cells = [
        f'<c r="{spacer_letters}1"{spacer_style_attr}/>',
        f'<c r="{ar_letters}1" s="{layout.ar_header_style}" t="inlineStr"><is><t>Attendance Rate</t></is></c>' if layout.ar_header_style
        else f'<c r="{ar_letters}1" t="inlineStr"><is><t>Attendance Rate</t></is></c>',
        f'<c r="{id_letters}1" t="inlineStr"><is><t>ID</t></is></c>',
        f'<c r="{dupe_letters}1" t="inlineStr"><is><t>Dupe Check</t></is></c>',
    ]
    new_header = (f'<row r="1" spans="1:{dupe_col}" x14ac:dyDescent="0.25">'
                  + "".join(lead_cells) + "".join(date_cells) + "".join(trailer_cells) + "</row>")

    rows_xml = [new_header]

    # ---- real student rows ----
    concat_vals = [f"{r.get('First Name', '')}{r.get('Last Name', '')}" for r in rows]
    for idx, r in enumerate(rows):
        rn = idx + 2
        cells = []
        cells.append(inline_cell(f"A{rn}", r.get("First Name", "")))
        cells.append(inline_cell(f"B{rn}", r.get("Last Name", "")))
        cells.append(inline_cell(f"C{rn}", r.get("Email", "")))
        cells.append(inline_cell(f"D{rn}", r.get("Phone Number (home)", "")))
        cells.append(inline_cell(f"E{rn}", r.get("Phone Number (mobile)", "")))
        cells.append(inline_cell(f"F{rn}", r.get("Gender", "")))
        cells.append(inline_cell(f"G{rn}", r.get("Grade", "")))
        cells.append(inline_cell(f"H{rn}", r.get("First Timers", "")))
        for i, letters in enumerate(week_letters):
            val = str(r.get(week_cols[i], "")).strip().upper() == "TRUE"
            cells.append(bool_cell(f"{letters}{rn}", val))
        cells.append(f'<c r="{spacer_letters}{rn}"{spacer_style_attr}/>')

        ar_style_attr = f' s="{layout.ar_data_style}"' if layout.ar_data_style else ""
        formula = f'((COUNTIF({week_letters[0]}{rn}:{spacer_letters}{rn},"TRUE")/Performance!$G$28))'
        attended = sum(1 for i in range(n_weeks_new) if str(r.get(week_cols[i], "")).strip().upper() == "TRUE")
        rate = round(attended / n_weeks_new, 6) if n_weeks_new else 0
        cells.append(f'<c r="{ar_letters}{rn}"{ar_style_attr}><f>{formula}</f><v>{rate}</v></c>')

        id_formula = f"_xlfn.CONCAT(A{rn},B{rn})"
        concat = concat_vals[idx]
        cells.append(f'<c r="{id_letters}{rn}" t="str"><f>{esc(id_formula)}</f><v>{esc(concat)}</v></c>')

        dupe_formula = f'IF({id_letters}{rn}={id_letters}{rn + 1},"Duplicate","---")'
        next_concat = concat_vals[idx + 1] if idx + 1 < len(concat_vals) else None
        dup = "Duplicate" if (next_concat is not None and next_concat == concat) else "---"
        cells.append(f'<c r="{dupe_letters}{rn}" t="str"><f>{esc(dupe_formula)}</f><v>{dup}</v></c>')

        rows_xml.append(f'<row r="{rn}" spans="1:{dupe_col}" x14ac:dyDescent="0.25">' + "".join(c for c in cells if c) + "</row>")

    next_free_row = n + 2

    # ---- placeholder rows (carried forward from the template, unchanged
    #      in spirit -- shifted to the new row numbers and remapped onto
    #      the new week columns) ----
    if layout.placeholder_rows_xml:
        if n_weeks_new != layout.n_weeks_current:
            warnings.append(
                f"Carried the {layout.num_placeholder_rows} placeholder ('Unknown') headcount rows forward, but "
                f"remapped their weekly TRUE/FALSE pattern from {layout.n_weeks_current} to {n_weeks_new} week "
                f"columns (extra weeks left blank, dropped weeks truncated). Worth a manual look if that matters."
            )
        old_week_letters = [col_to_letters(layout.week_start_idx + i) for i in range(layout.n_weeks_current)]
        for i, old_row_xml in enumerate(layout.placeholder_rows_xml):
            old_row_num = layout.last_real_row + 1 + i
            new_row_num = next_free_row + i
            cells = []
            for col_idx in range(1, len(FIXED_LEAD_COLUMNS) + 1):
                letters = col_to_letters(col_idx)
                old_cell = find_cell(old_row_xml, f"{letters}{old_row_num}")
                if old_cell:
                    cells.append(old_cell.replace(f'r="{letters}{old_row_num}"', f'r="{letters}{new_row_num}"'))
            for wi, new_letters in enumerate(week_letters):
                old_cell = None
                if wi < len(old_week_letters):
                    old_cell = find_cell(old_row_xml, f"{old_week_letters[wi]}{old_row_num}")
                if old_cell and 't="b"' in old_cell:
                    cells.append(old_cell.replace(f'r="{old_week_letters[wi]}{old_row_num}"', f'r="{new_letters}{new_row_num}"'))
                else:
                    cells.append(f'<c r="{new_letters}{new_row_num}"/>')
            cells.append(f'<c r="{spacer_letters}{new_row_num}"{spacer_style_attr}/>')
            rows_xml.append(f'<row r="{new_row_num}" spans="1:{dupe_col}" x14ac:dyDescent="0.25">' + "".join(cells) + "</row>")
        next_free_row += layout.num_placeholder_rows

    last_row_num = next_free_row - 1
    return "".join(rows_xml), last_row_num, dupe_col


# ============================================================================
# Assemble the full sheet XML replacement
# ============================================================================

def patch_raw_data_sheet(layout, new_rows_xml, last_row_num, dupe_col):
    content = layout.xml
    dim_match = re.search(r'<dimension ref="[^"]*"/>', content)
    if dim_match:
        content = content.replace(dim_match.group(0), f'<dimension ref="A1:{col_to_letters(dupe_col)}{last_row_num}"/>')

    sd_match = re.search(r"<sheetData>.*?</sheetData>", content, re.S)
    if not sd_match:
        raise SystemExit("Could not find <sheetData> in 'Raw Data' sheet XML.")
    content = content.replace(sd_match.group(0), "<sheetData>" + new_rows_xml + "</sheetData>")

    sort_match = re.search(r'<sortState ref="[^"]*"', content)
    if sort_match:
        last_real_row = last_row_num - layout.num_placeholder_rows
        last_col = col_to_letters(dupe_col - 1)  # dupe check col excluded from sort range historically
        content = content.replace(sort_match.group(0), f'<sortState ref="A2:{last_col}{last_real_row}"')

    return content


def find_stale_raw_data_refs(sheets_to_scan, moved_columns, warnings):
    """When the week count changes, the spacer / Attendance Rate / ID /
    Dupe Check columns on 'Raw Data' shift right (or left) to make room.
    Any OTHER sheet's formula that references those columns on 'Raw
    Data' by a hardcoded letter (e.g. COUNTIF('Raw Data'!N:N,...) to
    mean "Attendance Rate") does NOT move with them -- it keeps
    pointing at the old letter, which now holds a different column (or
    nothing), and returns a silently wrong number rather than a formula
    error. This scans the given sheets for exactly that pattern and
    names the specific cells affected, since a generic "double check
    Performance formulas" warning is not actionable enough to find
    these by hand across a sheet with 100+ Raw-Data-referencing
    formulas.

    moved_columns: dict of old_letter -> (purpose, new_letter), for
    columns whose position actually changed.
    """
    if not moved_columns:
        return
    ref_re = re.compile(r"'Raw Data'!\$?([A-Z]+)\$?(\d*)(?::\$?([A-Z]+)\$?(\d*))?")
    for sheet_name, sheet_xml in sheets_to_scan:
        for cell_m in re.finditer(r'<c r="([A-Z]+\d+)"[^>]*?(?:/>|>.*?</c>)', sheet_xml, re.S):
            cell_ref, cell_xml = cell_m.group(1), cell_m.group(0)
            f_m = re.search(r"<f[^>]*>(.*?)</f>", cell_xml, re.S)
            if not f_m:
                continue
            formula = unescape_xml(f_m.group(1))
            # collect each stale (old_letter -> purpose/new_letter) hit at
            # most once per cell, even if the same column is referenced
            # more than once in the formula (e.g. two COUNTIFS calls, or
            # a "M:M" range matching the same letter on both sides)
            stale_here = {}
            for ref_m in ref_re.finditer(formula):
                for col in (ref_m.group(1), ref_m.group(3)):
                    if col and col in moved_columns:
                        stale_here[col] = moved_columns[col]
            if stale_here:
                detail = "; ".join(
                    f"{old} (OLD {purpose} column, now {new}) " for old, (purpose, new) in stale_here.items()
                )
                warnings.append(
                    f"STALE COLUMN REFERENCE: {sheet_name}!{cell_ref} formula references "
                    f"'Raw Data'!{detail}after this month's week-count change -- will silently "
                    f"return a wrong number, not a formula error. Formula: {formula} -- needs a "
                    f"manual fix on the {sheet_name} tab."
                )


def patch_performance_weeks(perf_xml, shared_strings, n_weeks_new, warnings):
    label_row = None
    for m in re.finditer(r'<row r="(\d+)"[^>]*>.*?</row>', perf_xml, re.S):
        row_xml = m.group(0)
        for cm in re.finditer(r'<c r="([A-Z]+)(\d+)"[^>]*?(?:/>|>.*?</c>)', row_xml, re.S):
            if cell_text(cm.group(0), shared_strings) == "Number of Weeks":
                label_row = (cm.group(1), int(cm.group(2)))
                break
        if label_row:
            break
    if not label_row:
        raise SystemExit("Could not find a 'Number of Weeks' label on the Performance tab -- template structure has changed.")

    col_letters, row_num = label_row
    value_row_num = row_num + 1
    value_ref = f"{col_letters}{value_row_num}"
    value_row_xml = get_row_xml(perf_xml, value_row_num)
    old_cell = find_cell(value_row_xml, value_ref)
    if not old_cell:
        raise SystemExit(f"Found 'Number of Weeks' label but no value cell at {value_ref}.")
    style_attr = ""
    sm = re.search(r'\bs="(\d+)"', old_cell)
    if sm:
        style_attr = f' s="{sm.group(1)}"'
    new_cell = f'<c r="{value_ref}"{style_attr}><v>{n_weeks_new}</v></c>'
    perf_xml = perf_xml.replace(old_cell, new_cell)

    if n_weeks_new not in (4, 5):
        warnings.append(
            f"Number of Weeks is now {n_weeks_new}. Some Performance-tab formulas branch only on "
            f"IF($G${row_num + 1}=4, ...) style logic (4-week vs. 5-week months) -- worth a manual check "
            f"since this script never edits Performance formulas."
        )
    return perf_xml


def patch_print_pdf_title(pdf_xml, shared_strings, month_name, year, warnings):
    title_pattern = re.compile(r"^\d{4} \w+ Report$")
    target_ref = None
    for m in re.finditer(r'<c r="([A-Z]+\d+)"[^>]*?(?:/>|>.*?</c>)', pdf_xml, re.S):
        text = cell_text(m.group(0), shared_strings)
        if text and title_pattern.match(text):
            target_ref = m.group(1)
            old_cell_xml = m.group(0)
            break
    if not target_ref:
        warnings.append(
            "Could not find a Print PDF cell matching '<year> <month> Report' to update the title -- "
            "left the Print PDF tab's title untouched. Check it manually."
        )
        return pdf_xml

    style_attr = ""
    sm = re.search(r'\bs="(\d+)"', old_cell_xml)
    if sm:
        style_attr = f' s="{sm.group(1)}"'
    new_title = f"{year} {month_name} Report"
    new_cell = f'<c r="{target_ref}"{style_attr} t="inlineStr"><is><t>{esc(new_title)}</t></is></c>'
    return pdf_xml.replace(old_cell_xml, new_cell)


# ============================================================================
# calcChain / fullCalcOnLoad
# ============================================================================

def strip_calc_chain(extract_dir):
    calc_chain = extract_dir / "xl" / "calcChain.xml"
    if calc_chain.exists():
        calc_chain.unlink()

    ct_path = extract_dir / "[Content_Types].xml"
    ct = ct_path.read_text(encoding="utf-8")
    # NOTE: the calcChain ContentType value itself contains a "/"
    # (application/vnd...calcChain+xml), so a "stop at the next /" class
    # like [^/]* would never reach the closing "/>". Exclude only ">".
    ct2 = re.sub(r'<Override PartName="/xl/calcChain\.xml"[^>]*/>', "", ct)
    if ct2 != ct:
        ct_path.write_text(ct2, encoding="utf-8")

    rels_path = extract_dir / "xl" / "_rels" / "workbook.xml.rels"
    rels = rels_path.read_text(encoding="utf-8")
    rels2 = re.sub(r'<Relationship[^>]*calcChain[^>]*/>', "", rels)
    if rels2 != rels:
        rels_path.write_text(rels2, encoding="utf-8")

    wb_path = extract_dir / "xl" / "workbook.xml"
    wb = wb_path.read_text(encoding="utf-8")
    if "fullCalcOnLoad" not in wb:
        wb2 = re.sub(r"<calcPr([^/]*)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', wb)
        if wb2 == wb:
            # no calcPr element at all -- add one just before </workbook>
            wb2 = wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')
        wb_path.write_text(wb2, encoding="utf-8")


# ============================================================================
# Zip back up
# ============================================================================

def rezip(extract_dir, out_path):
    out_path = Path(out_path)
    if out_path.exists():
        out_path.unlink()
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(extract_dir.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(extract_dir))


# ============================================================================
# Main
# ============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True, help="starting .xlsx (normally last month's delivered workbook)")
    ap.add_argument("--data", required=True, help="cleaned CSV from cleanup_attendance.py")
    ap.add_argument("--out-xlsx", required=True)
    ap.add_argument("--out-pdf", help="optional -- also export a PDF (via a disposable LibreOffice copy; never affects the delivered .xlsx)")
    ap.add_argument("--month", help="override the auto-detected month name (e.g. September)")
    ap.add_argument("--year", type=int, help="override the auto-detected year (e.g. 2026)")
    ap.add_argument("--work-dir", help="scratch directory (default: alongside the output file)")
    args = ap.parse_args()

    warnings = []

    rows, week_cols, week_dates = load_cleaned_csv(args.data)
    if not rows:
        raise SystemExit("No data rows found in the cleaned CSV.")
    month_name = args.month or week_dates[0].strftime("%B")
    year = args.year or week_dates[0].year
    print(f"Loaded {len(rows)} cleaned students, {len(week_cols)} week columns -> {month_name} {year}")

    out_xlsx = Path(args.out_xlsx)
    work_dir = Path(args.work_dir) if args.work_dir else out_xlsx.parent / f".{out_xlsx.stem}_work"
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True)

    with zipfile.ZipFile(args.template) as zf:
        zf.extractall(work_dir)

    sheet_paths, _ = locate_sheets(work_dir)
    for needed in ("Raw Data", "Performance", "Print PDF"):
        if needed not in sheet_paths:
            raise SystemExit(f"Template is missing a sheet named '{needed}'.")

    layout = RawDataLayout(sheet_paths["Raw Data"])
    print(f"Template currently has {layout.n_weeks_current} week column(s), "
          f"{layout.last_real_row - 1} real student row(s), {layout.num_placeholder_rows} placeholder row(s).")

    new_rows_xml, last_row_num, dupe_col = build_raw_data_rows(layout, rows, week_cols, week_dates, warnings)
    new_raw_data_xml = patch_raw_data_sheet(layout, new_rows_xml, last_row_num, dupe_col)
    sheet_paths["Raw Data"].write_text(new_raw_data_xml, encoding="utf-8")

    # if the week count changed, the spacer/Attendance Rate/ID/Dupe Check
    # columns moved -- work out exactly which letters moved so any other
    # sheet's formula still pointing at the OLD letter can be named, not
    # just generically flagged (see find_stale_raw_data_refs docstring)
    n_weeks_new = len(week_cols)
    moved_columns = {}
    if n_weeks_new != layout.n_weeks_current:
        new_spacer_col = layout.week_start_idx + n_weeks_new
        new_ar_col = new_spacer_col + 1
        new_id_col = new_ar_col + 1
        new_dupe_col = new_ar_col + 2
        for old_idx, purpose, new_idx in (
            (layout.spacer_col_idx, "spacer", new_spacer_col),
            (layout.ar_col_idx, "Attendance Rate", new_ar_col),
            (layout.id_col_idx, "ID", new_id_col),
            (layout.dupe_col_idx, "Dupe Check", new_dupe_col),
        ):
            old_letters = col_to_letters(old_idx)
            new_letters = col_to_letters(new_idx)
            if old_letters != new_letters:
                moved_columns[old_letters] = (purpose, new_letters)

    perf_xml = sheet_paths["Performance"].read_text(encoding="utf-8")
    perf_xml = patch_performance_weeks(perf_xml, layout.shared_strings, len(week_cols), warnings)

    pdf_xml = sheet_paths["Print PDF"].read_text(encoding="utf-8")
    pdf_xml = patch_print_pdf_title(pdf_xml, layout.shared_strings, month_name, year, warnings)

    find_stale_raw_data_refs(
        [("Performance", perf_xml), ("Print PDF", pdf_xml)], moved_columns, warnings
    )

    sheet_paths["Performance"].write_text(perf_xml, encoding="utf-8")
    sheet_paths["Print PDF"].write_text(pdf_xml, encoding="utf-8")

    strip_calc_chain(work_dir)

    rezip(work_dir, out_xlsx)
    print(f"\nWrote {out_xlsx}")

    if warnings:
        print("\n" + "=" * 70)
        print(f"WARNINGS ({len(warnings)}) -- please review:")
        print("=" * 70)
        for w in warnings:
            print(f"  - {w}")

    if args.out_pdf:
        export_pdf(out_xlsx, args.out_pdf, work_dir)

    shutil.rmtree(work_dir, ignore_errors=True)


def export_pdf(xlsx_path, pdf_path, work_dir):
    """Render a PDF from a DISPOSABLE copy via LibreOffice's UNO API,
    forcing a genuine recalculation first. This never touches the
    delivered .xlsx -- only used to produce the print PDF."""
    import subprocess
    import time

    disposable = work_dir.parent / f".{Path(xlsx_path).stem}_pdf_disposable.xlsx"
    shutil.copy(xlsx_path, disposable)

    print(f"\nRendering PDF via a disposable LibreOffice copy (never the delivered xlsx)...")
    proc = subprocess.Popen(
        ["soffice", "--headless", "--invisible", "--nocrashreport", "--nodefault",
         "--norestore", "--nologo", "--nofirststartwizard",
         "--accept=socket,host=localhost,port=2002;urp;"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(6)
        script = f'''
import uno
from com.sun.star.beans import PropertyValue

def prop(name, value):
    p = PropertyValue(); p.Name = name; p.Value = value; return p

ctx = uno.getComponentContext()
resolver = ctx.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", ctx)
remote_ctx = resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext")
smgr = remote_ctx.ServiceManager
desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", remote_ctx)

doc = desktop.loadComponentFromURL("file://{disposable.resolve()}", "_blank", 0, (prop("Hidden", True),))
doc.calculateAll()

# Export only the "Print PDF" tab -- it's the one sheet with a defined
# print area (the report meant for distribution); Performance and Raw
# Data are working/data tabs, not part of the printed report. Hiding
# them (rather than deleting) is safe here: values were already
# calculated above, and hidden sheets simply don't emit PDF pages --
# formulas that reference them stay valid since the sheets still exist.
sheets = doc.Sheets
for sheet_name in sheets.ElementNames:
    if sheet_name != "Print PDF":
        sheets.getByName(sheet_name).IsVisible = False

doc.storeToURL("file://{Path(pdf_path).resolve()}", (prop("FilterName", "calc_pdf_Export"),))
doc.close(False)
print("PDF_OK")
'''
        script_path = work_dir.parent / "_export_pdf_uno.py"
        script_path.write_text(script, encoding="utf-8")
        result = subprocess.run([sys.executable, str(script_path)], capture_output=True, text=True, timeout=90)
        if "PDF_OK" not in result.stdout:
            print("PDF export may have failed:", result.stdout, result.stderr, file=sys.stderr)
        else:
            print(f"Wrote {pdf_path}")
        script_path.unlink(missing_ok=True)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        disposable.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
