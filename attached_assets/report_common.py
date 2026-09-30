"""
report_common.py
=================

Shared engine for the pure-Python ministry attendance reports: style/palette
setup, cleaned-CSV loading, age/grade bucketing helpers, and a small library
of chart-drawing primitives built on matplotlib. Each report type
(report_youth_quarterly.py, report_youth_monthly.py, report_kids_rutherford.py,
report_kids_lyndhurst.py) imports this module and calls into it -- none of
them touch matplotlib directly, so the visual language (color, type, grid,
spacing) stays identical across all four reports.

INPUT CONTRACT
--------------
Every renderer takes the same shape of input: the "cleaned CSV" already
produced by the existing Reporting tab pipeline's cleanup step
(cleanup_attendance_month_quarter.py / cleanup_attendance_all_dates.py in the
Replit Site app) -- NOT a raw Planning Center export. That cleaned CSV always
has:
  - Some fixed, non-date columns (First Name, Last Name, Gender, Grade,
    Birthdate, First Timers, ... -- whichever fields the admin selected to
    pull for this report template), in the order the cleanup script wrote
    them.
  - One column per service date, header formatted YYYY-MM-DD, value "TRUE"/
    "FALSE".
  - A final "Attendance Rate" column (0..1 fraction of weeks attended).
A column is recognized as a week column purely by whether its header parses
as a date -- same rule the existing cleanup scripts already use -- so this
engine needs no template-specific configuration to find them.

NO EXCEL, NO LIBREOFFICE
-------------------------
This engine never opens an .xlsx file and never shells out to LibreOffice.
Every chart is drawn directly with matplotlib and the whole report is
assembled as a single multi-page PDF via matplotlib.backends.backend_pdf.
PdfPages. This sidesteps entirely the chart-corruption problem the old
Excel-template approach had (openpyxl/LibreOffice re-saves silently drop
native chart styling).
"""

from __future__ import annotations

import colorsys
import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.colors as mcolors
import matplotlib.image as mimage
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Patch
import numpy as np
import pandas as pd

# ============================================================================
# Palette (validated categorical order -- see the dataviz skill's
# references/palette.md; fixed order, never cycled or re-sorted per chart)
# ============================================================================

CATEGORICAL = [
    "#2a78d6",  # 1 blue
    "#eb6834",  # 2 orange
    "#1baf7a",  # 3 aqua
    "#eda100",  # 4 yellow
    "#e87ba4",  # 5 magenta
    "#008300",  # 6 green
    "#4a3aa7",  # 7 violet
    "#e34948",  # 8 red
]

# Two-series slots used consistently for every Male/Female chart in every
# report, so "Male" and "Female" are always the same two colors report-wide.
MALE_COLOR = CATEGORICAL[0]      # blue
FEMALE_COLOR = CATEGORICAL[4]    # magenta
UNKNOWN_COLOR = "#898781"        # muted gray -- deliberately NOT a categorical
                                  # slot, since "unknown" is an absence of
                                  # identity, not another identity

SURFACE = "#fcfcfb"
PAGE_PLANE = "#f9f9f7"
INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#52514e"
INK_MUTED = "#898781"
GRIDLINE = "#e1e0d9"
BASELINE = "#c3c2b7"

FONT_FAMILY = ["DejaVu Sans", "sans-serif"]


def setup_style() -> None:
    """Apply the shared visual language to matplotlib's rcParams. Call once
    per process before drawing any figure."""
    plt.rcParams.update({
        "font.family": FONT_FAMILY,
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "text.color": INK_PRIMARY,
        "axes.edgecolor": BASELINE,
        "axes.labelcolor": INK_SECONDARY,
        "axes.titlecolor": INK_PRIMARY,
        "xtick.color": INK_MUTED,
        "ytick.color": INK_MUTED,
        "grid.color": GRIDLINE,
        "grid.linewidth": 0.8,
        "axes.grid": True,
        "axes.axisbelow": True,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.linewidth": 0.8,
        "font.size": 9,
        "axes.titlesize": 11,
        "axes.titleweight": "bold",
        "legend.frameon": False,
        "legend.fontsize": 8,
    })


