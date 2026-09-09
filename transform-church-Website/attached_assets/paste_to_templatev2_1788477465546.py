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

    # The report period and year are auto-detected from the CSV's date
    # column headers: a single calendar month -> its name; several
    # months that fall within one calendar quarter -> "Q<n>" (so a
    # quarterly report -- 12+ week columns spanning e.g. April through
    # June -- is auto-labeled "Q2" with no extra flags). Override if the
    # dates are ambiguous, or you want a different label:
    #   --month September --year 2026
    #   --month Q2 --year 2026

WHAT THIS SCRIPT ASSUMES ABOUT THE TEMPLATE
--------------------------------------------
These are read from the template file itself each run, NOT hardcoded,
so a template that has drifted (different week count, different lead
columns, different style IDs, different sheet order) is handled
automatically -- including templates whose lead-column set isn't the
youth-ministry one at all (e.g. a young-adults template with Phone/
Birthdate/Gender/First Timers and no Email/Grade). What IS assumed --
and checked with a clear error rather than silently guessed at if
missing -- is the overall shape:
  - A raw-attendance sheet whose header row starts with "First Name"
    in A1 and includes an "Attendance Rate" column somewhere after it.
    This sheet is found by that column signature, NOT by a literal
    name -- the real monthly workbooks name it "<Month> Attendance"
    and rename it every month (see "TAB RENAMING" below), so a
    hardcoded "Raw Data" name would fail on every one of them. A sheet
    literally named "Raw Data" is still supported for older/test
    templates that use it.
  - Whatever columns come between A1 and the week columns are this
    template's LEAD columns -- however many there are, whatever
    they're called. The boundary is found by column TYPE, not a
    hardcoded count: a week-header cell holds a bare date serial (no
    declared cell type), while every lead-column header is text (a
    shared string or inline string) -- so the week columns are the
    contiguous run of bare-numeric header cells ending right before
    the blank spacer column that precedes Attendance Rate. Each lead
    column is then handled according to what its OWN row-2 template
    cell actually is: a plain value (pasted from the cleaned CSV's
    same-named column, case-insensitively) or a formula (regenerated
    per row from the template's own formula shape, exactly like the
    Attendance Rate/trailing helper formulas below -- this is what
    lets a lead column that's itself a VLOOKUP into another sheet,
    e.g. a young-adults template's Thrive/Serving/Baptized columns,
    come through correctly without this script needing to know
    anything about that other sheet).
  - Whatever columns come after Attendance Rate, for as long as each
    one's row-2 template cell is a formula (stopping at the first one
    that isn't), are this template's TRAILING helper columns --
    however many there are, whatever they're called (the youth
    template's ID + Dupe Check pair; a young-adults template's
    four-column Name/Key/Age/Group block; anything else). Each is
    regenerated per row from its own template formula shape.
  - Real student rows start at row 2; a block of placeholder rows
    whose First Name is literally "Unknown" follows immediately after
    (carried forward unchanged -- these feed a real "Unknown Age"
    weekly headcount bucket on the Performance tab).
  - A sheet named "Performance" with a cell literally labeled
    "Number of Weeks" one row above the value cell it feeds.
  - A sheet named "Print PDF" with exactly one cell containing the
    report title in the form "<year> <month> Report", and a defined
    print area (used to identify it as the one sheet that belongs in
    the exported PDF -- Performance and the raw-attendance sheet are
    working tabs and are excluded from the PDF).

WHAT'S STILL OUT OF SCOPE
--------------------------
This script only ever touches the raw-attendance sheet, Performance,
and Print PDF. A template where a lead or trailing column's formula
reaches into a SECOND sheet (e.g. a young-adults template's Thrive/
Serving/Baptized VLOOKUP into a separate "Attendee Data" sheet) will
have that formula faithfully reproduced (so it keeps pointing at that
other sheet correctly), but this script does not refresh that other
sheet's own rows -- it'll show whatever that sheet currently has,
stale or not. This script warns when it detects a lead/trailing
formula referencing another sheet, naming the sheet, so that's never
silent. Refreshing a second linked sheet needs a dedicated script
built for that template's specific second-sheet shape (see
paste_ya_data.py for the young-adults template's version of that).

