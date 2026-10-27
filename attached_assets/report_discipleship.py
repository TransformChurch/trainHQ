"""
"Discipleship by Group" -- per-group engagement pages for season reports
built from 2+ Planning Center groups (report_season.py), added 2026-10-27.

One row per group, sorted by engagement score, with an "All groups" row at the
bottom. Each row: group name with its engagement score badge, attendees, then
a heat-grid cell per part of the score (Attendance, Thrive, Serve Class,
Serving in the last 90 days, Giving). The server computes everything
(routes/reports.ts buildDiscipleship, lib/engagement.ts) and passes it in the
season meta JSON as "discipleship":

    {"asOf": "2026-11-30", "servingWindowDays": 90,
     "weights": {"attendance": 1, "thrive": 1, "serveClass": 1, "serving": 1, "giving": 1},
     "groups": [{"id", "name", "attendees", "roster", "heldNights",
                 "percentages": {"attendance": 0.62, ..., "giving": null}, "score": 54}, ...],
     "overall": {... same shape, name "All groups"}}

Percentages are 0..1 or null (no data -- Giving until giving data exists).
"""
from __future__ import annotations

import textwrap

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

from report_common import (
    BASELINE, GRIDLINE, INK_MUTED, INK_PRIMARY, INK_SECONDARY, SURFACE,
    draw_report_header, new_page,
)

