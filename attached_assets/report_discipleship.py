"""
"Discipleship by Group" -- per-group engagement pages for season reports
built from 2+ Planning Center groups (report_season.py), added 2026-10-27;
points out of 17 since 2026-11-10.

One row per group, sorted by engagement score, with an "All groups" row at the
bottom. Each row: group name with its engagement score badge (points out of the
total), attendees, then a heat-grid cell per part of the score that has points:
Form / Thrive, Transform, Serving, TC College, Giving, Leadership (and Serve
Class if it's given points). The server computes everything
(routes/reports.ts buildDiscipleship, lib/engagement.ts) and passes it in the
season meta JSON as "discipleship":

    {"asOf": "2026-11-30", "servingWindowDays": 90,
     "points": {"formThrive": 1, "transform": 2, "serving": 3, "tcCollege": 3,
                "giving": 4, "leadership": 4, "serveClass": 0},
     "maxPoints": 17,
     "available": {"formThrive": true, ..., "leadership": false},
     "givingField": "Regular Giver", "leadershipField": null,
     "groups": [{"id", "name", "attendees", "roster", "heldNights",
                 "percentages": {"transform": 0.62, ..., "leadership": null}, "score": 9.4}, ...],
     "overall": {... same shape, name "All groups"}}

Percentages are 0..1 or null (no data / not set up). A part that isn't set up
is left out of the score and the score is scaled to the full total.
Runs prepared before 2026-11-10 (old 0-100 meta, no "points") get no page.
"""
from __future__ import annotations

import textwrap

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

from report_common import (
    BASELINE, GRIDLINE, INK_MUTED, INK_PRIMARY, INK_SECONDARY, SURFACE,
    draw_report_header, new_page,
)

ALL_PARTS = [
    ("formThrive", "Form/Thrive"),
    ("transform", "Transform"),
    ("serving", "Serving"),
    ("tcCollege", "TC College"),
    ("giving", "Giving"),
    ("leadership", "Leadership"),
    ("serveClass", "Serve Class"),
]
# Sequential blue (dataviz palette steps 100 -> 700): darker = higher share.
RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
NO_DATA = "#f0efec"
ROWS_PER_PAGE = 18


def ramp_color(value: float | None) -> str:
    if value is None:
        return NO_DATA
    v = min(1.0, max(0.0, float(value)))
    return RAMP[min(len(RAMP) - 1, int(v * len(RAMP)))]


def ink_on(fill: str) -> str:
    """White text on the darker ramp steps, primary ink otherwise."""
    return "#ffffff" if fill in RAMP[3:] else INK_PRIMARY


def _pct(value) -> str:
    return "—" if value is None else f"{float(value):.0%}"


def _num(value) -> str:
    return f"{float(value):g}"


def _draw_rows(fig, rows, parts, max_points, top, row_h, x_name, x_cells, cell_w, bold_last=False):
    y = top
    for index, group in enumerate(rows):
        is_total = bold_last and index == len(rows) - 1
        if is_total:
            fig.add_artist(plt.Line2D([0.06, 0.94], [y + 0.002, y + 0.002], color=BASELINE, linewidth=1.0,
                                      transform=fig.transFigure))
        mid = y - row_h / 2
        # Score badge (points), then the group name (wrapped to two lines).
        score = group.get("score")
        badge_fill = ramp_color(None if score is None or not max_points else score / max_points)
        fig.add_artist(FancyBboxPatch((x_name, mid - 0.0115), 0.046, 0.023, boxstyle="round,pad=0.002,rounding_size=0.006",
                                      transform=fig.transFigure, facecolor=badge_fill, edgecolor="none"))
        fig.text(x_name + 0.023, mid, "—" if score is None else _num(score), fontsize=9.5, fontweight="bold",
                 color=ink_on(badge_fill), ha="center", va="center")
        name = textwrap.shorten(str(group.get("name", "")), width=48, placeholder="…")
        lines = textwrap.wrap(name, 25)[:2]
        fig.text(x_name + 0.056, mid, "\n".join(lines), fontsize=8.2, color=INK_PRIMARY, ha="left", va="center",
                 fontweight="bold" if is_total else "normal", linespacing=1.05)
        attendees = int(group.get("attendees") or 0)
        roster = int(group.get("roster") or 0)
        people_text = f"{attendees}" + (f" of {roster}" if roster > attendees else "")
        fig.text(x_cells[0] - 0.01, mid, people_text, fontsize=8, color=INK_SECONDARY, ha="right", va="center")
        percentages = group.get("percentages") or {}
        for (key, _, _), x in zip(parts, x_cells):
            value = percentages.get(key)
            fill = ramp_color(value)
            fig.add_artist(Rectangle((x + 0.002, y - row_h + 0.002), cell_w - 0.004, row_h - 0.004,
                                     transform=fig.transFigure, facecolor=fill, edgecolor="none"))
            fig.text(x + cell_w / 2, mid, _pct(value), fontsize=8.3, color=ink_on(fill) if value is not None else INK_MUTED,
                     ha="center", va="center", fontweight="bold" if is_total else "normal")
        y -= row_h
    return y