TAB RENAMING
------------
The project's own workflow calls for renaming the raw-attendance tab
each month (e.g. "June Attendance" -> "July Attendance") and updating
every formula elsewhere in the workbook (Performance, Print PDF,
People -- real templates have been seen with 500+ such formulas on
Performance alone) that references the old tab name literally, so
nothing is left pointing at a stale sheet name. This script does that
automatically: it detects the raw-attendance sheet's current name,
works out the new name by swapping the leading word of an "<X>
Attendance"-style name for this month's period label (a plain "Raw
Data" name is left alone, for templates that don't use per-month tab
names), renames it in workbook.xml, and rewrites every literal
'<old name>'! reference in every OTHER sheet (and in workbook.xml's
defined names, and docProps/app.xml's title list) to the new name.
It reports how many references it updated. This happens BEFORE the
stale-column-reference scan below, so that scan checks references
against the new name, not the old one.

A NOTE ON WEEK-COUNT CHANGES
-----------------------------
When the new month has a different number of service weeks than the
starting file, the spacer / Attendance Rate / trailing-helper columns
on Raw Data all shift right (or left) by the same amount to make room
-- since the lead-column count never depends on the week count, every
column from the first week column onward moves by exactly the change
in week count, and this script computes that shift once and applies
it uniformly (including inside trailing-column formulas that
reference another trailing column, e.g. a Dupe Check comparing an
ID-like column across rows). This script does NOT hunt down and fix
every other formula on Performance or Print PDF that references those
columns by a hardcoded letter (e.g. COUNTIF('Raw Data'!N:N,...)) --
there can be 100+ such formulas, and silently rewriting them is
exactly the kind of "touches formula ranges on the Performance tab"
situation the project brief says to flag rather than do silently.
Instead, this script scans for exactly that pattern and lists every
specific cell affected in its warnings output, since those formulas
return a wrong number rather than a formula error and are otherwise
very easy to miss.
"""

import argparse
import csv
import datetime
import os
import re
import shutil
import socket
import sys
import zipfile
from pathlib import Path

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

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


def cell_formula_text(cell_xml):
    """Raw <f>...</f> text of a cell, unescaped -- or None if it has no formula."""
    if cell_xml is None:
        return None
    m = re.search(r"<f[^>]*>(.*?)</f>", cell_xml, re.S)
    return unescape_xml(m.group(1)) if m else None


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
# Find the raw-attendance sheet by its column signature, not its name --
# real monthly workbooks name this tab "<Month> Attendance" and rename it
# every month, they never call it literally "Raw Data". A hardcoded
# "Raw Data" lookup fails on every one of those real files (and would
# otherwise leave a stale-named tab whose formulas elsewhere in the
# workbook never get updated) -- see the module docstring's "TAB
# RENAMING" section.
# ============================================================================

def _sheet_header_texts(sheet_xml, shared_strings):
    row1 = get_row_xml(sheet_xml, 1)
    if row1 is None:
        return None
    texts = {}
    for m in re.finditer(r'<c r="([A-Z]+1)"[^>]*?(?:/>|>.*?</c>)', row1, re.S):
        t = cell_text(m.group(0), shared_strings)
        if t:
            texts[m.group(1)] = t
    return texts


def find_attendance_sheet_name(sheet_paths):
    """Detect the raw-attendance sheet by its header-row signature
    rather than assuming a literal name. Only "First Name" in A1 plus
    an "Attendance Rate" column are required -- ID and Dupe Check are
    genuinely optional (a real quarterly template has been seen with
    Attendance Rate as the only trailing column, no ID/Dupe Check at
    all; RawDataLayout already tolerates that). Prefers an exact "Raw
    Data" match if one exists (older/test templates that genuinely use
    that name), and otherwise expects exactly one sheet to match."""
    ss_path = None
    shared_strings = []
    candidates = []
    for name, path in sheet_paths.items():
        sheet_xml = path.read_text(encoding="utf-8")
        if ss_path is None:
            ss_path = path.parent.parent / "sharedStrings.xml"
            shared_strings = get_shared_strings(ss_path.read_text(encoding="utf-8")) if ss_path.exists() else []
        headers = _sheet_header_texts(sheet_xml, shared_strings)
        if not headers:
            continue
        header_texts = set(headers.values())
        if headers.get("A1") == "First Name" and "Attendance Rate" in header_texts:
            candidates.append(name)

    if "Raw Data" in candidates:
        return "Raw Data"
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise SystemExit(
            f"Found more than one sheet that looks like the raw-attendance tab (header row starting "
            f"'First Name' and including an Attendance Rate column): {candidates}. Rename the extra "
            f"one in the working file so only the real one matches, then re-run."
        )
    raise SystemExit(
        "Could not find the raw-attendance sheet -- looked for a sheet whose header row starts 'First "
        "Name' and includes an Attendance Rate column (this month's tab is expected to be named like "
        "'July Attendance' or 'Raw Data' -- either is fine, this script detects it by its columns, not "
        "its name). Template structure has changed more than this script expects."
    )


def compute_new_sheet_name(old_name, period_label):
    """Match the project's tab-naming convention (e.g. "June Attendance"
    -> "July Attendance"): swap the leading word of an "<X> Attendance"
    -style name for this month's/quarter's period label. A name that
    doesn't fit that pattern (e.g. a literal "Raw Data", used by
    older/test templates that don't rename the tab monthly) is left
    unchanged."""
    m = re.match(r"^(\S+)( Attendance)$", old_name)
    if not m:
        return old_name
    return f"{period_label}{m.group(2)}"


def rename_attendance_sheet_everywhere(work_dir, sheet_paths, attendance_sheet_name, new_name):
    """Rename the raw-attendance tab in workbook.xml and rewrite every
    literal '<old name>'! formula reference to it in every OTHER sheet
    (Performance, Print PDF, People, Planning, ...), in workbook.xml's
    own defined names (e.g. a hidden _xlnm._FilterDatabase scoped to the
    sheet itself), and in docProps/app.xml's sheet-title list -- so
    nothing is left pointing at a stale sheet name (the project's own
    "update every formula elsewhere... that references the old tab name
    by literal text" requirement). Returns the number of formula
    references updated. A no-op (returns 0) if the name isn't changing.
    """
    old_name = attendance_sheet_name
    if old_name == new_name:
        return 0

    wb_path = work_dir / "xl" / "workbook.xml"
    wb_xml = wb_path.read_text(encoding="utf-8")
    old_tag = f'<sheet name="{old_name}"'
    new_tag = f'<sheet name="{new_name}"'
    if wb_xml.count(old_tag) != 1:
        raise SystemExit(
            f"Expected exactly one <sheet name=\"{old_name}\"...> entry in workbook.xml to rename, found "
            f"{wb_xml.count(old_tag)} -- template structure has changed more than this script expects."
        )
    wb_xml = wb_xml.replace(old_tag, new_tag, 1)

    old_ref = f"'{old_name}'!"
    new_ref = f"'{new_name}'!"
    total_refs = wb_xml.count(old_ref)
    wb_xml = wb_xml.replace(old_ref, new_ref)
    wb_path.write_text(wb_xml, encoding="utf-8")

    for name, path in sheet_paths.items():
        if name == old_name:
            continue  # the attendance sheet's own formulas don't qualify with its own sheet name
        text = path.read_text(encoding="utf-8")
        n = text.count(old_ref)
        if n:
            path.write_text(text.replace(old_ref, new_ref), encoding="utf-8")
            total_refs += n

    app_path = work_dir / "docProps" / "app.xml"
    if app_path.exists():
        app_xml = app_path.read_text(encoding="utf-8")
        old_title = f"<vt:lpstr>{old_name}</vt:lpstr>"
        new_title = f"<vt:lpstr>{new_name}</vt:lpstr>"
        if old_title in app_xml:
            app_path.write_text(app_xml.replace(old_title, new_title, 1), encoding="utf-8")

    return total_refs


# ============================================================================
# Read the template's current Raw Data structure
# ============================================================================

class LeadColumnSpec:
    """One lead column (before the week columns) as this template's own
    row-2 actually has it -- either a plain value (pasted from the
    cleaned CSV's same-named column) or a formula (regenerated per row,
    exactly like the trailing helper columns). A plain-value column is
    further flagged is_date_value when the template's OWN row-2 example
    for it is a bare numeric cell (an Excel date serial, no declared
    type) rather than text -- e.g. a Birthdate column -- so the CSV's
    text date gets converted to a serial instead of pasted as a literal
    string a downstream formula (e.g. DATEDIF) couldn't use."""
    __slots__ = ("idx", "letters", "header_text", "header_cell", "style", "type_attr", "formula", "is_date_value")

    def __init__(self, idx, letters, header_text, header_cell, style, type_attr, formula, is_date_value=False):
        self.idx = idx
        self.letters = letters
        self.header_text = header_text
        self.header_cell = header_cell
        self.style = style
        self.type_attr = type_attr
        self.formula = formula
        self.is_date_value = is_date_value


class TrailingColumnSpec:
    """One trailing helper column (after Attendance Rate) -- always a
    formula; found by position, not by a hardcoded name, since different
    templates have entirely different trailing-column sets (the youth
    template's ID + Dupe Check pair vs. a young-adults template's four-
    column Name/Key/Age/Group block)."""
    __slots__ = ("letters", "header_cell", "style", "type_attr", "formula")

    def __init__(self, letters, header_cell, style, type_attr, formula):
        self.letters = letters
        self.header_cell = header_cell
        self.style = style
        self.type_attr = type_attr
        self.formula = formula


def cell_type_attr(cell_xml):
    """The cell's declared t="..." attribute verbatim (e.g. t="str",
    t="b"), so a regenerated formula cell keeps the same declared type as
    the template's own example -- avoids a mismatched-type formula-error
    flash before fullCalcOnLoad's forced recalculation resolves it."""
    if cell_xml is None:
        return ""
    m = re.search(r'\bt="([^"]+)"', cell_xml)
    return f' t="{m.group(1)}"' if m else ""


def is_bare_numeric_cell(cell_xml):
    """True for a cell holding a plain number with no declared cell type
    -- a bare Excel date serial always looks like this (whether it's a
    week-column HEADER, or a lead column's row-2 DATA example, e.g.
    Birthdate). Text always has a declared type: a shared string
    (t="s") or an inline string (t="inlineStr"). This is used both to
    find the week-column run (without assuming how many lead columns
    precede it or what they're named) and to detect which plain-value
    lead columns expect a date serial rather than literal text."""
    if cell_xml is None:
        return False
    if re.search(r'\bt="[^"]+"', cell_xml):
        return False
    return "<v>" in cell_xml


def relocate_cell_ref(cell_xml, old_ref, new_ref):
    """Return cell_xml with its r="..." changed from old_ref to new_ref,
    leaving style/type/value/formula untouched -- used to shift a
    column's header (or a placeholder row's cell) to a new position
    without altering its content."""
    if cell_xml is None:
        return None
    return cell_xml.replace(f'r="{old_ref}"', f'r="{new_ref}"', 1)


class RawDataLayout:
    def __init__(self, sheet_path):
        self.path = sheet_path
        self.xml = sheet_path.read_text(encoding="utf-8")

        row1 = get_row_xml(self.xml, 1)
        if row1 is None:
            raise SystemExit("Could not find header row 1 on the raw-attendance sheet -- template structure has changed more than this script expects.")

        # rebuild full cell xml per column letter for header row
        col_cells = {}
        for m in re.finditer(r'<c r="([A-Z]+)1"[^>]*?(?:/>|>.*?</c>)', row1, re.S):
            col_cells[m.group(1)] = m.group(0)
        self.header_cells = col_cells

        ss_path = sheet_path.parent.parent / "sharedStrings.xml"
        self.shared_strings = get_shared_strings(ss_path.read_text(encoding="utf-8")) if ss_path.exists() else []

        if col_cells.get("A") is None or cell_text(col_cells.get("A"), self.shared_strings) != "First Name":
            raise SystemExit("Expected 'First Name' in A1 of the raw-attendance sheet -- template structure has changed.")

        ar_col = None
        for letters, cxml in col_cells.items():
            if cell_text(cxml, self.shared_strings) == "Attendance Rate":
                ar_col = letters
                break
        if not ar_col:
            raise SystemExit("Could not find an 'Attendance Rate' column header on the raw-attendance sheet -- template structure has changed.")

        ar_idx = letters_to_col(ar_col)
        self.spacer_col_idx = ar_idx - 1          # blank buffer column immediately before Attendance Rate
        self.ar_col_idx = ar_idx

        # the week-column run is the contiguous block of bare-numeric
        # (undeclared-type) header cells ending right before the spacer
        # column -- however many lead columns precede it, whatever
        # they're called, this finds the boundary from the header cells'
        # own TYPE rather than a hardcoded lead-column count
        self.week_end_idx = self.spacer_col_idx - 1
        idx = self.week_end_idx
        while idx >= 1 and is_bare_numeric_cell(col_cells.get(col_to_letters(idx))):
            idx -= 1
        self.week_start_idx = idx + 1
        self.n_weeks_current = self.week_end_idx - self.week_start_idx + 1
        if self.n_weeks_current < 1:
            raise SystemExit("Could not locate any week columns between the lead columns and Attendance Rate on the raw-attendance sheet.")
        self.n_lead_cols = self.week_start_idx - 1
        if self.n_lead_cols < 1:
            raise SystemExit("Could not locate any lead columns before the week columns on the raw-attendance sheet.")

        row2_xml = get_row_xml(self.xml, 2) or ""

        # ---- lead columns (before the week columns) ----
        self.lead_columns = []
        for col_idx in range(1, self.n_lead_cols + 1):
            letters = col_to_letters(col_idx)
            header_cell = col_cells.get(letters)
            header_text = cell_text(header_cell, self.shared_strings) or letters
            row2_cell = find_cell(row2_xml, f"{letters}2")
            formula = cell_formula_text(row2_cell)
            self.lead_columns.append(LeadColumnSpec(
                idx=col_idx, letters=letters, header_text=header_text,
                header_cell=header_cell, style=cell_style(row2_cell),
                type_attr=cell_type_attr(row2_cell),
                formula=formula,
                is_date_value=(formula is None and is_bare_numeric_cell(row2_cell)),
            ))

        # style ids to reuse (read from the template, never hardcoded)
        self.date_cell_style = cell_style(col_cells.get(col_to_letters(self.week_start_idx)))
        self.spacer_style = cell_style(col_cells.get(col_to_letters(self.spacer_col_idx)))
        n2_cell = find_cell(row2_xml, f"{ar_col}2")
        self.ar_data_style = cell_style(n2_cell)
        self.ar_header_cell = col_cells.get(ar_col)

        self.old_ar_col_letters = ar_col
        self.ar_row2_formula = cell_formula_text(n2_cell)

        # ---- trailing helper columns (after Attendance Rate) -- found
        # by position, stopping at the first row-2 cell that isn't a
        # formula (a style-only blank cell marks the end), not by a
        # hardcoded name or count
        self.trailing_columns = []
        t_idx = ar_idx + 1
        while True:
            letters = col_to_letters(t_idx)
            row2_cell = find_cell(row2_xml, f"{letters}2")
            formula = cell_formula_text(row2_cell)
            if formula is None:
                break
            self.trailing_columns.append(TrailingColumnSpec(
                letters=letters, header_cell=col_cells.get(letters),
                style=cell_style(row2_cell), type_attr=cell_type_attr(row2_cell),
                formula=formula,
            ))
            t_idx += 1

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
    """A column is a week column if its header parses as a date -- same
    schema-agnostic rule as cleanup_attendance_all_dates.py, rather than
    excluding a hardcoded list of "known" fixed/trailing column names.
    This is what lets the CSV's fixed-column set vary by ministry
    (Email/Grade for a youth export, Birthdate/Completed Thrive/... for
    a young-adults one, or anything else) without editing this script;
    each of the TEMPLATE's own lead columns is matched to its
    same-named CSV column separately, in build_raw_data_rows()."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    week_cols = [c for c in fieldnames if parse_date_header(c) is not None]
    week_dates = [parse_date_header(w) for w in week_cols]
    if not week_cols:
        raise SystemExit(
            f"Could not find any date-parseable column headers in the cleaned CSV. Recognized formats: "
            f"{DATE_FORMATS}. Rename the week-column headers to a recognized format, or extend "
            f"DATE_FORMATS in this script."
        )
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


# ============================================================================
# Formula genericizers -- turn a template's OWN row-2 helper formula into
# a generator for any row/week-range, touching only the parts that
# legitimately change (the week range, and row numbers) and preserving
# everything else byte-for-byte: absolute references (e.g. a Number-of-
# Weeks setup cell, wherever the template happens to keep it), whether
# the formula caps the rate at 1, the literal "Duplicate"/"---" vs
# "DUPE"/"K" style result text, etc. You've said you're using several
# templates whose Raw Data formulas do genuinely different things, so
# nothing about the FORMULA SHAPE is hardcoded here -- everything comes
# from parsing THIS run's --template argument's own row-2 formulas.
# Each genericizer auto-detects which parts of the template's own
# formula are the row-dependent bits (rather than assuming ahead of
# time which columns matter) and returns None if it can't find any --
# callers treat that as fatal (see build_raw_data_rows) rather than
# silently substituting a different template's formula shape.
# ============================================================================

def build_ar_formula_generator(template_formula, old_week_start_letters, old_spacer_letters):
    """Genericize the Attendance Rate formula's week-range (e.g. the
    "I2:U2" inside a COUNTIF), wherever it ends. Different templates
    have been seen stopping exactly at the last real week column, and
    including the always-blank spacer column after it -- rather than
    hardcoding either convention, this finds whatever end column THIS
    template's own formula actually uses, measures how many columns
    past week_start that is, and reproduces the same offset under the
    new week count. Whatever else the formula does around that range (a
    plain ratio, one capped at 1, etc.) and wherever else it points
    (e.g. Performance!$G$49 for the Number-of-Weeks cell) is preserved
    untouched."""
    if not template_formula:
        return None
    old_start_idx = letters_to_col(old_week_start_letters)
    old_max_end_idx = letters_to_col(old_spacer_letters)  # one past the last real week column
    pattern = re.compile(r"\$?" + re.escape(old_week_start_letters) + r"\$?2:\$?([A-Z]+)\$?2\b")
    m = pattern.search(template_formula)
    if not m:
        return None
    end_idx = letters_to_col(m.group(1))
    if not (old_start_idx <= end_idx <= old_max_end_idx):
        # a range ending well beyond the week columns isn't a shape this
        # script understands as "the week range" -- don't guess
        return None
    offset = end_idx - old_start_idx
    generic = template_formula[:m.start()] + "\0WSTART\0\0R\0:\0WEND\0\0R\0" + template_formula[m.end():]

    def generate(new_week_start_letters, rn):
        new_start_idx = letters_to_col(new_week_start_letters)
        new_end_letters = col_to_letters(new_start_idx + offset)
        return (generic.replace("\0WSTART\0", new_week_start_letters)
                        .replace("\0WEND\0", new_end_letters)
                        .replace("\0R\0", str(rn)))
    return generate


def build_rowref_formula_generator(template_formula, remap_fn, old_row=2):
    """Genericize a lead- or trailing-column formula that only depends on
    row 2 in row-relative terms -- either a pure same-row formula (e.g.
    First-Name+Last-Name concatenation, or a VLOOKUP keyed on a same-row
    column) or a self-vs-next-row comparison (e.g. a Dupe Check doing
    IF(W2=W3,"Duplicate","---")). Auto-detects EVERY bare (not
    sheet-qualified -- a reference immediately preceded by "!", such as
    Sheet!$G$2 or 'Attendee Data'!L:O, is a cross-sheet/fixed reference
    and is left completely untouched) "<COLUMN><old_row>" reference,
    rather than assuming ahead of time which columns a given template's
    version of this formula happens to use.

    The self-vs-next-row shape is tried FIRST: it's detected by finding
    a column letter referenced at BOTH old_row and old_row+1 elsewhere
    in the formula. This order matters -- such a formula ALSO has a
    same-row reference, so checking pure-self-row first would silently
    leave its next-row half as a literal that never shifts to the new
    row number. Each referenced column's letters are passed through
    remap_fn(old_letters) -> new_letters, since the referenced column
    might be a lead column (never moves when the week count changes) or
    another trailing helper column (moves right along with this one) --
    only the caller knows which, so remap_fn is what makes this correct
    either way; pass an identity function if nothing should move.

    Returns (generate_fn, letters_found) or (None, None) if the formula
    has neither shape -- callers treat that as fatal (see
    build_raw_data_rows) rather than silently substituting a different
    template's formula shape."""
    if not template_formula:
        return None, None
    self_re = re.compile(r"(?<!!)\$?([A-Z]{1,3})\$?" + str(old_row) + r"\b")
    next_re = re.compile(r"(?<!!)\$?([A-Z]{1,3})\$?" + str(old_row + 1) + r"\b")
    self_letters = set(m.group(1) for m in self_re.finditer(template_formula))
    next_letters = set(m.group(1) for m in next_re.finditer(template_formula))
    common = self_letters & next_letters

    if len(common) == 1:
        letters = next(iter(common))
        self_pat = re.compile(r"(?<!!)\$?" + re.escape(letters) + r"\$?" + str(old_row) + r"\b")
        next_pat = re.compile(r"(?<!!)\$?" + re.escape(letters) + r"\$?" + str(old_row + 1) + r"\b")
        generic = self_pat.sub("\0SELF\0", template_formula)
        generic = next_pat.sub("\0NEXT\0", generic)

        def generate(rn):
            new_letters = remap_fn(letters)
            return (generic.replace("\0SELF\0", f"{new_letters}{rn}")
                            .replace("\0NEXT\0", f"{new_letters}{rn + 1}"))
        return generate, [letters]

    letters_found = sorted(self_letters)
    if not letters_found:
        return None, None
    generic = template_formula
    for letters in letters_found:
        pattern = re.compile(r"(?<!!)\$?" + re.escape(letters) + r"\$?" + str(old_row) + r"\b")
        generic = pattern.sub(f"\0{letters}\0\0R\0", generic)

    def generate(rn):
        out = generic
        for letters in letters_found:
            out = out.replace(f"\0{letters}\0", remap_fn(letters))
        return out.replace("\0R\0", str(rn))
    return generate, letters_found


