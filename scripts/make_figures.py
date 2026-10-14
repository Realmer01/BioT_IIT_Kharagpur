"""Render the validation figures used in the README and the presentation.

Usage:  python scripts/make_figures.py
Output: reports/figures/*.png
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from madhutwin.config import FIGURES, REPORTS  # noqa: E402

INK, INK2, MUTED, GRID, AXIS = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"
plt.rcParams.update({
    "font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 10.5, "axes.edgecolor": AXIS, "axes.labelcolor": INK2,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True, "figure.dpi": 200,
    "axes.titleweight": "semibold", "axes.titlesize": 12, "axes.titlecolor": INK, "legend.frameon": False,
})
MAIN = "MadhuTwin hybrid"


def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIGURES / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", name)


def main():
    m = json.load(open(REPORTS / "metrics_cgmacros.json"))
    reg = m["regression"]
    H = ["30", "60", "90", "120"]

    # 1. RMSE by horizon
    fig, ax = plt.subplots(figsize=(6.2, 3.6))
    ends = []
    for name, c, lw in ((MAIN, S1, 2.6), ("Fusion (streams + EHR)", S2, 2), ("Twin only (physiology)", S3, 2), ("Persistence", MUTED, 2)):
        y = [reg[name][h]["rmse"] for h in H]
        ax.plot([30, 60, 90, 120], y, color=c, lw=lw, marker="o", ms=5, mec="white", mew=1.5, label=name)
        ends.append([y[-1], y[-1], c])
    ends.sort(key=lambda e: e[0])
    for i in range(1, len(ends)):  # dodge end labels that would collide
        ends[i][1] = max(ends[i][1], ends[i - 1][1] + 1.8)
    for v, ypos, c in ends:
        ax.annotate(f"{v:.1f}", (120, v), xytext=(124, ypos), textcoords="data", va="center", color=c if c != MUTED else INK2,
                    fontsize=9, annotation_clip=False)
    ax.set_xlim(25, 128)
    ax.set_xticks([30, 60, 90, 120], ["30 min", "60 min", "90 min", "120 min"])
    ax.set_ylabel("RMSE (mg/dL)")
    ax.set_ylim(0, None)
    ax.set_title("Forecast error on unseen real patients (CGMacros)", loc="left")
    ax.legend(loc="upper left", fontsize=9)
    save(fig, "rmse_by_horizon.png")

    # 2. Stream ablation (AUROC)
    sets = ["EHR only", "CGM only", "Wearable streams", "Fusion (streams + EHR)", MAIN]
    auc = [m["events"]["ev_hyper"][s]["auroc"] for s in sets]
    fig, ax = plt.subplots(figsize=(6.2, 3.0))
    ax.barh(sets, auc, color=[S1 if s == MAIN else AXIS for s in sets], height=0.6)
    for i, v in enumerate(auc):
        ax.text(v + 0.004, i, f"{v:.3f}", va="center", fontsize=9, color=INK)
    ax.set_xlim(0.5, 0.9)
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("AUROC, hyperglycaemia onset (>180 mg/dL) within 2 h")
    ax.set_title("What each data stream adds", loc="left")
    save(fig, "ablation_auroc.png")

    # 3. Clarke error grid
    oof = pd.read_parquet(REPORTS / "oof_cgmacros.parquet", columns=["y_120", f"{MAIN}|120"]).dropna().sample(4000, random_state=0)
    fig, ax = plt.subplots(figsize=(4.6, 4.6))
    ax.scatter(oof["y_120"].clip(0, 400), oof[f"{MAIN}|120"].clip(0, 400), s=4, color=S1, alpha=0.3, lw=0)
    segs = [[0, 70, 175 / 3, 70], [175 / 3, 70, 400 / 1.2, 400], [70, 84, 70, 400], [0, 180, 70, 180], [70, 180, 290, 400],
            [70, 0, 70, 56], [70, 56, 400, 320], [180, 0, 180, 70], [180, 70, 400, 70], [240, 70, 240, 180], [240, 180, 400, 180], [130, 0, 180, 70]]
    for x1, y1, x2, y2 in segs:
        ax.plot([x1, x2], [y1, y2], color=INK2, lw=0.9)
    ax.plot([0, 400], [0, 400], color=AXIS, lw=0.8, ls=":")
    for txt, x, y in (("A", 30, 15), ("A", 370, 330), ("B", 370, 260), ("B", 280, 370), ("C", 160, 370), ("D", 30, 120), ("D", 370, 120), ("E", 30, 370), ("E", 370, 20)):
        ax.text(x, y, txt, fontsize=11, color=MUTED, weight="semibold")
    ax.set_xlim(0, 400)
    ax.set_ylim(0, 400)
    ax.set_xlabel("Actual glucose (mg/dL)")
    ax.set_ylabel("Predicted 2 h ahead (mg/dL)")
    r = reg[MAIN]["120"]
    ax.set_title(f"Clarke error grid: A {r['clarke_a']:.1f}%, A+B {r['clarke_ab']:.1f}%", loc="left", fontsize=11)
    save(fig, "clarke_grid.png")

    # 4. Meal response
    meals = pd.read_parquet(REPORTS / "meals_cgmacros.parquet")
    meals = meals[meals["phase"].eq("monitor")]
    pp = m["meal_ppgr"]["models"]
    fig, axs = plt.subplots(1, 2, figsize=(8.6, 3.4), gridspec_kw={"width_ratios": [1, 1.25]})
    axs[0].scatter(meals["peak_rise"], meals[f"pred|{MAIN}"], s=10, color=S1, alpha=0.5, lw=0)
    lim = [0, max(meals["peak_rise"].max(), 160)]
    axs[0].plot(lim, lim, color=AXIS, ls=":")
    axs[0].set_xlabel("Actual 2-h peak rise (mg/dL)")
    axs[0].set_ylabel("Predicted")
    axs[0].set_title(f"Hybrid twin, r = {pp[MAIN]['pearson_r']:.2f}", loc="left", fontsize=11)
    names = list(pp)
    vals = [pp[n]["pearson_r"] for n in names]
    axs[1].barh(names, vals, color=[S1 if n == MAIN else AXIS for n in names], height=0.6)
    for i, v in enumerate(vals):
        axs[1].text(max(v, 0) + 0.01, i, f"{v:.2f}", va="center", fontsize=9)
    axs[1].axvline(0, color=AXIS, lw=0.8)
    axs[1].invert_yaxis()
    axs[1].grid(axis="y", visible=False)
    axs[1].set_xlim(-0.2, 0.75)
    axs[1].set_xlabel("Pearson r on unseen meals")
    axs[1].set_title("Personal meal-response prediction", loc="left", fontsize=11)
    save(fig, "meal_response.png")

    # 5. Cold start
    tv = json.load(open(REPORTS / "twin_value.json"))
    t = tv["cold_start"]["table"]
    days = [0, 0.5, 1, 2, 4]
    fig, ax = plt.subplots(figsize=(5.6, 3.3))
    for lab, key, c in (("EHR-informed prior", "EHR prior", S1), ("Population prior", "Population prior", S2)):
        y = [t[f"{key}|{d:.1f}"]["rmse_120"] for d in days]
        ax.plot(days, y, color=c, lw=2.4, marker="o", ms=5, mec="white", mew=1.5, label=lab)
    ax.set_xticks(days, ["0 d", "0.5 d", "1 d", "2 d", "4 d"])
    ax.set_xlabel("Days of onboarding sensor data")
    ax.set_ylabel("Twin 2-h RMSE (mg/dL)")
    ax.set_title("The health record makes the twin useful on day zero", loc="left", fontsize=11)
    ax.legend()
    save(fig, "cold_start.png")

    if "learning_curve" in tv:
        lc = tv["learning_curve"]
        fig, ax = plt.subplots(figsize=(5.6, 3.3))
        ns = [6, 12, 24, 36]
        for name, c in ((MAIN, S1), ("Fusion (no twin)", S2), ("Twin only (physiology)", S3)):
            ax.plot(ns, [lc[f"{name}|120|{n}"] for n in ns], color=c, lw=2.2, marker="o", ms=5, mec="white", mew=1.5, label=name)
        ax.set_xticks(ns)
        ax.set_xlabel("Patients used to train the ML layer")
        ax.set_ylabel("2-h RMSE (mg/dL)")
        ax.set_title("Data efficiency", loc="left", fontsize=11)
        ax.legend()
        save(fig, "learning_curve.png")


if __name__ == "__main__":
    main()
