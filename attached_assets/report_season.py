"""
report_season.py
=================

Season report for Transform groups (added 2026-10-15). Modeled on the Young
Adults "2026 Winter" / "2026 Spring" reports Andrew built by hand, but for
any date range ("a season") instead of a calendar month or quarter:

  1. Overall Attendance -- the season's schedule (each night's date and,
     when Planning Center has one, its name), total attendance per night,
     and attendance per night by age band.
  2. Demographic Breakdown -- total attendees, 100% attendance rate, a
     season summary donut (age band x gender), nightly attendance stacked by
     gender/age, and how many people fall in each attendance-rate bucket.
  3. First-Time Guest Breakdown -- first-time attendees, share who came 2x
     or more, first-timer demographics, first-timers per night by
     gender/age, and first-timers' attendance-rate buckets.
  4. Attendance Rate Breakdown -- attendance-rate buckets as a share of each
     age band, and church engagement by age band (Baptized, Actively
     Serving, Taken Thrive).

Two audiences share this renderer and differ only in their age bands:
  --audience young_adults   18-22 / 23-29   (the YA reports)
  --audience groups         18-25 / 26-35 / 36-45 / 46-59 / 60+  (other Transform groups)
Anyone outside the bands, or with no birthdate, lands in "Other/Unknown age".
Ages are as of the season's first night.

Input is the same cleaned CSV every other engine reads (see report_common.py),
from either a Check-Ins event or Planning Center Groups -- the server writes
the same columns for both. Optional --meta-json carries what the CSV can't:
  {"seasonLabel": "Winter 2026", "sourceName": "Young Adults",
   "weekLabels": {"2026-01-15": "Relationship Panel", ...},
   "startDate": "2026-01-12", "endDate": "2026-03-22"}

"Actively serving" = a "Last served" date on or after 90 days before the
season's last night (the field only keeps the most recent date, so this is
read as of the day the report is prepared). "Taken Thrive" = "Completed
Thrive" has any yes-like value. "Baptized" = "Baptized?" is yes-like.
"""

from __future__ import annotations

import datetime as dt
import json
import textwrap
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

from report_common import (
    CATEGORICAL, FEMALE_COLOR, GRIDLINE, INK_MUTED, INK_PRIMARY, INK_SECONDARY, MALE_COLOR,
    SURFACE, UNKNOWN_COLOR, BASELINE,
    CleanedData, attendance_rate_bucket_edges, bucket_labels, bucket_series, draw_cover_page,
    draw_ordinal_bar, draw_pie, draw_report_header, draw_stat_tiles, first_timer_stats,
    grade_colors, load_cleaned_csv, new_page, nonzero_slices, save_pdf, section_title,
    setup_style, shade_ramp, style_axes, weekly_total_label,
)

ORG_NAME = "Transform Church"
OTHER_BAND = "Other/Unknown age"
OTHER_GROUP = "Other age or unknown"   # band x gender slice for anyone outside the bands
SERVING_WINDOW_DAYS = 90


@dataclass
class SeasonConfig:
    report_name: str
    people_word: str
    bands: list            # [(label, min_age, max_age)] youngest first


CONFIGS = {
    "young_adults": SeasonConfig(
        report_name="Young Adults Season Report",
        people_word="young adults",
        bands=[("18-22", 18, 22), ("23-29", 23, 29)],
    ),
    "groups": SeasonConfig(
        report_name="Transform Groups Season Report",
        people_word="attendees",
        bands=[("18-25", 18, 25), ("26-35", 26, 35), ("36-45", 36, 45), ("46-59", 46, 59), ("60+", 60, 200)],
    ),
}

YES_VALUES = {"true", "yes", "y", "1", "x", "checked", "completed", "complete", "done"}
NO_VALUES = {"", "false", "no", "n", "0", "none", "n/a", "na", "not completed", "incomplete", "unknown"}
DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y", "%d-%b-%Y", "%d-%b-%y"]


# ============================================================================
# Value parsing
# ============================================================================

def _parse_date(value):
    s = str(value or "").strip()
    if not s:
        return None
    s = s[:10] if len(s) >= 10 and s[4] == "-" else s
    for fmt in DATE_FORMATS:
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _yes(value) -> bool:
    v = str(value or "").strip().lower()
    if v in YES_VALUES:
        return True
    if v in NO_VALUES:
        return False
    # Any other non-empty value (e.g. a completion date) counts as yes.
    return True