def draw_discipleship_pages(figsize: tuple, report_name: str, period_label: str, disc: dict,
                            logo_path=None, subtitle: str | None = None) -> list:
    if not isinstance(disc.get("points"), dict):
        return []  # prepared before the points model; prepare the report again
    groups = sorted(disc.get("groups") or [], key=lambda g: (-(g.get("score") if g.get("score") is not None else -1),
                                                             str(g.get("name", ""))))
    overall = disc.get("overall")
    if len(groups) < 2:
        return []
    points = disc["points"]
    available = disc.get("available") or {}
    max_points = float(disc.get("maxPoints") or sum(float(v) for v in points.values()))
    window = int(disc.get("servingWindowDays") or 90)
    giving_field = str(disc.get("givingField") or "").strip()
    leadership_field = str(disc.get("leadershipField") or "").strip()
    parts = [(key, label, float(points.get(key, 0))) for key, label in ALL_PARTS if float(points.get(key, 0)) > 0]
    missing = [label for key, label, _ in parts if available.get(key) is False]

    pages = [groups[i:i + ROWS_PER_PAGE] for i in range(0, len(groups), ROWS_PER_PAGE)]
    figs = []
    x_name = 0.06
    x_people_right = 0.415
    cell_w = min(0.09, (0.94 - x_people_right - 0.01) / max(len(parts), 1))
    x_cells = [x_people_right + 0.01 + i * cell_w for i in range(len(parts))]
    for page_index, chunk in enumerate(pages):
        fig = new_page(figsize)
        draw_report_header(fig, report_name, period_label, subtitle=subtitle, logo_path=logo_path)
        heading = "Discipleship by Group" + (" (continued)" if page_index else "")
        fig.text(0.06, 0.895, heading, fontsize=13, fontweight="bold", color=INK_PRIMARY, ha="left", va="top")
        fig.text(0.06, 0.872, f"Engagement of each group's attendees this season. The number beside each group is its "
                 f"engagement score: points out of {_num(max_points)}.", fontsize=8, color=INK_SECONDARY, ha="left", va="top")
        # Column headers: part name and its points.
        header_y = 0.835
        fig.text(x_name, header_y, f"Score (of {_num(max_points)}) · Group", fontsize=8, fontweight="bold",
                 color=INK_SECONDARY, ha="left", va="center")
        fig.text(x_cells[0] - 0.01, header_y, "Attendees", fontsize=8, fontweight="bold", color=INK_SECONDARY,
                 ha="right", va="center")
        for (key, label, pts), x in zip(parts, x_cells):
            fig.text(x + cell_w / 2, header_y + 0.006, label, fontsize=7.6, fontweight="bold", color=INK_SECONDARY,
                     ha="center", va="center")
            suffix = "not set up" if available.get(key) is False else f"{_num(pts)} pt{'s' if pts != 1 else ''}"
            fig.text(x + cell_w / 2, header_y - 0.006, suffix, fontsize=6.6, color=INK_MUTED, ha="center", va="center")
        fig.add_artist(plt.Line2D([0.06, 0.94], [header_y - 0.016, header_y - 0.016], color=GRIDLINE, linewidth=0.8,
                                  transform=fig.transFigure))
        rows = list(chunk)
        is_last = page_index == len(pages) - 1
        if is_last and overall:
            rows.append(overall)
        row_h = min(0.038, 0.62 / max(len(rows), 1))
        bottom = _draw_rows(fig, rows, parts, max_points, header_y - 0.02, row_h, x_name, x_cells, cell_w,
                            bold_last=is_last and bool(overall))
        if is_last:
            breakdown = ", ".join(f"{label} {_num(pts)}" for _, label, pts in parts)
            notes = [
                f"Score = points earned on average by the group's attendees, out of {_num(max_points)} ({breakdown}). "
                "Each cell is the share of attendees who earned that part; Transform is their average attendance rate "
                "in that group (nights present ÷ nights the group met with attendance taken), so it earns partial points.",
                "Form / Thrive = completed Thrive or submitted a Planning Center form. "
                f"Serving = \"Last Served\" within {window} days of the season's last night. "
                "TC College = checked in at the tracked TC College event in the last 26 weeks."
                + (f" Giving = the \"{giving_field}\" field has a value." if giving_field else "")
                + (f" Leadership = the \"{leadership_field}\" field has a value." if leadership_field else ""),
                (f"Not set up yet, so left out and the score is scaled to {_num(max_points)}: {', '.join(missing)}."
                 if missing else "All parts are set up."),
                "Attendees = people marked present at least once (\"of N\" = everyone on the group's attendance lists). "
                "Someone in more than one group counts in each; the All groups row averages their per-group attendance rates.",
            ]
            y = bottom - 0.035
            for note in notes:
                wrapped = textwrap.fill(note, 135)
                fig.text(0.06, y, wrapped, fontsize=7, color=INK_MUTED, ha="left", va="top")
                y -= 0.016 * (wrapped.count("\n") + 1) + 0.006
        figs.append(fig)
    return figs