def referenced_sheet_names(formula):
    """Every OTHER-sheet name a formula references (quoted 'Some Sheet'!
    or bare Sheet1! form) -- used only to WARN when a lead/trailing
    column's formula reaches into a second sheet (e.g. a young-adults
    template's Thrive/Serving/Baptized VLOOKUP into 'Attendee Data'),
    since this script reproduces such a formula correctly but never
    refreshes that other sheet's own data (see the module docstring's
    "WHAT'S STILL OUT OF SCOPE" section)."""
    if not formula:
        return set()
    names = set(re.findall(r"'([^']+)'!", formula))
    names.update(re.findall(r"(?<!')\b([A-Za-z_][A-Za-z0-9_]*)!", formula))
    return names


def build_raw_data_rows(layout, rows, week_cols, week_dates, warnings):
    """Rebuild the ENTIRE Raw Data sheetData from scratch -- including
    row 1 -- rather than patching the template's existing rows in
    place. This matters when the week count changes: the spacer /
    Attendance Rate / trailing-helper columns all need to shift right
    to make room for extra week columns (or left, for fewer), so their
    column positions are computed fresh for THIS run rather than reused
    from wherever the template happened to have them. Every lead and
    trailing helper formula is genericized from the template's OWN
    row-2 formula text (see build_rowref_formula_generator above) so
    this script reproduces whatever formula shape THIS template
    actually uses -- whatever columns it has, however many there are.
    There is deliberately no hardcoded fallback formula: if a
    template's version of one of these can't be recognized, this
    raises rather than silently writing a different template's formula
    shape into every row.
    """
    n = len(rows)
    n_weeks_new = len(week_cols)
    if n_weeks_new < 1:
        raise SystemExit("Cleaned CSV has no week columns.")

    week_letters = [col_to_letters(layout.week_start_idx + i) for i in range(n_weeks_new)]
    spacer_col = layout.week_start_idx + n_weeks_new
    ar_col = spacer_col + 1
    n_trailing = len(layout.trailing_columns)
    last_col = ar_col + n_trailing
    spacer_letters = col_to_letters(spacer_col)
    ar_letters = col_to_letters(ar_col)
    trailing_new_letters = [col_to_letters(ar_col + 1 + i) for i in range(n_trailing)]

    if n_weeks_new != layout.n_weeks_current:
        warnings.append(
            f"Week count changed ({layout.n_weeks_current} -> {n_weeks_new}). Header dates, and every column "
            f"after the week columns (spacer/Attendance Rate/{n_trailing} trailing helper column(s)), shifted "
            f"accordingly. Double-check the Performance tab's week-count-dependent formulas (anything using "
            f"IF($G$28=4,...) or similar) still make sense for {n_weeks_new} weeks -- this script does NOT "
            f"edit Performance formulas."
        )

    old_week_start_letters = col_to_letters(layout.week_start_idx)
    old_spacer_letters = col_to_letters(layout.spacer_col_idx)          # one past the last real week column
    delta = n_weeks_new - layout.n_weeks_current

    def remap_letters(old_letters):
        """Every column from the first week column onward shifts by the
        same delta when the week count changes (weeks, spacer,
        Attendance Rate, and every trailing helper column); lead
        columns never move, since the lead-column count doesn't depend
        on the week count. One rule covers both a formula's OWN column
        and any OTHER column it references on the same/next row."""
        old_idx = letters_to_col(old_letters)
        if old_idx < layout.week_start_idx:
            return old_letters
        return col_to_letters(old_idx + delta)

    # Attendance Rate is derived from THIS run's --template file's own
    # row-2 formula -- not from any shape baked into this script. If
    # the template's version can't be recognized, stop here (rather
    # than writing a different template's formula shape into every
    # row) so the actual formula text can be looked at and the
    # genericizer taught that shape, or the template fixed.
    ar_generate = build_ar_formula_generator(layout.ar_row2_formula, old_week_start_letters, old_spacer_letters)
    if ar_generate is None:
        raise SystemExit(
            "Could not recognize this template's Attendance Rate formula (row 2 of the raw-attendance "
            f"sheet) -- expected a range like {old_week_start_letters}2:<some column>2 somewhere in it "
            f"(e.g. inside a COUNTIF). The formula found was: {layout.ar_row2_formula!r}. This script "
            "only reproduces formula shapes it can find in the template itself, rather than guessing -- "
            "share what this formula is supposed to do so the genericizer can be taught this shape, or "
            "fix it in the template."
        )

    # ---- lead columns: each is either a plain value (paste from the
    # cleaned CSV's same-named column) or a formula (regenerate from the
    # template's own row-2 formula shape) -- whichever THIS template's
    # own row 2 actually has, column by column
    csv_fields_by_lower = {}
    for k in rows[0].keys():
        csv_fields_by_lower.setdefault(k.strip().lower(), k)

    lead_specs = []
    for spec in layout.lead_columns:
        if spec.formula:
            gen, ref_letters = build_rowref_formula_generator(spec.formula, remap_letters)
            if gen is None:
                raise SystemExit(
                    f"Could not recognize the template's formula for lead column {spec.letters} "
                    f"({spec.header_text!r}) -- row 2 has: {spec.formula!r}. This script only reproduces "
                    "formula shapes it can find in the template itself, rather than guessing -- share "
                    "what this formula is supposed to do so the genericizer can be taught this shape, or "
                    "fix it in the template."
                )
            cross_sheets = referenced_sheet_names(spec.formula)
            if cross_sheets:
                warnings.append(
                    f"Lead column {spec.letters} ('{spec.header_text}') is a formula referencing "
                    f"{sorted(cross_sheets)} -- this script reproduces the formula correctly but does NOT "
                    f"refresh that other sheet's data; values will reflect whatever is currently there "
                    f"until that sheet is updated separately."
                )
            print(f"Lead column {spec.letters} ('{spec.header_text}') formula references column(s) "
                  f"{', '.join(ref_letters)} -- reproducing that as-is for every row.")
            lead_specs.append({"spec": spec, "kind": "formula", "generate": gen})
        else:
            csv_field = csv_fields_by_lower.get(spec.header_text.strip().lower())
            if csv_field is None:
                warnings.append(
                    f"Template lead column {spec.letters} ('{spec.header_text}') has no matching column in "
                    f"the cleaned CSV -- left blank for every row. Check for a naming mismatch if this "
                    f"wasn't expected."
                )
            lead_specs.append({"spec": spec, "kind": "value", "csv_field": csv_field})

    # ---- trailing helper columns: always formulas, genericized the
    # same way -- each may reference a lead column (never moves) or
    # another trailing column (moves with this one); remap_letters
    # handles both correctly
    trailing_generators = []
    for i, spec in enumerate(layout.trailing_columns):
        gen, ref_letters = build_rowref_formula_generator(spec.formula, remap_letters)
        if gen is None:
            raise SystemExit(
                f"Could not recognize the template's formula for trailing helper column {spec.letters} -- "
                f"row 2 has: {spec.formula!r}. This script only reproduces formula shapes it can find in "
                "the template itself, rather than guessing -- share what this formula is supposed to do "
                "so the genericizer can be taught this shape, or fix it in the template."
            )
        cross_sheets = referenced_sheet_names(spec.formula)
        if cross_sheets:
            warnings.append(
                f"Trailing helper column {spec.letters} is a formula referencing {sorted(cross_sheets)} -- "
                f"this script reproduces the formula correctly but does NOT refresh that other sheet's "
                f"data; values will reflect whatever is currently there until that sheet is updated "
                f"separately."
            )
        print(f"Trailing helper column {spec.letters} formula references column(s) {', '.join(ref_letters)} "
              f"-- reproducing that as-is for every row.")
        trailing_generators.append({"spec": spec, "new_letters": trailing_new_letters[i], "generate": gen})

    # ---- header row (rebuilt fresh) ----
    lead_cells = [spec.header_cell for spec in layout.lead_columns if spec.header_cell]
    date_cells = []
    for i, letters in enumerate(week_letters):
        serial = excel_serial(week_dates[i])
        style_attr = f' s="{layout.date_cell_style}"' if layout.date_cell_style else ""
        date_cells.append(f'<c r="{letters}1"{style_attr}><v>{serial}</v></c>')
    spacer_style_attr = f' s="{layout.spacer_style}"' if layout.spacer_style else ""
    old_spacer_header = layout.header_cells.get(old_spacer_letters)
    spacer_header_cell = (
        relocate_cell_ref(old_spacer_header, f"{old_spacer_letters}1", f"{spacer_letters}1")
        if old_spacer_header else f'<c r="{spacer_letters}1"{spacer_style_attr}/>'
    )
    ar_header_cell = relocate_cell_ref(layout.ar_header_cell, f"{layout.old_ar_col_letters}1", f"{ar_letters}1")
    trailing_header_cells = []
    for i, spec in enumerate(layout.trailing_columns):
        new_letters = trailing_new_letters[i]
        trailing_header_cells.append(
            relocate_cell_ref(spec.header_cell, f"{spec.letters}1", f"{new_letters}1")
            if spec.header_cell else f'<c r="{new_letters}1"/>'
        )
    new_header = (f'<row r="1" spans="1:{last_col}" x14ac:dyDescent="0.25">'
                  + "".join(c for c in lead_cells if c) + "".join(date_cells) + spacer_header_cell
                  + (ar_header_cell or "") + "".join(c for c in trailing_header_cells if c) + "</row>")

    rows_xml = [new_header]

    # ---- real student rows ----
    date_parse_failures = set()  # column letters already warned about, so once per column not once per row
    for idx, r in enumerate(rows):
        rn = idx + 2
        cells = []
        for lspec in lead_specs:
            spec = lspec["spec"]
            if lspec["kind"] == "formula":
                f_text = lspec["generate"](rn)
                style_attr = f' s="{spec.style}"' if spec.style else ""
                cells.append(f'<c r="{spec.letters}{rn}"{style_attr}{spec.type_attr}><f>{esc(f_text)}</f></c>')
            else:
                value = r.get(lspec["csv_field"], "") if lspec["csv_field"] else ""
                style_attr = f' s="{spec.style}"' if spec.style else ""
                if spec.is_date_value:
                    # the template's OWN row-2 example for this column is
                    # a bare date serial (e.g. Birthdate) -- convert the
                    # CSV's text date the same way, so a downstream
                    # formula (e.g. DATEDIF) gets a real date, not text
                    dt = parse_date_header(value) if value.strip() else None
                    if dt is not None:
                        cells.append(f'<c r="{spec.letters}{rn}"{style_attr}><v>{excel_serial(dt)}</v></c>')
                    else:
                        cells.append(f'<c r="{spec.letters}{rn}"{style_attr}/>')
                        if value.strip() and spec.letters not in date_parse_failures:
                            date_parse_failures.add(spec.letters)
                            warnings.append(
                                f"Lead column {spec.letters} ('{spec.header_text}') expects a date (the "
                                f"template's own row-2 example is a bare date serial) but at least one CSV "
                                f"value (e.g. {value!r}) didn't parse as one -- recognized formats: "
                                f"{DATE_FORMATS}. Left blank where it didn't parse."
                            )
                else:
                    cells.append(inline_cell(f"{spec.letters}{rn}", value))
        for i, letters in enumerate(week_letters):
            val = str(r.get(week_cols[i], "")).strip().upper() == "TRUE"
            cells.append(bool_cell(f"{letters}{rn}", val))
        cells.append(f'<c r="{spacer_letters}{rn}"{spacer_style_attr}/>')

        ar_style_attr = f' s="{layout.ar_data_style}"' if layout.ar_data_style else ""
        formula = ar_generate(week_letters[0], rn)
        attended = sum(1 for i in range(n_weeks_new) if str(r.get(week_cols[i], "")).strip().upper() == "TRUE")
        rate = min(1.0, round(attended / n_weeks_new, 6)) if n_weeks_new else 0
        cells.append(f'<c r="{ar_letters}{rn}"{ar_style_attr}><f>{esc(formula)}</f><v>{rate}</v></c>')

        for tg in trailing_generators:
            spec = tg["spec"]
            f_text = tg["generate"](rn)
            style_attr = f' s="{spec.style}"' if spec.style else ""
            cells.append(f'<c r="{tg["new_letters"]}{rn}"{style_attr}{spec.type_attr}><f>{esc(f_text)}</f></c>')

        rows_xml.append(f'<row r="{rn}" spans="1:{last_col}" x14ac:dyDescent="0.25">' + "".join(c for c in cells if c) + "</row>")

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
            for col_idx in range(1, layout.n_lead_cols + 1):
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
            rows_xml.append(f'<row r="{new_row_num}" spans="1:{last_col}" x14ac:dyDescent="0.25">' + "".join(cells) + "</row>")
        next_free_row += layout.num_placeholder_rows

    last_row_num = next_free_row - 1
    return "".join(rows_xml), last_row_num, last_col