def _normalize_gender(value):
    v = str(value or "").strip().lower()
    if v.startswith("m"):
        return "Male"
    if v.startswith("f"):
        return "Female"
    return None


def _age_on(birthdate, on: dt.date):
    if birthdate is None:
        return None
    years = on.year - birthdate.year - ((on.month, on.day) < (birthdate.month, birthdate.day))
    return years if 0 <= years < 120 else None


def _find_col(cols, *names):
    wanted = {n.lower() for n in names}
    return next((c for c in cols if c.strip().lower() in wanted), None)


def load_meta(path):
    if not path:
        return {}
    try:
        meta = json.loads(Path(path).read_text(encoding="utf-8"))
        return meta if isinstance(meta, dict) else {}
    except (OSError, ValueError):
        return {}


def season_label_for(dates: list) -> str:
    """'Winter 2026' etc. from the season's first night: Jan-Mar Winter,
    Apr-Jun Spring, Jul-Aug Summer, Sep-Dec Fall."""
    if not dates:
        return "Season"
    d = dates[0]
    name = "Winter" if d.month <= 3 else "Spring" if d.month <= 6 else "Summer" if d.month <= 8 else "Fall"
    return f"{name} {d.year}"


# ============================================================================
# Data prep
# ============================================================================

def prepare(data: CleanedData, config: SeasonConfig, season_start: dt.date, season_end: dt.date) -> pd.DataFrame:
    df = data.df.copy()
    cols = data.fixed_cols
    gender_col = _find_col(cols, "gender")
    birth_col = _find_col(cols, "birthdate", "birth date")
    ft_col = _find_col(cols, "first timers", "first timer")
    bap_col = _find_col(cols, "baptized?", "baptized")
    thrive_col = _find_col(cols, "completed thrive", "thrive")
    served_col = _find_col(cols, "last served", "last_served")

    df["_gender"] = df[gender_col].apply(_normalize_gender) if gender_col else None
    ages = df[birth_col].apply(lambda v: _age_on(_parse_date(v), season_start)) if birth_col else pd.Series(None, index=df.index)

    def band_for(age):
        if age is None or (isinstance(age, float) and np.isnan(age)):
            return OTHER_BAND
        for label, lo, hi in config.bands:
            if lo <= age <= hi:
                return label
        return OTHER_BAND

    df["_band"] = ages.apply(band_for)
    df["_first_timer"] = df[ft_col].apply(lambda v: str(v).strip().lower() == "first-timer") if ft_col else False
    df["_baptized"] = df[bap_col].apply(_yes) if bap_col else False
    df["_thrive"] = df[thrive_col].apply(_yes) if thrive_col else False
    cutoff = season_end - dt.timedelta(days=SERVING_WINDOW_DAYS)
    if served_col:
        df["_serving"] = df[served_col].apply(lambda v: (_parse_date(v) or dt.date.min) >= cutoff)
    else:
        df["_serving"] = False
    return df


def demo_groups(config: SeasonConfig, df: pd.DataFrame) -> list:
    """(label, mask, color) for every age band x gender, youngest first,
    then Other/Unknown (only when anyone is in it)."""
    n = len(config.bands)
    male_shades = shade_ramp(MALE_COLOR, n, light=0.70, dark=0.30) if n > 1 else [MALE_COLOR]
    female_shades = shade_ramp(FEMALE_COLOR, n, light=0.78, dark=0.38) if n > 1 else [FEMALE_COLOR]
    out = []
    for i, (label, _lo, _hi) in enumerate(config.bands):
        band = df["_band"] == label
        out.append((f"{label} Male", band & (df["_gender"] == "Male"), male_shades[i]))
        out.append((f"{label} Female", band & (df["_gender"] == "Female"), female_shades[i]))
    known = pd.Series(False, index=df.index)
    for _label, mask, _c in out:
        known |= mask
    other = ~known
    if bool(other.any()):
        out.append((OTHER_GROUP, other, UNKNOWN_COLOR))
    return out


def band_list(config: SeasonConfig, df: pd.DataFrame) -> list:
    labels = [b[0] for b in config.bands]
    if bool((df["_band"] == OTHER_BAND).any()):
        labels.append(OTHER_BAND)
    return labels


