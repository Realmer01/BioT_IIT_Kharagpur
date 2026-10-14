"""Mechanistic core of the MadhuTwin digital twin.

An extended Bergman minimal model of glucose-insulin dynamics:

    dG/dt  = -(S_G + X + a_ex*E) G + EGP(t) + Ra(t) - U_renal(G)
    dX/dt  = -p2 X + p2 S_I(t) I
    dI/dt  = -n I + beta*(G - h)^+ + secretagogue + exogenous insulin
    gut    : two parallel two-compartment absorption chains (fast / slow carbs)
    dE/dt  = (u_ex(t) - E) / tau_ex           (exercise effect, from METs)

with
    EGP(t) = S_G*Gb*egp_mult(t)*(1 - metformin - 0.04*dpp4) + dawn*bump(06:00)
             + counter-regulation below 72 mg/dL
    S_I(t) = S_I * sleep_mult(t) * (1 + circ*cos(2*pi*(hour-9)/24)) * (1 + 0.3*pio)
    Ra(t)  = f * (k_f Q2f + k_s Q2s) * 1000 / (V_G * BW)

Units: glucose mg/dL, insulin uU/mL (above basal), time in minutes, carbs in g.
Pharmacodynamic modifiers cover the drug classes most prescribed for T2D in
India (metformin, sulfonylureas, DPP-4 inhibitors incl. teneligliptin, SGLT2
inhibitors, alpha-glucosidase inhibitors e.g. voglibose, pioglitazone, basal
insulin). All integrators are numba-compiled so the twin can run thousands of
what-if simulations per second on a laptop CPU.
"""
from __future__ import annotations

import math

import numpy as np
from numba import njit, prange

# ----------------------------------------------------------------------------- states
S_G, S_X, S_I, S_Q1F, S_Q2F, S_Q1S, S_Q2S, S_E, S_D = range(9)
N_STATES = 9
# D is an "unexplained glucose flux" disturbance state (offset-free MPC style):
# it absorbs unlogged snacks, stress hormones and sensor drift so the forecast
# respects the current trend, then decays with time constant tau_d.
STATE_NAMES = ("G", "X", "I", "Q1_fast", "Q2_fast", "Q1_slow", "Q2_slow", "E", "D")

# ----------------------------------------------------------------------------- params
PARAM_NAMES = (
    "Gb",  # drug-free basal glucose, mg/dL
    "SG",  # glucose effectiveness, 1/min
    "SI",  # insulin sensitivity, 1/min per uU/mL
    "beta",  # beta-cell responsiveness, uU/mL/min per mg/dL
    "k_scale",  # gut absorption speed multiplier (-)
    "f",  # effective carbohydrate bioavailability (-), absorbs carb-estimate bias
    "alpha_ex",  # exercise-driven insulin-independent uptake, 1/min per MET
    "dawn",  # dawn-phenomenon hepatic output amplitude, mg/dL/min
    "circ",  # circadian insulin-sensitivity amplitude (-); + = more sensitive mornings
    "BW",  # body weight, kg
    "p2",  # insulin action rate, 1/min
    "n",  # insulin clearance, 1/min
    "met",  # metformin effect on hepatic output (0..0.25)
    "su",  # sulfonylurea intensity (0..1)
    "dpp4",  # DPP-4 inhibitor (0/1)
    "sglt2",  # SGLT2 inhibitor (0/1)
    "agi",  # alpha-glucosidase inhibitor, e.g. voglibose (0/1)
    "pio",  # pioglitazone (0/1)
    "ins_basal",  # basal insulin, units/day
    "tau_d",  # decay time of the disturbance state, min
)
P = {name: i for i, name in enumerate(PARAM_NAMES)}
N_PARAMS = len(PARAM_NAMES)

# Fixed physiological constants
VG = 1.6  # glucose distribution volume, dL/kg
K_FAST = 0.045  # 1/min, high-GI carbohydrate absorption chain
K_SLOW = 0.012  # 1/min, low-GI / fat-fibre-protein-slowed chain
TAU_EX = 15.0  # min
RENAL_THR = 180.0  # mg/dL, physiological renal threshold
RENAL_K = 0.002  # 1/min
SU_SECR = 3.0  # uU/mL/min glucose-independent secretion at full dose (~20 % FPG reduction)
INS_UNIT = 0.8  # uU/mL steady-state rise per unit/day of basal insulin
G_FLOOR = 20.0
CR_THR = 72.0  # mg/dL, counter-regulatory threshold
CR_GAIN = 0.012  # (mg/dL/min) per mg/dL below threshold


def default_params(**overrides) -> np.ndarray:
    """A typical early-T2D Indian adult; used as a template before personalisation."""
    p = np.zeros(N_PARAMS)
    base = dict(
        Gb=130.0, SG=0.012, SI=2.5e-4, beta=0.08, k_scale=1.0, f=0.7, alpha_ex=0.004,
        dawn=0.03, circ=0.0, BW=70.0, p2=0.025, n=0.14, tau_d=45.0,
    )
    base.update(overrides)
    for k, v in base.items():
        p[P[k]] = v
    return p