# ============================================================================
# Assemble the full sheet XML replacement
# ============================================================================

def patch_raw_data_sheet(layout, new_rows_xml, last_row_num, last_col):
    content = layout.xml
    dim_match = re.search(r'<dimension ref="[^"]*"/>', content)
    if dim_match:
        content = content.replace(dim_match.group(0), f'<dimension ref="A1:{col_to_letters(last_col)}{last_row_num}"/>')

    sd_match = re.search(r"<sheetData>.*?</sheetData>", content, re.S)
    if not sd_match:
        raise SystemExit("Could not find <sheetData> in the raw-attendance sheet XML.")
    content = content.replace(sd_match.group(0), "<sheetData>" + new_rows_xml + "</sheetData>")

    # Some templates exclude the last trailing helper column (e.g. Dupe
    # Check) from the sortState range; rather than hardcoding "always
    # exclude exactly one column", read how many columns short of the
    # sheet's old last column the template's OWN sortState already
    # stopped, and reproduce that same offset under the new last column.
    sort_match = re.search(r'<sortState ref="[A-Z]+\d+:([A-Z]+)\d+"', content)
    if sort_match:
        old_last_col_idx = layout.ar_col_idx + len(layout.trailing_columns)
        old_sort_end_idx = letters_to_col(sort_match.group(1))
        offset_from_end = old_last_col_idx - old_sort_end_idx
        new_sort_end_idx = max(1, last_col - offset_from_end)
        last_real_row = last_row_num - layout.num_placeholder_rows
        full_match = re.search(r'<sortState ref="[^"]*"', content)
        content = content.replace(full_match.group(0), f'<sortState ref="A2:{col_to_letters(new_sort_end_idx)}{last_real_row}"')

    return content