# ============================================================================
# Drawing helpers specific to this report
# ============================================================================

def _wrap(text: str, width: int, lines: int) -> str:
    parts = textwrap.wrap(text, width, break_long_words=False) or [""]
    if len(parts) > lines:
        parts = parts[:lines]
        parts[-1] = parts[-1][: max(width - 1, 1)].rstrip() + "…"
    return "\n".join(parts)


def night_tick_labels(week_dates: list, week_cols: list, labels: dict) -> list:
    """Date over the night's name (wrapped to fit under one bar)."""
    width = 14 if len(week_dates) <= 8 else 11 if len(week_dates) <= 12 else 0
    out = []
    for d, col in zip(week_dates, week_cols):
        name = (labels.get(col) or labels.get(d.isoformat()) or "").strip()
        short = d.strftime("%-m/%-d")
        out.append(f"{short}\n{_wrap(name, width, 2)}" if name and width else short)
    return out


def draw_schedule(fig, rect, week_dates, week_cols, labels, skipped):
    """The season's nights as a compact two-row-per-line grid: date over
    night name. Weeks nobody attended are shaded and marked."""
    left, bottom, width, height = rect
    ax = fig.add_axes(rect)
    ax.axis("off")
    n = len(week_dates)
    if not n:
        return
    per_row = min(n, 7)
    rows = int(np.ceil(n / per_row))
    cell_w = 1.0 / per_row
    row_h = 1.0 / rows
    for i, (d, col) in enumerate(zip(week_dates, week_cols)):
        r, c = divmod(i, per_row)
        x0 = c * cell_w
        y0 = 1 - (r + 1) * row_h
        off = col in skipped
        ax.add_patch(plt.Rectangle((x0 + 0.004, y0 + 0.06 * row_h), cell_w - 0.008, row_h * 0.88,
                                   facecolor="#f1f0ec" if off else SURFACE, edgecolor=GRIDLINE, linewidth=0.8,
                                   transform=ax.transAxes))
        ax.text(x0 + cell_w / 2, y0 + row_h * 0.70, d.strftime("%a %-m/%-d"), ha="center", va="center",
                fontsize=8, fontweight="bold", color=INK_PRIMARY, transform=ax.transAxes)
        name = (labels.get(col) or labels.get(d.isoformat()) or "").strip()
        if off:
            name = (name + " (no attendance)") if name else "No attendance"
        ax.text(x0 + cell_w / 2, y0 + row_h * 0.32, _wrap(name, 18, 2) if name else "—", ha="center",
                va="center", fontsize=6.3, linespacing=1.1,
                color=INK_MUTED if off or not name else INK_SECONDARY, transform=ax.transAxes)


def draw_bar_values(ax, x, values, offset=0.0, fmt=lambda v: f"{v:,.0f}", fontsize=7):
    ymax = max(values) if len(values) else 0
    for xi, v in zip(x, values):
        ax.text(xi + offset, v + max(ymax, 1) * 0.015, fmt(v), ha="center", va="bottom",
                fontsize=fontsize, color=INK_SECONDARY)


def draw_grouped_weekly(ax, tick_labels, series: dict, colors: dict):
    n_series = max(len(series), 1)
    x = np.arange(len(tick_labels))
    width = 0.8 / n_series
    ymax = 0
    for i, (name, values) in enumerate(series.items()):
        offset = (i - (n_series - 1) / 2) * width
        ax.bar(x + offset, values, width=width * 0.9, color=colors[name], label=name, linewidth=0)
        ymax = max(ymax, max(values) if values else 0)
        if n_series <= 3:
            draw_bar_values(ax, x, values, offset=offset, fontsize=6.5)
    ax.set_xticks(x)
    ax.set_xticklabels(tick_labels, fontsize=6.8)
    style_axes(ax)
    ax.set_ylim(0, ymax * 1.18 if ymax else 1)
    ax.yaxis.set_major_locator(plt.MaxNLocator(integer=True, nbins=5))
    ax.legend(loc="lower right", bbox_to_anchor=(1.0, 1.01), ncols=min(n_series, 5), fontsize=7.5, frameon=False)