PARTS = [
    ("attendance", "Attendance"),
    ("thrive", "Thrive"),
    ("serveClass", "Serve Class"),
    ("serving", "Serving"),
    ("giving", "Giving"),
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


def _weights_text(weights: dict) -> str:
    names = dict(PARTS)
    used = [f"{names[k]} ×{weights.get(k, 0):g}" for k, _ in PARTS if weights.get(k, 0) > 0]
    return ", ".join(used) if used else "none"


def _draw_rows(fig, rows, top, row_h, x_name, x_cells, cell_w, bold_last=False):
    y = top
    for index, group in enumerate(rows):
        is_total = bold_last and index == len(rows) - 1
        if is_total:
            fig.add_artist(plt.Line2D([0.06, 0.94], [y + 0.002, y + 0.002], color=BASELINE, linewidth=1.0,
                                      transform=fig.transFigure))
        mid = y - row_h / 2
        # Score badge, then the group name (wrapped to two lines).
        score = group.get("score")
        badge_fill = ramp_color(None if score is None else score / 100)
        fig.add_artist(FancyBboxPatch((x_name, mid - 0.0115), 0.042, 0.023, boxstyle="round,pad=0.002,rounding_size=0.006",
                                      transform=fig.transFigure, facecolor=badge_fill, edgecolor="none"))
        fig.text(x_name + 0.021, mid, "—" if score is None else f"{score}", fontsize=9.5, fontweight="bold",
                 color=ink_on(badge_fill), ha="center", va="center")
        name = textwrap.shorten(str(group.get("name", "")), width=58, placeholder="…")
        lines = textwrap.wrap(name, 30)[:2]
        fig.text(x_name + 0.052, mid, "\n".join(lines), fontsize=8.2, color=INK_PRIMARY, ha="left", va="center",
                 fontweight="bold" if is_total else "normal", linespacing=1.05)
        attendees = int(group.get("attendees") or 0)
        roster = int(group.get("roster") or 0)
        people_text = f"{attendees}" + (f" of {roster}" if roster > attendees else "")
        fig.text(x_cells[0] - 0.012, mid, people_text, fontsize=8, color=INK_SECONDARY, ha="right", va="center")
        percentages = group.get("percentages") or {}
        for (key, _), x in zip(PARTS, x_cells):
            value = percentages.get(key)
            fill = ramp_color(value)
            fig.add_artist(Rectangle((x + 0.002, y - row_h + 0.002), cell_w - 0.004, row_h - 0.004,
                                     transform=fig.transFigure, facecolor=fill, edgecolor="none"))
            fig.text(x + cell_w / 2, mid, _pct(value), fontsize=8.5, color=ink_on(fill) if value is not None else INK_MUTED,
                     ha="center", va="center", fontweight="bold" if is_total else "normal")
        y -= row_h
    return y


def draw_discipleship_pages(figsize: tuple, report_name: str, period_label: str, disc: dict,
                            logo_path=None, subtitle: str | None = None) -> list:
    groups = sorted(disc.get("groups") or [], key=lambda g: (-(g.get("score") if g.get("score") is not None else -1),
                                                             str(g.get("name", ""))))
    overall = disc.get("overall")
    if len(groups) < 2:
        return []
    weights = disc.get("weights") or {}
    window = int(disc.get("servingWindowDays") or 90)
    pages = [groups[i:i + ROWS_PER_PAGE] for i in range(0, len(groups), ROWS_PER_PAGE)]
    figs = []
    x_name = 0.06
    x_people_right = 0.47
    cell_w = 0.09
    x_cells = [x_people_right + 0.012 + i * cell_w for i in range(len(PARTS))]
    for page_index, chunk in enumerate(pages):
        fig = new_page(figsize)
        draw_report_header(fig, report_name, period_label, subtitle=subtitle, logo_path=logo_path)
        heading = "Discipleship by Group" + (f" (continued)" if page_index else "")
        fig.text(0.06, 0.895, heading, fontsize=13, fontweight="bold", color=INK_PRIMARY, ha="left", va="top")
        fig.text(0.06, 0.872, "Engagement of each group's attendees this season. The number beside each group is its "
                 "engagement score (0–100).", fontsize=8, color=INK_SECONDARY, ha="left", va="top")
        # Column headers.
        header_y = 0.835
        fig.text(x_name, header_y, "Score · Group", fontsize=8, fontweight="bold", color=INK_SECONDARY, ha="left", va="center")
        fig.text(x_cells[0] - 0.012, header_y, "Attendees", fontsize=8, fontweight="bold", color=INK_SECONDARY,
                 ha="right", va="center")
        for (key, label), x in zip(PARTS, x_cells):
            fig.text(x + cell_w / 2, header_y, label, fontsize=8, fontweight="bold", color=INK_SECONDARY,
                     ha="center", va="center")
        fig.add_artist(plt.Line2D([0.06, 0.94], [header_y - 0.012, header_y - 0.012], color=GRIDLINE, linewidth=0.8,
                                  transform=fig.transFigure))
        rows = list(chunk)
        is_last = page_index == len(pages) - 1
        if is_last and overall:
            rows.append(overall)
        row_h = min(0.038, 0.62 / max(len(rows), 1))
        bottom = _draw_rows(fig, rows, header_y - 0.016, row_h, x_name, x_cells, cell_w, bold_last=is_last and bool(overall))
        if is_last:
            notes = [
                "Attendance = average attendance rate in that group (nights present ÷ nights the group met with attendance "
                "taken). Attendees = people marked present at least once (\"of N\" = everyone on the group's attendance lists).",
                "Thrive and Serve Class = share of attendees whose Planning Center profile has them completed. "
                f"Serving = share whose \"Last Served\" date is within {window} days of the season's last night.",
                "Giving isn't connected yet, so it doesn't count toward the score. "
                f"Score = weighted average of the other parts (weights: {_weights_text({k: v for k, v in weights.items() if k != 'giving'})}).",
                "Someone in more than one group counts in each; the All groups row averages their per-group attendance rates.",
            ]
            y = bottom - 0.035
            for note in notes:
                wrapped = textwrap.fill(note, 135)
                fig.text(0.06, y, wrapped, fontsize=7, color=INK_MUTED, ha="left", va="top")
                y -= 0.016 * (wrapped.count("\n") + 1) + 0.006
        figs.append(fig)
    return figs