@njit(cache=True, fastmath=True, inline="always")
def _step(x, p, in_f, in_s, u_ex, si_mult, egp_mult, hour):
    """One explicit-Euler minute of the twin; updates ``x`` in place."""
    G = x[0]
    X = x[1]
    I = x[2]
    Q1f = x[3]
    Q2f = x[4]
    Q1s = x[5]
    Q2s = x[6]
    E = x[7]
    D = x[8]

    Gb = p[0]
    SG = p[1]
    SI = p[2]
    beta = p[3]
    ks = p[4]
    f = p[5]
    aex = p[6]
    dawn = p[7]
    circ = p[8]
    BW = p[9]
    p2 = p[10]
    n = p[11]
    met = p[12]
    su = p[13]
    dpp4 = p[14]
    sglt2 = p[15]
    agi = p[16]
    pio = p[17]
    insb = p[18]
    tau_d = p[19]

    # alpha-glucosidase inhibitors shift carbohydrate into the slow chain
    shift = 0.4 * agi * in_f
    in_f2 = in_f - shift
    in_s2 = in_s + shift

    kf = K_FAST * ks
    kk = K_SLOW * ks
    Ra = f * (1.0 - 0.05 * agi) * (kf * Q2f + kk * Q2s) * 1000.0 / (VG * BW)

    h = hour % 24.0
    circ_term = 1.0 + circ * math.cos(2.0 * math.pi * (h - 9.0) / 24.0)
    SIe = SI * si_mult * circ_term * (1.0 + 0.3 * pio)

    dh = h - 6.0
    if dh > 12.0:
        dh -= 24.0
    egp = SG * Gb * egp_mult * (1.0 - met - 0.04 * dpp4) + dawn * math.exp(-0.5 * (dh / 1.5) ** 2)
    # counter-regulation (glucagon/adrenaline) below ~72 mg/dL
    egp += CR_GAIN * max(CR_THR - G, 0.0)

    thr = RENAL_THR - 100.0 * sglt2
    renal = RENAL_K * (1.0 + sglt2) * max(G - thr, 0.0)

    thr_secr = Gb * (1.0 - met)
    secr = beta * (1.0 + 0.25 * dpp4 + 0.3 * su) * max(G - thr_secr, 0.0)
    secr += su * SU_SECR + insb * INS_UNIT * n

    dG = -(SG + X + aex * E) * G + egp + Ra - renal + D
    dX = -p2 * X + p2 * SIe * I
    dI = -n * I + secr

    x[0] = max(G + dG, G_FLOOR)
    x[1] = max(X + dX, 0.0)
    x[2] = max(I + dI, 0.0)
    x[3] = Q1f + in_f2 - kf * Q1f
    x[4] = Q2f + kf * (Q1f - Q2f)
    x[5] = Q1s + in_s2 - kk * Q1s
    x[6] = Q2s + kk * (Q1s - Q2s)
    x[7] = E + (u_ex - E) / TAU_EX
    x[8] = D * (1.0 - 1.0 / tau_d)


@njit(cache=True)
def steady_state(p):
    """Fasting steady state (no meals, no exercise) incl. drug effects."""
    x = np.zeros(N_STATES)
    x[0] = p[0] * (1.0 - p[12])
    for k in range(6000):  # ~4 days of fasting dynamics, converges well before
        _step(x, p, 0.0, 0.0, 0.0, 1.0, 1.0, 3.0)  # 03:00, outside dawn window
    return x


@njit(cache=True)
def simulate(p, x0, in_f, in_s, u_ex, si_mult, egp_mult, hour0):
    """Integrate the twin from state ``x0``; returns states (n+1, N_STATES)."""
    n = len(in_f)
    out = np.empty((n + 1, N_STATES))
    x = x0.copy()
    out[0] = x
    for t in range(n):
        _step(x, p, in_f[t], in_s[t], u_ex[t], si_mult[t], egp_mult[t], hour0 + t / 60.0)
        out[t + 1] = x
    return out


@njit(cache=True)
def observe(p, cgm, in_f, in_s, u_ex, si_mult, egp_mult, hour0, gain, gain_d):
    """State synchronisation: run the twin alongside the CGM stream.

    A fixed-gain (steady-state Kalman) observer corrects glucose whenever a
    sensor sample arrives; unobserved states (insulin, insulin action, gut
    content, exercise effect) evolve through the physiology, and the innovation
    also updates the disturbance state D (integral action). Returns the
    synchronised state at the end of every minute, shape (n, N_STATES).
    """
    n = len(cgm)
    out = np.empty((n, N_STATES))
    x = np.zeros(N_STATES)
    first = p[0]
    for t in range(n):
        if not math.isnan(cgm[t]):
            first = cgm[t]
            break
    x[0] = first
    for t in range(n):
        _step(x, p, in_f[t], in_s[t], u_ex[t], si_mult[t], egp_mult[t], hour0 + t / 60.0)
        if not math.isnan(cgm[t]):
            innov = cgm[t] - x[0]
            x[0] = x[0] + gain * innov
            x[8] = min(max(x[8] + gain_d * innov, -4.0), 4.0)
        out[t] = x
    return out