def draw_stacked_weekly(ax, tick_labels, groups: list, week_cols: list, df: pd.DataFrame,
                        show_totals: bool = True):
    """groups: [(label, mask, color)] stacked bottom-up in order."""
    x = np.arange(len(tick_labels))
    bottom = np.zeros(len(week_cols))
    handles = []
    for label, mask, color in groups:
        values = np.array([int(df.loc[mask, w].sum()) for w in week_cols], dtype=float)
        ax.bar(x, values, bottom=bottom, width=0.62, color=color, linewidth=0)
        for xi, b, v in zip(x, bottom, values):
            if v >= 3:
                ax.text(xi, b + v / 2, f"{v:.0f}", ha="center", va="center", fontsize=6,
                        color="white" if color not in (UNKNOWN_COLOR,) else INK_PRIMARY)
        bottom += values
        handles.append(Patch(facecolor=color, label=label))
    if show_totals:
        ymax = bottom.max() if len(bottom) else 0
        for xi, v in zip(x, bottom):
            ax.text(xi, v + max(ymax, 1) * 0.015, f"{v:.0f}", ha="center", va="bottom",
                    fontsize=7, fontweight="bold", color=INK_SECONDARY)
    ax.set_xticks(x)
    ax.set_xticklabels(tick_labels, fontsize=6.8)
    style_axes(ax)
    top = bottom.max() if len(bottom) else 0
    ax.set_ylim(0, top * 1.15 if top else 1)
    ax.yaxis.set_major_locator(plt.MaxNLocator(integer=True, nbins=5))
    if not top:
        ax.set_yticks([])
        ax.text(0.5, 0.5, "No attendance to show", ha="center", va="center", color=INK_MUTED,
                fontsize=9, transform=ax.transAxes)
    ax.legend(handles=handles, loc="lower right", bbox_to_anchor=(1.0, 1.01),
              ncols=min(len(handles), 4), fontsize=7, frameon=False, columnspacing=1.0, handletextpad=0.5)


def draw_rate_share_bars(ax, row_labels: list, shares: list, bucket_lbls: list, counts: list):
    """100% stacked horizontal bars: each row (an age band, or everyone) split
    into attendance-rate buckets. shares: list of lists (fractions)."""
    colors = grade_colors(len(bucket_lbls), False, CATEGORICAL[2])
    y = np.arange(len(row_labels))
    left = np.zeros(len(row_labels))
    for j, lbl in enumerate(bucket_lbls):
        vals = np.array([row[j] for row in shares])
        ax.barh(y, vals, left=left, height=0.58, color=colors[j], label=lbl, linewidth=0)
        for yi, l0, v in zip(y, left, vals):
            if v >= 0.06:
                ax.text(l0 + v / 2, yi, f"{v:.0%}", ha="center", va="center", fontsize=7.5,
                        color="white" if j >= len(bucket_lbls) // 2 else INK_PRIMARY, fontweight="bold")
        left += vals
    ax.set_yticks(y)
    ax.set_yticklabels([f"{lbl}\n({n:,} people)" for lbl, n in zip(row_labels, counts)], fontsize=8)
    ax.invert_yaxis()
    ax.set_xlim(0, 1)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _p: f"{v:.0%}"))
    style_axes(ax)
    ax.grid(axis="x")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower right", bbox_to_anchor=(1.0, 1.01), ncols=len(bucket_lbls), fontsize=7.5,
              frameon=False, title="Share of nights attended", title_fontsize=7.5)


def draw_engagement(ax, row_labels: list, metrics: dict, colors: dict):
    """Grouped horizontal bars: one group per age band (and everyone), one bar
    per engagement metric, values as a share of that group's attendees."""
    n_metrics = len(metrics)
    y = np.arange(len(row_labels))
    h = 0.8 / max(n_metrics, 1)
    for i, (name, values) in enumerate(metrics.items()):
        offset = (i - (n_metrics - 1) / 2) * h
        ax.barh(y + offset, values, height=h * 0.9, color=colors[name], label=name, linewidth=0)
        for yi, v in zip(y, values):
            ax.text(v + 0.01, yi + offset, f"{v:.0%}", va="center", ha="left", fontsize=7, color=INK_SECONDARY)
    ax.set_yticks(y)
    ax.set_yticklabels(row_labels, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlim(0, 1.08)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _p: f"{v:.0%}" if v <= 1 else ""))
    style_axes(ax)
    ax.grid(axis="x")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower right", bbox_to_anchor=(1.0, 1.01), ncols=n_metrics, fontsize=7.5, frameon=False)