def find_stale_raw_data_refs(sheets_to_scan, moved_columns, attendance_sheet_name, warnings):
    """When the week count changes, the spacer / Attendance Rate /
    trailing helper columns on the raw-attendance sheet shift right (or
    left) to make room. Any OTHER sheet's formula that references those
    columns by a hardcoded letter (e.g. COUNTIF('July Attendance'!N:N,
    ...) to mean "Attendance Rate") does NOT move with them -- it keeps
    pointing at the old letter, which now holds a different column (or
    nothing), and returns a silently wrong number rather than a formula
    error. This scans the given sheets for exactly that pattern and
    names the specific cells affected, since a generic "double check
    Performance formulas" warning is not actionable enough to find
    these by hand across a sheet with 100+ such formulas.

    moved_columns: dict of old_letter -> (purpose, new_letter), for
    columns whose position actually changed. attendance_sheet_name
    should be the sheet's CURRENT (post-rename) name, since by the time
    this runs every valid reference has already been rewritten to it --
    anything still naming the old sheet, or the new sheet but an old
    column letter, is what this is looking for.
    """
    if not moved_columns:
        return
    ref_re = re.compile(r"'" + re.escape(attendance_sheet_name) + r"'!\$?([A-Z]+)\$?(\d*)(?::\$?([A-Z]+)\$?(\d*))?")
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
                    f"'{attendance_sheet_name}'!{detail}after this month's week-count change -- will "
                    f"silently return a wrong number, not a formula error. Formula: {formula} -- needs "
                    f"a manual fix on the {sheet_name} tab."
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