@njit(cache=True, parallel=True)
def forecast_from(p, states, cgm_last, starts, horizon, si_mult, egp_mult, hour0, u_ex, persist):
    """Open-loop forecasts from many start minutes (future meals unknown).

    Activity-persistence prior: if the patient is exercising at the start
    (mean METs over the last 10 min above 2.5), the current intensity is
    assumed to continue and taper linearly to rest over ``persist`` minutes;
    otherwise the patient is assumed to be at rest. ``persist=0`` disables it.

    Returns glucose trajectories, shape (len(starts), horizon + 1), minute resolution.
    ``cgm_last`` is the most recent sensor value at each start (anchors G).
    """
    m = len(starts)
    out = np.empty((m, horizon + 1))
    for j in prange(m):
        s = starts[j]
        x = states[s].copy()
        x[0] = cgm_last[j]
        out[j, 0] = x[0]
        sm = si_mult[s]
        em = egp_mult[s]
        u0 = 0.0
        if persist > 0:
            lo = max(0, s - 9)
            for t in range(lo, s + 1):
                u0 += u_ex[t]
            u0 /= s + 1 - lo
            if u0 < 1.0:
                u0 = 0.0
        for k in range(horizon):
            uk = 0.0
            if u0 > 0.0 and k < persist:
                uk = u0 * (1.0 - k / persist)
            _step(x, p, 0.0, 0.0, uk, sm, em, hour0 + (s + 1 + k) / 60.0)
            out[j, k + 1] = x[0]
    return out


@njit(cache=True, parallel=True)
def simulate_scenarios(P_, x0, in_f, in_s, u_ex, si_mult, egp_mult, hour0):
    """Batch what-if simulation: row ``j`` of every input is one scenario.

    P_ (m, N_PARAMS), x0 (m, N_STATES), inputs (m, n). Returns glucose (m, n+1).
    """
    m, n = in_f.shape
    out = np.empty((m, n + 1))
    for j in prange(m):
        x = x0[j].copy()
        out[j, 0] = x[0]
        for t in range(n):
            _step(x, P_[j], in_f[j, t], in_s[j, t], u_ex[j, t], si_mult[j, t], egp_mult[j, t], hour0 + t / 60.0)
            out[j, t + 1] = x[0]
    return out


# ----------------------------------------------------------------------------- meals
def fast_fraction(carbs, protein, fat, fiber, gi=None):
    """Share of a meal's carbohydrate that enters the fast absorption chain.

    Glycaemic index sets the base rate; fat, protein and fibre delay gastric
    emptying (the reason dal-rice spikes less than plain rice).
    """
    carbs = np.asarray(carbs, float)
    gi = np.where(np.isnan(np.asarray(gi, float)), 62.0, gi) if gi is not None else 62.0
    base = np.clip(np.asarray(gi, float) / 100.0, 0.2, 0.95)
    slowing = 1.0 + 0.012 * np.asarray(fat, float) + 0.025 * np.asarray(fiber, float) + 0.006 * np.asarray(protein, float)
    return np.clip(base / slowing, 0.1, 0.92)


def build_inputs(n_minutes, meal_minutes, carbs, protein, fat, fiber, gi=None, mets=None,
                 si_mult=None, egp_mult=None):
    """Assemble minute-resolution input arrays for the integrators."""
    in_f = np.zeros(n_minutes)
    in_s = np.zeros(n_minutes)
    if len(meal_minutes):
        mm = np.asarray(meal_minutes, int)
        ok = (mm >= 0) & (mm < n_minutes)
        ff = fast_fraction(carbs, protein, fat, fiber, gi)
        c = np.asarray(carbs, float)
        np.add.at(in_f, mm[ok], (c * ff)[ok])
        np.add.at(in_s, mm[ok], (c * (1 - ff))[ok])
    if mets is None:
        u_ex = np.zeros(n_minutes)
    else:
        m = np.nan_to_num(np.asarray(mets, float), nan=1.0)
        u_ex = np.clip(m - 1.5, 0.0, 12.0)
    si = np.ones(n_minutes) if si_mult is None else np.asarray(si_mult, float)
    eg = np.ones(n_minutes) if egp_mult is None else np.asarray(egp_mult, float)
    return in_f, in_s, u_ex, si, eg