# ============================================================================
# Cleaned-CSV loading (mirrors the schema-agnostic column detection already
# used by cleanup_attendance_month_quarter.py / cleanup_attendance_all_dates.py)
# ============================================================================

DATE_FORMATS = ["%Y-%m-%d", "%d-%b-%y", "%d-%b-%Y", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y"]


def _parse_date_header(s: str):
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


@dataclass
class CleanedData:
    df: pd.DataFrame
    fixed_cols: list
    week_cols: list          # original header strings, in date order
    week_dates: list         # parsed dt.date, same order as week_cols
    num_weeks: int = field(init=False)

    def __post_init__(self):
        self.num_weeks = len(self.week_cols)


def load_cleaned_csv(path: str | Path) -> CleanedData:
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    week_cols, week_dates = [], []
    fixed_cols = []
    for col in df.columns:
        if col == "Attendance Rate":
            continue
        parsed = _parse_date_header(col)
        if parsed is not None:
            week_cols.append(col)
            week_dates.append(parsed)
        else:
            fixed_cols.append(col)
    order = sorted(range(len(week_dates)), key=lambda i: week_dates[i])
    week_cols = [week_cols[i] for i in order]
    week_dates = [week_dates[i] for i in order]

    for w in week_cols:
        df[w] = df[w].astype(str).str.strip().str.upper() == "TRUE"
    if "Attendance Rate" in df.columns:
        df["Attendance Rate"] = pd.to_numeric(df["Attendance Rate"], errors="coerce").fillna(0.0)
    else:
        df["Attendance Rate"] = (
            df[week_cols].sum(axis=1) / len(week_cols) if week_cols else 0.0
        )
    return CleanedData(df=df, fixed_cols=fixed_cols, week_cols=week_cols, week_dates=week_dates)


def is_first_timer(value) -> bool:
    return str(value).strip().lower() == "first-timer"


# ============================================================================
# Attendance-rate bucketing (reproduces the original templates' bucket
# thresholds: 20% steps, or 25% steps for an exactly-4-week period)
# ============================================================================

def attendance_rate_bucket_edges(num_weeks: int) -> list:
    if num_weeks == 4:
        return [0.25, 0.5, 0.75, 1.0]
    return [0.2, 0.4, 0.6, 0.8, 1.0]


def bucket_labels(edges: list) -> list:
    labels = []
    prev = 0.0
    for e in edges:
        labels.append(f"{int(round(prev * 100))}–{int(round(e * 100))}%")
        prev = e
    return labels


def bucket_series(rates: pd.Series, edges: list) -> pd.Series:
    """Assign each rate to a bucket label using the SAME cascading rule the
    original templates used: bucket k = (rate > edge[k-1]) and (rate <=
    edge[k]), with the first bucket being rate <= edge[0]."""
    labels = bucket_labels(edges)
    out = pd.Series(labels[-1], index=rates.index)
    assigned = pd.Series(False, index=rates.index)
    for i, e in enumerate(edges):
        if i == 0:
            mask = (~assigned) & (rates <= e)
        else:
            mask = (~assigned) & (rates <= e) & (rates > edges[i - 1])
        out[mask] = labels[i]
        assigned |= mask
    return out


# ============================================================================
# Small helpers shared by every renderer
# ============================================================================

def format_period_label(week_dates: list, override: str | None = None) -> str:
    if override:
        return override
    months = sorted({(d.year, d.month) for d in week_dates})
    if len(months) == 1:
        y, m = months[0]
        return dt.date(y, m, 1).strftime("%B %Y")
    quarters = {(y, (m - 1) // 3 + 1) for y, m in months}
    if len(quarters) == 1:
        y, q = next(iter(quarters))
        return f"{y} Q{q}"
    return f"{week_dates[0]:%b %Y} – {week_dates[-1]:%b %Y}"


def new_page(figsize=(11, 8.5)) -> plt.Figure:
    fig = plt.figure(figsize=figsize, dpi=150)
    fig.patch.set_facecolor(SURFACE)
    return fig


def draw_logo_inset(fig: plt.Figure, logo_path: str | Path, max_rect: tuple, anchor: str = "right") -> None:
    """Place a logo image inside max_rect, preserving its aspect ratio
    (never stretching it) and anchoring it to one edge of that box.
    anchor: "right" (top-right running header) or "center" (cover page)."""
    left, bottom, width, height = max_rect
    img = mimage.imread(str(logo_path))
    img_h, img_w = img.shape[0], img.shape[1]
    fig_w_in, fig_h_in = fig.get_size_inches()
    box_w_in, box_h_in = width * fig_w_in, height * fig_h_in
    scale = min(box_w_in / (img_w / 100.0), box_h_in / (img_h / 100.0)) if img_w and img_h else 1.0
    # matplotlib imread gives pixel dims; convert the box to "logical" units
    # via a fixed 100 px/in reference so the fit is aspect-correct regardless
    # of the source image's own DPI metadata.
    disp_w_in = (img_w / 100.0) * scale
    disp_h_in = (img_h / 100.0) * scale
    disp_w = disp_w_in / fig_w_in
    disp_h = disp_h_in / fig_h_in
    if anchor == "center":
        x0 = left + (width - disp_w) / 2
    else:
        x0 = left + width - disp_w
    y0 = bottom + (height - disp_h) / 2
    ax = fig.add_axes((x0, y0, disp_w, disp_h))
    ax.imshow(img)
    ax.axis("off")


def draw_report_header(fig: plt.Figure, title: str, period_label: str, subtitle: str | None = None,
                        logo_path: str | Path | None = None) -> None:
    fig.text(0.06, 0.965, title, fontsize=18, fontweight="bold", color=INK_PRIMARY, ha="left", va="top")
    fig.text(0.06, 0.935, period_label, fontsize=11, color=INK_SECONDARY, ha="left", va="top")
    if subtitle:
        fig.text(0.94, 0.965, subtitle, fontsize=9, color=INK_MUTED, ha="right", va="top")
    if logo_path:
        draw_logo_inset(fig, logo_path, (0.72, 0.93, 0.22, 0.05), anchor="right")
    fig.add_artist(plt.Line2D([0.06, 0.94], [0.915, 0.915], color=BASELINE, linewidth=0.8, transform=fig.transFigure))


def draw_cover_page(figsize: tuple, org_name: str, report_name: str, period_label: str,
                     logo_path: str | Path | None = None, generated: str | None = None) -> plt.Figure:
    """Standalone title page: organization name / logo, the report name, and
    the specific quarter or month this run covers -- always the first page
    of the assembled PDF."""
    fig = new_page(figsize=figsize)
    cx = 0.5
    if logo_path:
        draw_logo_inset(fig, logo_path, (0.15, 0.62, 0.70, 0.16), anchor="center")
    else:
        fig.text(cx, 0.70, org_name, fontsize=22, fontweight="bold", color=INK_PRIMARY, ha="center", va="center")
    fig.text(cx, 0.50, report_name, fontsize=26, fontweight="bold", color=INK_PRIMARY, ha="center", va="center")
    fig.text(cx, 0.43, period_label, fontsize=16, color=INK_SECONDARY, ha="center", va="center")
    fig.add_artist(plt.Line2D([0.38, 0.62], [0.395, 0.395], color=BASELINE, linewidth=1.0, transform=fig.transFigure))
    if generated:
        fig.text(cx, 0.10, generated, fontsize=9, color=INK_MUTED, ha="center", va="center")
    return fig


def draw_stat_tiles(fig: plt.Figure, rect: tuple, stats: list) -> None:
    """stats: list of (label, value_str) shown as a row of simple stat tiles
    -- used for a quick numeric summary at the top of a report, never as a
    substitute for the detail charts below it."""
    left, bottom, width, height = rect
    n = len(stats)
    slot_w = width / n
    for i, (label, value) in enumerate(stats):
        x = left + i * slot_w
        fig.text(x + slot_w / 2, bottom + height * 0.62, value, fontsize=17, fontweight="bold",
                  color=INK_PRIMARY, ha="center", va="center")
        fig.text(x + slot_w / 2, bottom + height * 0.18, label, fontsize=8.5,
                  color=INK_SECONDARY, ha="center", va="center")
        if i > 0:
            fig.add_artist(plt.Line2D([x, x], [bottom + height * 0.05, bottom + height * 0.95],
                                       color=GRIDLINE, linewidth=0.8, transform=fig.transFigure))


def style_axes(ax: plt.Axes, y_grid_only: bool = True) -> None:
    if y_grid_only:
        ax.grid(axis="y")
        ax.grid(axis="x", visible=False)
    ax.tick_params(length=0)


def draw_ordinal_bar(ax: plt.Axes, categories: list, values: list, color: str = CATEGORICAL[0],
                      horizontal: bool = True, value_fmt=lambda v: f"{v:,.0f}") -> None:
    """A single-series bar for an ORDERED categorical axis (grades, age
    bands, attendance-rate buckets) -- used in place of a many-slice pie,
    per the dataviz guidance that a pie stays readable only to ~6 segments."""
    positions = np.arange(len(categories))
    if horizontal:
        ax.barh(positions, values, color=color, height=0.62)
        ax.set_yticks(positions)
        ax.set_yticklabels(categories)
        ax.invert_yaxis()
        style_axes(ax)
        ax.grid(axis="x")
        ax.grid(axis="y", visible=False)
        xmax = max(values) if values else 1
        for p, v in zip(positions, values):
            ax.text(v + xmax * 0.015, p, value_fmt(v), va="center", ha="left",
                     fontsize=8, color=INK_SECONDARY)
        ax.set_xlim(0, xmax * 1.18 if xmax else 1)
    else:
        ax.bar(positions, values, color=color, width=0.62)
        ax.set_xticks(positions)
        ax.set_xticklabels(categories, rotation=0)
        style_axes(ax)
        ymax = max(values) if values else 1
        for p, v in zip(positions, values):
            ax.text(p, v + ymax * 0.02, value_fmt(v), ha="center", va="bottom",
                     fontsize=8, color=INK_SECONDARY)
        ax.set_ylim(0, ymax * 1.18 if ymax else 1)


def draw_grouped_bar(ax: plt.Axes, categories: list, series: dict, colors: dict,
                      value_fmt=lambda v: f"{v:,.0f}") -> None:
    """Grouped (side-by-side) bars for a small number of series across an
    ordered category axis -- e.g. Grade vs Gender (Male/Female[/Unknown])."""
    n_series = len(series)
    positions = np.arange(len(categories))
    width = 0.8 / n_series
    for i, (name, values) in enumerate(series.items()):
        offset = (i - (n_series - 1) / 2) * width
        ax.bar(positions + offset, values, width=width * 0.92, color=colors[name], label=name)
    ax.set_xticks(positions)
    ax.set_xticklabels(categories, rotation=30, ha="right")
    style_axes(ax)
    ax.legend(loc="upper right", ncols=n_series)


def draw_pie(ax: plt.Axes, labels: list, values: list, colors: list | None = None,
             value_fmt=None) -> None:
    """Part-to-whole pie -- reserved for <=6 segments (dataviz guidance);
    callers with more categories should use draw_ordinal_bar instead.

    value_fmt: optional formatter for the legend's value text. Default shows
    "count (pct of whole)"; pass e.g. `lambda v: f"{v:.0%}"` when `values`
    are already fractions/percentages rather than raw counts."""
    colors = colors or CATEGORICAL[: len(labels)]
    total = sum(values) or 1
    wedges, _ = ax.pie(
        values, colors=colors, startangle=90, counterclock=False,
        wedgeprops={"linewidth": 1.2, "edgecolor": SURFACE},
    )
    if value_fmt is not None:
        legend_labels = [f"{lab} — {value_fmt(v)}" for lab, v in zip(labels, values)]
    else:
        legend_labels = [f"{lab} — {v:,.0f} ({v / total:.0%})" for lab, v in zip(labels, values)]
    ax.legend(wedges, legend_labels, loc="center left", bbox_to_anchor=(1.05, 0.5),
              fontsize=7.5, handletextpad=0.5, labelspacing=0.5, borderaxespad=0)
    ax.set_aspect("equal")


def draw_weekly_band_small_multiples(fig: plt.Figure, rect: tuple, week_dates: list,
                                      bands: "list[BandSeries]", n_cols: int = 3) -> None:
    """Small-multiples grid: one mini panel per age/gender band, each panel a
    two-color (Male/Female, or a single muted bar for Unknown) bar-per-week
    chart. Used instead of a single stacked bar with 7-11 series, which is
    unreadable and exceeds the categorical palette's safe adjacent-pair count.

    `bands` is a list of BandSeries, each with a facet label (e.g. "6-7th
    Grade" or "Infants/Toddlers") and a dict of {series_name: [weekly
    values]} -- 1 or 2 entries (Male/Female, or a single "Count" series for
    the Unknown facet).
    """
    left, bottom, width, height = rect
    n = len(bands)
    n_rows = int(np.ceil(n / n_cols))
    week_labels = [d.strftime("%-m/%-d") if hasattr(d, "strftime") else str(d) for d in week_dates]
    gs = fig.add_gridspec(n_rows, n_cols, left=left, right=left + width, bottom=bottom, top=bottom + height,
                           hspace=0.85, wspace=0.35)
    x = np.arange(len(week_dates))
    for i, band in enumerate(bands):
        ax = fig.add_subplot(gs[i // n_cols, i % n_cols])
        n_series = len(band.series)
        bar_w = 0.7 / max(n_series, 1)
        for j, (name, values) in enumerate(band.series.items()):
            offset = (j - (n_series - 1) / 2) * bar_w
            ax.bar(x + offset, values, width=bar_w * 0.9, color=band.colors[name], label=name)
        ax.set_title(band.label, fontsize=8, color=INK_SECONDARY, fontweight="normal", pad=3)
        ax.set_xticks(x)
        ax.set_xticklabels(week_labels, fontsize=6, rotation=45, ha="right")
        ax.tick_params(axis="y", labelsize=6)
        ax.grid(axis="y")
        ax.grid(axis="x", visible=False)
        ax.tick_params(length=0)
        max_v = max((max(v) if v else 0) for v in band.series.values()) if band.series else 0
        ax.set_ylim(0, max_v * 1.25 if max_v else 1)
    # one shared legend for the whole grid (Male/Female colors are constant
    # across every panel, so a single legend suffices) -- placed well above
    # the grid's top row so it never collides with a panel's own title
    handles = [Patch(facecolor=MALE_COLOR, label="Male"), Patch(facecolor=FEMALE_COLOR, label="Female")]
    fig.legend(handles=handles, loc="upper right", bbox_to_anchor=(left + width, bottom + height + 0.06),
               ncols=2, fontsize=8, frameon=False)


def draw_weekly_stacked_clusters(fig: plt.Figure, rect: tuple, week_dates: list,
                                  bands: "list[BandSeries]") -> None:
    """Single-axes grouped-and-stacked bar: one cluster of bars per week
    date, one bar per band within the cluster, and each bar is a stack of
    its own series (Male on the bottom, Female on top; a band with only a
    single "Count" series -- the Unknown band -- renders as one plain,
    unstacked bar). Band identity is carried by horizontal position within
    each date's cluster rather than by a separate small-multiples panel, so
    a caption below the axes spells out the fixed left-to-right band order.
    """
    left, bottom, width, height = rect
    ax = fig.add_axes((left, bottom, width, height))
    n_dates = len(week_dates)
    n_bands = len(bands)
    cluster_width = 0.82
    bar_w = cluster_width / max(n_bands, 1)
    x = np.arange(n_dates)

    seen_labels = set()
    for i, band in enumerate(bands):
        offset = (i - (n_bands - 1) / 2) * bar_w
        stack_bottom = np.zeros(n_dates)
        series_names = [s for s in ("Male", "Female") if s in band.series]
        series_names += [s for s in band.series if s not in series_names]
        for name in series_names:
            values = np.array(band.series[name], dtype=float)
            label = name if name not in seen_labels else None
            ax.bar(x + offset, values, bottom=stack_bottom, width=bar_w * 0.88,
                   color=band.colors[name], label=label, linewidth=0)
            stack_bottom += values
            seen_labels.add(name)

    week_labels = [d.strftime("%-m/%-d") if hasattr(d, "strftime") else str(d) for d in week_dates]
    ax.set_xticks(x)
    ax.set_xticklabels(week_labels, fontsize=8)
    style_axes(ax)
    for xi in x[:-1]:
        ax.axvline(xi + 0.5, color=GRIDLINE, linewidth=0.6, zorder=0)
    ax.legend(loc="upper right", bbox_to_anchor=(1.0, 1.14), ncols=max(len(seen_labels), 1),
              fontsize=8, frameon=False)

    band_order_text = "Bands within each date cluster (left→right): " + " · ".join(
        b.label for b in bands
    )
    ax.text(0, -0.14, band_order_text, transform=ax.transAxes, fontsize=7.5,
            color=INK_MUTED, ha="left", va="top")


def shade_ramp(base_hex: str, n: int, light: float = 0.82, dark: float = 0.24,
               sat_boost: float = 0.18) -> list:
    """n hex colors from a light tint (index 0) to a dark shade (index n-1)
    of the SAME hue -- a sequential ramp for an ordinal category (e.g. an
    age/grade band) rather than a spread of unrelated categorical colors,
    per the dataviz guidance that magnitude/order reads as one hue, light to
    dark. Saturation is nudged up slightly as it darkens so the light end
    doesn't wash out."""
    r, g, b = mcolors.to_rgb(base_hex)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    colors = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.0
        li = light - t * (light - dark)
        si = min(1.0, s + t * sat_boost)
        rr, gg, bb = colorsys.hls_to_rgb(h, li, si)
        colors.append(mcolors.to_hex((rr, gg, bb)))
    return colors


def draw_weekly_stacked_by_age(fig: plt.Figure, rect: tuple, week_dates: list,
                                bands: "list[BandSeries]", base_color: str = CATEGORICAL[0]) -> None:
    """Single bar per week date: every band's total (both genders combined)
    stacked into ONE bar, youngest band at the bottom, oldest at the top --
    each band shaded a progressively darker step of the same hue so age
    order reads directly from color. A band whose label starts with
    "Unknown" always renders as the fixed muted gray, on top of the stack,
    never part of the age ramp (Unknown is an absence of identity, not
    another step in the sequence).
    """
    left, bottom, width, height = rect
    ax = fig.add_axes((left, bottom, width, height))
    n_dates = len(week_dates)
    x = np.arange(n_dates)

    known_bands = [b for b in bands if not b.label.lower().startswith("unknown")]
    unknown_bands = [b for b in bands if b.label.lower().startswith("unknown")]
    shades = shade_ramp(base_color, len(known_bands)) if known_bands else []

    stack_bottom = np.zeros(n_dates)
    handles = []
    for band, color in zip(known_bands, shades):
        totals = np.zeros(n_dates)
        for values in band.series.values():
            totals += np.array(values, dtype=float)
        ax.bar(x, totals, bottom=stack_bottom, width=0.6, color=color, linewidth=0)
        handles.append(Patch(facecolor=color, label=band.label))
        stack_bottom += totals
    for band in unknown_bands:
        totals = np.zeros(n_dates)
        for values in band.series.values():
            totals += np.array(values, dtype=float)
        ax.bar(x, totals, bottom=stack_bottom, width=0.6, color=UNKNOWN_COLOR, linewidth=0)
        handles.append(Patch(facecolor=UNKNOWN_COLOR, label=band.label))
        stack_bottom += totals

    week_labels = [d.strftime("%-m/%-d") if hasattr(d, "strftime") else str(d) for d in week_dates]
    ax.set_xticks(x)
    ax.set_xticklabels(week_labels, fontsize=8)
    style_axes(ax)
    # Anchor the legend a FIXED figure-fraction gap above the axes, not a
    # percentage of the axes' own height -- a percentage-based offset looks
    # right for a tall, full-page chart but collides with neighboring
    # content once this same chart is placed in a shorter rect (e.g. two
    # sections sharing one portrait-mode page).
    ax.legend(handles=handles, loc="lower right", bbox_to_anchor=(left + width, bottom + height + 0.03),
              bbox_transform=fig.transFigure, ncols=min(len(handles), 4), fontsize=7.5, frameon=False,
              columnspacing=1.0, handletextpad=0.5)


@dataclass
class BandSeries:
    label: str
    series: dict           # {"Male": [...], "Female": [...]} or {"Count": [...]}
    colors: dict            # {"Male": MALE_COLOR, ...}


def draw_trend_lines(ax: plt.Axes, week_dates: list, series: dict, colors: dict) -> None:
    """Week-over-week trend lines (the original templates' 'Attendance'
    scatter/smoothed-line chart)."""
    x = np.arange(len(week_dates))
    for name, values in series.items():
        ax.plot(x, values, marker="o", markersize=4, linewidth=1.6, color=colors[name], label=name)
    ax.set_xticks(x)
    week_labels = [d.strftime("%-m/%-d") if hasattr(d, "strftime") else str(d) for d in week_dates]
    ax.set_xticklabels(week_labels, rotation=30, ha="right", fontsize=7)
    style_axes(ax)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=7.5)


def draw_table(fig: plt.Figure, rect: tuple, col_labels: list, rows: list, title: str | None = None) -> None:
    left, bottom, width, height = rect
    ax = fig.add_axes(rect)
    ax.axis("off")
    if title:
        ax.text(0, 1.04, title, fontsize=10, fontweight="bold", color=INK_PRIMARY, transform=ax.transAxes)
    if not rows:
        ax.text(0.5, 0.5, "No entries this period.", ha="center", va="center",
                color=INK_MUTED, fontsize=9, transform=ax.transAxes)
        return
    table = ax.table(cellText=rows, colLabels=col_labels, loc="center", cellLoc="left", edges="horizontal")
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    table.scale(1, 1.35)
    for (r, c), cell in table.get_celld().items():
        cell.set_edgecolor(GRIDLINE)
        cell.set_linewidth(0.8)
        if r == 0:
            cell.set_text_props(fontweight="bold", color=INK_SECONDARY)
            cell.set_facecolor(SURFACE)
        else:
            cell.set_facecolor(SURFACE)
            cell.set_text_props(color=INK_PRIMARY)


def save_pdf(fig_list: list, out_path: str | Path, page_numbers: bool = True) -> None:
    out_path = Path(out_path)
    total = len(fig_list)
    with PdfPages(out_path) as pdf:
        for i, fig in enumerate(fig_list, start=1):
            if page_numbers:
                fig.text(0.94, 0.025, f"Page {i} of {total}", fontsize=8,
                          color=INK_MUTED, ha="right", va="bottom")
            pdf.savefig(fig, facecolor=SURFACE)
            plt.close(fig)


def full_bleed_axes(fig: plt.Figure, rect: tuple) -> plt.Axes:
    return fig.add_axes(rect)