def check_period_consistency(week_dates):
    """Data-quality check (the project brief's "confirm the date range
    ... before calculating anything" step, made explicit and automatic):
    verify the cleaned CSV's week-column dates form ONE coherent
    reporting period -- either a single calendar month (the usual
    monthly-report case) or, for a quarterly report, several months
    that all fall within a single calendar quarter (e.g. April+May+June
    -> Q2). A date landing outside that span is almost always a wrong
    or leftover date in one of the CSV's week-column headers (e.g. a
    column header copied over from a different month's export by
    mistake), so this is caught loudly here -- rather than silently
    producing a mixed-period report -- before anything else runs.

    Returns (kind, label, months): kind is "month" or "quarter", label
    is what infer_period_label used to compute (e.g. "September" or
    "Q2"), and months is the sorted list of distinct (year, month)
    pairs actually found, for the caller to print as a confirmation.
    """
    months = sorted(set((d.year, d.month) for d in week_dates))
    quarters = set((y, (m - 1) // 3 + 1) for y, m in months)
    if len(quarters) > 1:
        month_labels = ", ".join(f"{y}-{m:02d}" for y, m in months)
        raise SystemExit(
            f"Week-column dates in the cleaned CSV span more than one calendar quarter ({month_labels}). "
            "That's almost always a wrong or leftover date in one of the week-column headers (e.g. a "
            "column accidentally copied over from a different month's export) -- check the CSV's date "
            "headers before proceeding. If this is genuinely intentional, this script doesn't support a "
            "report period wider than one calendar quarter."
        )
    if len(months) == 1:
        return "month", week_dates[0].strftime("%B"), months
    _, q = next(iter(quarters))
    return "quarter", f"Q{q}", months


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
    ap.add_argument("--month", help="override the auto-detected report period label (e.g. September, or Q2 for a quarterly report)")
    ap.add_argument("--year", type=int, help="override the auto-detected year (e.g. 2026)")
    ap.add_argument("--work-dir", help="scratch directory (default: alongside the output file)")
    args = ap.parse_args()

    warnings = []

    rows, week_cols, week_dates = load_cleaned_csv(args.data)
    if not rows:
        raise SystemExit("No data rows found in the cleaned CSV.")

    # confirm the date range forms one coherent period BEFORE anything
    # else runs -- this raises a clear error if it doesn't, e.g. a
    # stray date from the wrong month/quarter in a week-column header
    period_kind, period_label, period_months = check_period_consistency(week_dates)
    months_str = ", ".join(f"{y}-{m:02d}" for y, m in period_months)
    print(f"Week-column dates span {months_str} -- reads as a single {period_kind} ({period_label}).")

    month_name = args.month or period_label
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
    for needed in ("Performance", "Print PDF"):
        if needed not in sheet_paths:
            raise SystemExit(f"Template is missing a sheet named '{needed}'.")

    # the raw-attendance tab is found by its columns, not a hardcoded
    # name -- real monthly workbooks name it "<Month> Attendance" and
    # rename it every month, never literally "Raw Data" (see the module
    # docstring's "TAB RENAMING" section)
    attendance_sheet_name = find_attendance_sheet_name(sheet_paths)
    layout = RawDataLayout(sheet_paths[attendance_sheet_name])
    print(f"Raw-attendance tab: '{attendance_sheet_name}' -- currently has {layout.n_weeks_current} week "
          f"column(s), {layout.last_real_row - 1} real student row(s), {layout.num_placeholder_rows} "
          f"placeholder row(s).")

    new_rows_xml, last_row_num, dupe_col = build_raw_data_rows(layout, rows, week_cols, week_dates, warnings)
    new_attendance_xml = patch_raw_data_sheet(layout, new_rows_xml, last_row_num, dupe_col)
    sheet_paths[attendance_sheet_name].write_text(new_attendance_xml, encoding="utf-8")

    # if the week count changed, every column from the first week column
    # onward (week columns, spacer, Attendance Rate, and every trailing
    # helper column) shifted by the same amount -- work out exactly
    # which letters moved so any other sheet's formula still pointing at
    # the OLD letter can be named, not just generically flagged (see
    # find_stale_raw_data_refs docstring)
    n_weeks_new = len(week_cols)
    moved_columns = {}
    if n_weeks_new != layout.n_weeks_current:
        delta = n_weeks_new - layout.n_weeks_current
        old_last_col_idx = layout.ar_col_idx + len(layout.trailing_columns)
        for old_idx in range(layout.week_start_idx, old_last_col_idx + 1):
            new_idx = old_idx + delta
            old_letters = col_to_letters(old_idx)
            new_letters = col_to_letters(new_idx)
            if old_letters == new_letters:
                continue
            if old_idx <= layout.week_end_idx:
                purpose = f"week column {old_idx - layout.week_start_idx + 1}"
            elif old_idx == layout.spacer_col_idx:
                purpose = "spacer"
            elif old_idx == layout.ar_col_idx:
                purpose = "Attendance Rate"
            else:
                trailing_spec = layout.trailing_columns[old_idx - layout.ar_col_idx - 1]
                header_text = cell_text(trailing_spec.header_cell, layout.shared_strings) or trailing_spec.letters
                purpose = f"trailing column '{header_text}'"
            moved_columns[old_letters] = (purpose, new_letters)

    # rename the tab to this month's/quarter's label (e.g. "June
    # Attendance" -> "July Attendance") and rewrite every literal
    # reference to the old name elsewhere in the workbook -- BEFORE
    # reading Performance/Print PDF below, so the stale-column scan
    # checks references against the new name
    new_attendance_sheet_name = compute_new_sheet_name(attendance_sheet_name, month_name)
    n_refs_renamed = rename_attendance_sheet_everywhere(
        work_dir, sheet_paths, attendance_sheet_name, new_attendance_sheet_name
    )
    if new_attendance_sheet_name != attendance_sheet_name:
        print(f"Renamed the raw-attendance tab '{attendance_sheet_name}' -> "
              f"'{new_attendance_sheet_name}' and updated {n_refs_renamed} formula reference(s) "
              f"elsewhere in the workbook that pointed at it by name.")

    perf_xml = sheet_paths["Performance"].read_text(encoding="utf-8")
    perf_xml = patch_performance_weeks(perf_xml, layout.shared_strings, len(week_cols), warnings)

    pdf_xml = sheet_paths["Print PDF"].read_text(encoding="utf-8")
    pdf_xml = patch_print_pdf_title(pdf_xml, layout.shared_strings, month_name, year, warnings)

    find_stale_raw_data_refs(
        [("Performance", perf_xml), ("Print PDF", pdf_xml)], moved_columns, new_attendance_sheet_name, warnings
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
    profile_dir = work_dir.parent / f".libreoffice-pdf-{os.getpid()}"
    profile_dir.mkdir(parents=True, exist_ok=True)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        uno_port = port_socket.getsockname()[1]

    print(f"\nRendering PDF via a disposable LibreOffice copy (never the delivered xlsx)...")
    proc = subprocess.Popen(
        ["soffice", f"-env:UserInstallation={profile_dir.resolve().as_uri()}",
         "--headless", "--invisible", "--nocrashreport", "--nodefault",
         "--norestore", "--nologo", "--nofirststartwizard",
         f"--accept=socket,host=localhost,port={uno_port};urp;"],
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
remote_ctx = resolver.resolve("uno:socket,host=localhost,port={uno_port};urp;StarOffice.ComponentContext")
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
        soffice_path = shutil.which("soffice")
        if not soffice_path:
            raise RuntimeError("LibreOffice (soffice) is not available for PDF export.")
        program_dir = str(Path(soffice_path).resolve().parent)
        helper_env = os.environ.copy()
        helper_env["PYTHONPATH"] = os.pathsep.join(
            value for value in (program_dir, helper_env.get("PYTHONPATH", "")) if value
        )
        helper_env["URE_BOOTSTRAP"] = f"vnd.sun.star.pathname:{program_dir}/fundamentalrc"
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=90,
            env=helper_env,
        )
        pdf_file = Path(pdf_path)
        if result.returncode != 0 or "PDF_OK" not in result.stdout or not pdf_file.exists() or pdf_file.stat().st_size == 0:
            details = (result.stderr or result.stdout or "LibreOffice did not create a PDF.").strip()
            raise RuntimeError(f"PDF export failed: {details}")
        print(f"Wrote {pdf_path}")
        script_path.unlink(missing_ok=True)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        disposable.unlink(missing_ok=True)
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