# ============================================================================
# Render
# ============================================================================

def render(data: CleanedData, config: SeasonConfig, meta: dict | None = None,
           logo_path: str | Path | None = None) -> list:
    setup_style()
    meta = meta or {}
    week_dates = data.week_dates
    week_cols = data.week_cols
    season_start = _parse_date(meta.get("startDate")) or (week_dates[0] if week_dates else dt.date.today())
    season_end = _parse_date(meta.get("endDate")) or (week_dates[-1] if week_dates else dt.date.today())
    first_night = week_dates[0] if week_dates else season_start
    last_night = week_dates[-1] if week_dates else season_end
    df = prepare(data, config, first_night, last_night)

    season_label = str(meta.get("seasonLabel") or "").strip() or season_label_for(week_dates)
    range_label = (f"{first_night:%b %-d} – {last_night:%b %-d, %Y}" if week_dates else "")
    period_label = f"{season_label} · {range_label}" if range_label else season_label
    source_name = str(meta.get("sourceName") or "").strip()
    week_labels = meta.get("weekLabels") if isinstance(meta.get("weekLabels"), dict) else {}
    held = set(data.held_week_cols)
    skipped = {w for w in week_cols if w not in held}

    figsize = (8.5, 11)
    logo = str(logo_path) if logo_path and Path(logo_path).exists() else None
    title = config.report_name
    header_sub = source_name or None
    figs = []

    generated = f"Generated {dt.date.today():%b %d, %Y}"
    if source_name:
        generated = f"{source_name} · {generated}"
    figs.append(draw_cover_page(figsize, ORG_NAME, title, period_label, logo_path=logo, generated=generated))

    total = len(df)
    num_nights = data.num_weeks
    edges = attendance_rate_bucket_edges(num_nights)
    bucket_lbls = bucket_labels(edges)
    df["_bucket"] = bucket_series(df["Attendance Rate"], edges) if total else pd.Series(dtype=str)
    perfect = int((df["Attendance Rate"] >= 0.999).sum()) if total else 0
    avg_rate = float(df["Attendance Rate"].mean()) if total else 0.0
    weekly_totals = [int(df[w].sum()) for w in week_cols]
    held_totals = [v for w, v in zip(week_cols, weekly_totals) if w in held]
    avg_night = (sum(held_totals) / len(held_totals)) if held_totals else 0.0
    ticks = night_tick_labels(week_dates, week_cols, week_labels)
    bands = band_list(config, df)
    groups = demo_groups(config, df)

    # ---- Page 1: Overall Attendance ----
    f1 = new_page(figsize)
    draw_report_header(f1, title, period_label, subtitle=header_sub, logo_path=logo)
    draw_stat_tiles(f1, (0.06, 0.845, 0.88, 0.05), [
        ("Nights", f"{num_nights}" + (f" (+{len(skipped)} off)" if skipped else "")),
        ("Total attendees", f"{total:,}"),
        ("Avg. per night", f"{avg_night:.0f}"),
        ("Peak night", f"{max(weekly_totals) if weekly_totals else 0:,}"),
    ])
    section_title(f1, 0.06, 0.80, "Season Schedule")
    sched_rows = int(np.ceil(len(week_dates) / 7)) if week_dates else 1
    sched_h = 0.06 * sched_rows
    draw_schedule(f1, (0.06, 0.79 - sched_h, 0.88, sched_h), week_dates, week_cols, week_labels, skipped)
    top = 0.79 - sched_h - 0.06
    section_title(f1, 0.06, top, "Overall Attendance Summary", "Unique people at each night")
    ax = f1.add_axes((0.08, top - 0.27, 0.86, 0.22))
    draw_ordinal_bar(ax, ticks, weekly_totals, color=CATEGORICAL[0], horizontal=False, value_fmt=weekly_total_label)
    ax.tick_params(axis="x", labelsize=6.8)
    top2 = top - 0.36
    section_title(f1, 0.06, top2, "Attendance by Age", "Each night's attendees by age band")
    band_colors = dict(zip([b[0] for b in config.bands], shade_ramp(CATEGORICAL[0], len(config.bands), light=0.72, dark=0.32)
                           if len(config.bands) > 1 else [CATEGORICAL[0]]))
    band_colors[OTHER_BAND] = UNKNOWN_COLOR
    ax = f1.add_axes((0.08, 0.07, 0.86, top2 - 0.12))
    draw_grouped_weekly(ax, ticks, {b: [int(df.loc[df["_band"] == b, w].sum()) for w in week_cols] for b in bands},
                        band_colors)
    figs.append(f1)

    # ---- Page 2: Demographic Breakdown ----
    f2 = new_page(figsize)
    draw_report_header(f2, title, period_label, subtitle=header_sub, logo_path=logo)
    section_title(f2, 0.06, 0.875, "Demographic Breakdown", f"Everyone who attended this season, by age band and gender")
    draw_stat_tiles(f2, (0.06, 0.80, 0.88, 0.05), [
        ("Total attendees", f"{total:,}"),
        ("100% attendance rate", f"{perfect / total:.0%}" if total else "0%"),
        ("Avg. attendance rate", f"{avg_rate:.0%}"),
        ("Other age or unknown", f"{int(sum(m.sum() for l, m, c in groups if l == OTHER_GROUP))}"),
    ])
    fig_w, fig_h = f2.get_size_inches()
    donut_h = 0.17
    donut_w = donut_h * fig_h / fig_w
    f2.text(0.27, 0.755, "Season Summary", fontsize=10, fontweight="bold", color=INK_PRIMARY, ha="center")
    ax = f2.add_axes((0.27 - donut_w / 2, 0.555, donut_w, donut_h))
    lab, val, col = nonzero_slices([g[0] for g in groups], [int(g[1].sum()) for g in groups], [g[2] for g in groups])
    draw_pie(ax, lab, val, colors=col, legend_fontsize=7, legend_below=True)
    f2.text(0.73, 0.755, "Overall Attendance", fontsize=10, fontweight="bold", color=INK_PRIMARY, ha="center")
    f2.text(0.73, 0.742, f"People by share of the {num_nights} nights they attended", fontsize=7.5,
            color=INK_MUTED, ha="center", va="top")
    ax = f2.add_axes((0.73 - donut_w / 2, 0.555, donut_w, donut_h))
    bucket_counts = [int((df["_bucket"] == l).sum()) for l in bucket_lbls] if total else [0] * len(bucket_lbls)
    lab, val, col = nonzero_slices(bucket_lbls, bucket_counts, grade_colors(len(bucket_lbls), False, CATEGORICAL[2]))
    draw_pie(ax, lab, val, colors=col, legend_fontsize=7, legend_below=True)
    section_title(f2, 0.06, 0.40, "Nightly Attendance by Gender/Age")
    ax = f2.add_axes((0.08, 0.07, 0.86, 0.27))
    draw_stacked_weekly(ax, ticks, groups, week_cols, df)
    figs.append(f2)

    # ---- Page 3: First Time Guest Breakdown ----
    ft = df[df["_first_timer"]] if total else df
    ft_stats = first_timer_stats(ft, week_cols, week_dates)
    f3 = new_page(figsize)
    draw_report_header(f3, title, period_label, subtitle=header_sub, logo_path=logo)
    section_title(f3, 0.06, 0.875, "First Time Guest Breakdown",
                  f"New {config.people_word} this season, and how many kept coming")
    draw_stat_tiles(f3, (0.06, 0.80, 0.88, 0.05), [
        ("First time attendees", f"{ft_stats.total:,}"),
        ("Attended 2x or more", f"{ft_stats.return_rate:.0%}"),
        ("Avg. nights each", f"{ft_stats.avg_visits:.1f}"),
        ("Share of all attendees", f"{ft_stats.total / total:.0%}" if total else "0%"),
    ])
    ft_groups = demo_groups(config, ft) if len(ft) else []
    f3.text(0.27, 0.755, "First Time Demographic", fontsize=10, fontweight="bold", color=INK_PRIMARY, ha="center")
    ax = f3.add_axes((0.27 - donut_w / 2, 0.555, donut_w, donut_h))
    if ft_groups:
        lab, val, col = nonzero_slices([g[0] for g in ft_groups], [int(g[1].sum()) for g in ft_groups],
                                       [g[2] for g in ft_groups])
        draw_pie(ax, lab, val, colors=col, legend_fontsize=7, legend_below=True)
    else:
        draw_pie(ax, ["None"], [0])
    f3.text(0.73, 0.755, "First Time Attendance", fontsize=10, fontweight="bold", color=INK_PRIMARY, ha="center")
    f3.text(0.73, 0.742, "First-timers by share of nights attended", fontsize=7.5, color=INK_MUTED, ha="center", va="top")
    ax = f3.add_axes((0.73 - donut_w / 2, 0.555, donut_w, donut_h))
    ft_bucket_counts = [int((ft["_bucket"] == l).sum()) for l in bucket_lbls] if len(ft) else [0] * len(bucket_lbls)
    lab, val, col = nonzero_slices(bucket_lbls, ft_bucket_counts, grade_colors(len(bucket_lbls), False, CATEGORICAL[2]))
    draw_pie(ax, lab, val, colors=col, legend_fontsize=7, legend_below=True)
    section_title(f3, 0.06, 0.40, "First-Timers by Night", "Each night's first-time attendees by gender/age (their attendance every night after, too)")
    ax = f3.add_axes((0.08, 0.07, 0.86, 0.27))
    if ft_groups:
        draw_stacked_weekly(ax, ticks, ft_groups, week_cols, ft)
    else:
        ax.axis("off")
        ax.text(0.5, 0.5, "No first-time attendees this season.", ha="center", va="center", color=INK_MUTED)
    figs.append(f3)

    # ---- Page 4: Attendance Rate Breakdown + Church Engagement ----
    f4 = new_page(figsize)
    draw_report_header(f4, title, period_label, subtitle=header_sub, logo_path=logo)
    section_title(f4, 0.06, 0.875, "Attendance Rate Breakdown",
                  f"How consistently each age band came: share of people by nights attended (of {num_nights})")
    rows = ["All Attendees"] + bands
    masks = [pd.Series(True, index=df.index)] + [df["_band"] == b for b in bands]
    shares, counts = [], []
    for m in masks:
        n = int(m.sum())
        counts.append(n)
        shares.append([((df.loc[m, "_bucket"] == l).sum() / n) if n else 0.0 for l in bucket_lbls])
    row_h = min(0.065, 0.34 / len(rows))
    rate_h = row_h * len(rows)
    ax = f4.add_axes((0.24, 0.80 - rate_h, 0.70, rate_h))
    draw_rate_share_bars(ax, rows, shares, bucket_lbls, counts)
    eng_top = 0.80 - rate_h - 0.09
    section_title(f4, 0.06, eng_top, "Attendee Church Engagement by Age",
                  f"Share of this season's attendees · serving = served within {SERVING_WINDOW_DAYS} days of the last night or since")
    eng_rows = ["Total"] + bands
    metrics = {
        "Baptized": [float(df.loc[m, "_baptized"].mean()) if int(m.sum()) else 0.0 for m in masks],
        "Actively Serving": [float(df.loc[m, "_serving"].mean()) if int(m.sum()) else 0.0 for m in masks],
        "Taken Thrive": [float(df.loc[m, "_thrive"].mean()) if int(m.sum()) else 0.0 for m in masks],
    }
    eng_colors = {"Baptized": CATEGORICAL[0], "Actively Serving": CATEGORICAL[5], "Taken Thrive": CATEGORICAL[1]}
    eng_h = min(0.11 * len(eng_rows), eng_top - 0.13)
    ax = f4.add_axes((0.24, eng_top - 0.05 - eng_h, 0.70, eng_h))
    draw_engagement(ax, eng_rows, metrics, eng_colors)
    figs.append(f4)
    return figs


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Transform group season report")
    ap.add_argument("--audience", required=True, choices=sorted(CONFIGS))
    ap.add_argument("--data", required=True)
    ap.add_argument("--out-pdf", required=True)
    ap.add_argument("--meta-json", help="season label, source name and night names (see module docstring)")
    ap.add_argument("--logo", help="optional logo image")
    # Accepted (and ignored) so the server can pass the same trend flag it
    # passes every engine; season reports chart their own nights.
    ap.add_argument("--trend-json")
    args = ap.parse_args()

    data = load_cleaned_csv(args.data)
    figs = render(data, CONFIGS[args.audience], meta=load_meta(args.meta_json), logo_path=args.logo)
    save_pdf(figs, args.out_pdf)
    print(f"Wrote {args.out_pdf}")


if __name__ == "__main__":
    main()
