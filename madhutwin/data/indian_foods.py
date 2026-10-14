"""Indian food library for simulation and what-if scenarios.

Per-serving macronutrients are approximate values compiled from the Indian Food
Composition Tables (IFCT 2017, ICMR-National Institute of Nutrition) and
published glycaemic-index tables (Atkinson et al., Am J Clin Nutr 2021; Indian
GI studies, e.g. Henry et al. and MDRF). They are *simulation inputs*, not
dietary advice; portion sizes are typical household servings.

Fields: carbs/protein/fat/fiber in g, kcal, gi (glucose = 100),
slots (breakfast/lunch/snack/dinner/drink/sweet), regions (S/N/W/E/all).
"""
from __future__ import annotations

FOODS = [
    # ------------------------------------------------------------------ breakfast
    dict(id="idli_sambar", name="Idli (3) with sambar", carbs=52, protein=10, fat=3, fiber=5, kcal=280, gi=69, slots=["breakfast", "dinner"], regions=["S"]),
    dict(id="masala_dosa", name="Masala dosa with chutney", carbs=60, protein=8, fat=14, fiber=4, kcal=400, gi=66, slots=["breakfast", "dinner"], regions=["S"]),
    dict(id="plain_dosa", name="Plain dosa (2) with sambar", carbs=58, protein=9, fat=8, fiber=4, kcal=340, gi=72, slots=["breakfast", "dinner"], regions=["S"]),
    dict(id="ragi_dosa", name="Ragi dosa (2) with chutney", carbs=48, protein=8, fat=7, fiber=7, kcal=290, gi=58, slots=["breakfast", "dinner"], regions=["S"]),
    dict(id="upma", name="Rava upma (1 cup)", carbs=45, protein=7, fat=9, fiber=3, kcal=290, gi=68, slots=["breakfast"], regions=["S", "W"]),
    dict(id="millet_upma", name="Foxtail-millet upma (1 cup)", carbs=42, protein=8, fat=8, fiber=6, kcal=280, gi=50, slots=["breakfast"], regions=["S", "all"]),
    dict(id="pongal", name="Ven pongal (1 cup)", carbs=55, protein=9, fat=12, fiber=3, kcal=370, gi=68, slots=["breakfast"], regions=["S"]),
    dict(id="poha", name="Poha (1.5 cups)", carbs=50, protein=6, fat=9, fiber=3, kcal=310, gi=70, slots=["breakfast", "snack"], regions=["W", "N"]),
    dict(id="aloo_paratha", name="Aloo paratha (2) with curd", carbs=70, protein=12, fat=22, fiber=6, kcal=540, gi=60, slots=["breakfast"], regions=["N"]),
    dict(id="besan_chilla", name="Besan chilla (2)", carbs=30, protein=14, fat=10, fiber=6, kcal=280, gi=35, slots=["breakfast"], regions=["N", "W", "all"]),
    dict(id="oats_porridge", name="Oats porridge with milk", carbs=40, protein=10, fat=6, fiber=6, kcal=260, gi=55, slots=["breakfast"], regions=["all"]),
    dict(id="bread_omelette", name="Bread (2 slices) and omelette", carbs=28, protein=16, fat=14, fiber=2, kcal=310, gi=70, slots=["breakfast"], regions=["all"]),
    dict(id="puri_bhaji", name="Puri (3) with potato bhaji", carbs=65, protein=9, fat=26, fiber=5, kcal=530, gi=65, slots=["breakfast"], regions=["N", "W", "E"]),
    dict(id="appam_stew", name="Appam (2) with vegetable stew", carbs=55, protein=7, fat=12, fiber=4, kcal=360, gi=70, slots=["breakfast", "dinner"], regions=["S"]),
    # ------------------------------------------------------------------ lunch / dinner
    dict(id="rice_sambar", name="Rice (1.5 cups), sambar and poriyal", carbs=85, protein=13, fat=9, fiber=8, kcal=480, gi=70, slots=["lunch", "dinner"], regions=["S"]),
    dict(id="rice_rasam_curd", name="Rice, rasam and curd", carbs=80, protein=10, fat=7, fiber=3, kcal=420, gi=73, slots=["lunch", "dinner"], regions=["S"]),
    dict(id="curd_rice", name="Curd rice (1.5 cups)", carbs=60, protein=9, fat=8, fiber=1, kcal=350, gi=70, slots=["lunch", "dinner"], regions=["S"]),
    dict(id="bisi_bele_bath", name="Bisi bele bath (1.5 cups)", carbs=70, protein=12, fat=12, fiber=7, kcal=440, gi=64, slots=["lunch", "dinner"], regions=["S"]),
    dict(id="ragi_mudde", name="Ragi mudde (2) with saaru", carbs=62, protein=7, fat=4, fiber=9, kcal=320, gi=66, slots=["lunch", "dinner"], regions=["S"]),
    dict(id="south_meals", name="South Indian full meals (banana leaf)", carbs=130, protein=18, fat=20, fiber=12, kcal=780, gi=70, slots=["lunch"], regions=["S"]),
    dict(id="roti_dal_sabzi", name="Roti (3), dal and sabzi", carbs=70, protein=16, fat=12, fiber=11, kcal=460, gi=55, slots=["lunch", "dinner"], regions=["N", "W", "all"]),
    dict(id="roti_paneer", name="Roti (2) with paneer sabzi", carbs=45, protein=18, fat=20, fiber=6, kcal=440, gi=50, slots=["lunch", "dinner"], regions=["N", "W"]),
    dict(id="jowar_roti_dal", name="Jowar roti (2) with dal", carbs=55, protein=14, fat=8, fiber=10, kcal=350, gi=52, slots=["lunch", "dinner"], regions=["W", "S"]),
    dict(id="rajma_chawal", name="Rajma chawal", carbs=85, protein=18, fat=10, fiber=12, kcal=500, gi=55, slots=["lunch", "dinner"], regions=["N"]),
    dict(id="chole_bhature", name="Chole bhature (2)", carbs=90, protein=18, fat=35, fiber=12, kcal=760, gi=60, slots=["lunch"], regions=["N"]),
    dict(id="dal_khichdi", name="Dal khichdi (1.5 cups)", carbs=60, protein=14, fat=8, fiber=6, kcal=370, gi=60, slots=["lunch", "dinner"], regions=["N", "W", "E", "all"]),
    dict(id="north_thali", name="North Indian thali", carbs=110, protein=22, fat=28, fiber=12, kcal=800, gi=62, slots=["lunch"], regions=["N", "W"]),
    dict(id="fish_curry_rice", name="Fish curry and rice", carbs=75, protein=26, fat=14, fiber=3, kcal=520, gi=68, slots=["lunch", "dinner"], regions=["E", "S"]),
    dict(id="egg_curry_rice", name="Egg curry and rice", carbs=75, protein=18, fat=15, fiber=3, kcal=520, gi=68, slots=["lunch", "dinner"], regions=["S", "E", "all"]),
    dict(id="chicken_curry_roti", name="Chicken curry with roti (2)", carbs=45, protein=30, fat=20, fiber=5, kcal=500, gi=50, slots=["lunch", "dinner"], regions=["N", "all"]),
    dict(id="chicken_biryani", name="Chicken biryani (1 plate)", carbs=85, protein=28, fat=24, fiber=3, kcal=670, gi=64, slots=["lunch", "dinner"], regions=["S", "all"]),
    dict(id="veg_biryani", name="Veg biryani (1 plate)", carbs=80, protein=10, fat=18, fiber=5, kcal=520, gi=65, slots=["lunch", "dinner"], regions=["all"]),
    dict(id="brown_rice_dal", name="Brown rice, dal and salad", carbs=65, protein=15, fat=8, fiber=10, kcal=400, gi=55, slots=["lunch", "dinner"], regions=["all"]),
    dict(id="pav_bhaji", name="Pav bhaji (2 pav)", carbs=80, protein=12, fat=22, fiber=8, kcal=570, gi=66, slots=["dinner", "snack"], regions=["W"]),
    dict(id="macher_jhol", name="Macher jhol and rice", carbs=78, protein=24, fat=12, fiber=3, kcal=510, gi=70, slots=["lunch", "dinner"], regions=["E"]),
    # ------------------------------------------------------------------ snacks
    dict(id="samosa", name="Samosa (1)", carbs=32, protein=5, fat=17, fiber=3, kcal=300, gi=60, slots=["snack"], regions=["N", "all"]),
    dict(id="medu_vada", name="Medu vada (2)", carbs=30, protein=9, fat=18, fiber=4, kcal=320, gi=55, slots=["snack", "breakfast"], regions=["S"]),
    dict(id="biscuits", name="Marie biscuits (4)", carbs=22, protein=2, fat=3, fiber=0.5, kcal=120, gi=70, slots=["snack"], regions=["all"]),
    dict(id="namkeen", name="Mixture / namkeen (30 g)", carbs=15, protein=3, fat=10, fiber=2, kcal=160, gi=60, slots=["snack"], regions=["all"]),
    dict(id="banana", name="Banana (1 medium)", carbs=27, protein=1, fat=0.3, fiber=3, kcal=105, gi=51, slots=["snack"], regions=["all"]),
    dict(id="guava", name="Guava (1)", carbs=14, protein=2.5, fat=0.5, fiber=5, kcal=68, gi=31, slots=["snack"], regions=["all"]),
    dict(id="roasted_chana", name="Roasted chana (30 g)", carbs=18, protein=6, fat=2, fiber=5, kcal=110, gi=28, slots=["snack"], regions=["all"]),
    dict(id="sprouts", name="Sprouts salad (1 cup)", carbs=15, protein=8, fat=1, fiber=6, kcal=100, gi=25, slots=["snack"], regions=["all"]),
    dict(id="mango", name="Mango (1 cup)", carbs=25, protein=1, fat=0.6, fiber=3, kcal=100, gi=55, slots=["snack"], regions=["all"]),
    # ------------------------------------------------------------------ drinks
    dict(id="chai_sugar", name="Masala chai with 2 tsp sugar", carbs=14, protein=3, fat=3, fiber=0, kcal=90, gi=62, slots=["drink"], regions=["all"]),
    dict(id="chai_nosugar", name="Masala chai, no sugar", carbs=5, protein=3, fat=3, fiber=0, kcal=55, gi=30, slots=["drink"], regions=["all"]),
    dict(id="filter_coffee", name="Filter coffee with sugar", carbs=13, protein=3, fat=4, fiber=0, kcal=95, gi=60, slots=["drink"], regions=["S"]),
    dict(id="sweet_lassi", name="Sweet lassi (1 glass)", carbs=35, protein=8, fat=6, fiber=0, kcal=230, gi=55, slots=["drink", "snack"], regions=["N"]),
    dict(id="buttermilk", name="Buttermilk (chaas)", carbs=5, protein=3, fat=2, fiber=0, kcal=45, gi=30, slots=["drink"], regions=["all"]),
    dict(id="coconut_water", name="Tender coconut water", carbs=9, protein=0.5, fat=0.2, fiber=0, kcal=45, gi=50, slots=["drink"], regions=["S", "all"]),
    # ------------------------------------------------------------------ sweets / festival
    dict(id="gulab_jamun", name="Gulab jamun (2)", carbs=50, protein=4, fat=12, fiber=0.5, kcal=320, gi=76, slots=["sweet"], regions=["all"]),
    dict(id="jalebi", name="Jalebi (100 g)", carbs=65, protein=2, fat=15, fiber=0.5, kcal=400, gi=80, slots=["sweet"], regions=["N", "W"]),
    dict(id="mysore_pak", name="Mysore pak (1 piece)", carbs=20, protein=2, fat=15, fiber=0.5, kcal=220, gi=60, slots=["sweet"], regions=["S"]),
    dict(id="besan_laddoo", name="Besan laddoo (1)", carbs=25, protein=4, fat=10, fiber=1.5, kcal=200, gi=55, slots=["sweet"], regions=["all"]),
    dict(id="payasam", name="Payasam / kheer (1 cup)", carbs=45, protein=7, fat=9, fiber=0.5, kcal=300, gi=65, slots=["sweet"], regions=["all"]),
]

BY_ID = {f["id"]: f for f in FOODS}

# Healthier swaps the twin can test in "what-if" mode (same slot, lower glycaemic load)
SWAPS = {
    "rice_sambar": ["brown_rice_dal", "ragi_mudde", "jowar_roti_dal"],
    "rice_rasam_curd": ["brown_rice_dal", "roti_dal_sabzi"],
    "curd_rice": ["brown_rice_dal", "roti_dal_sabzi"],
    "south_meals": ["brown_rice_dal", "rice_sambar"],
    "plain_dosa": ["ragi_dosa", "besan_chilla"],
    "masala_dosa": ["ragi_dosa", "besan_chilla"],
    "idli_sambar": ["ragi_dosa", "millet_upma", "besan_chilla"],
    "upma": ["millet_upma", "besan_chilla"],
    "poha": ["besan_chilla", "oats_porridge"],
    "pongal": ["millet_upma", "besan_chilla"],
    "aloo_paratha": ["besan_chilla", "oats_porridge"],
    "puri_bhaji": ["besan_chilla", "roti_dal_sabzi"],
    "chicken_biryani": ["chicken_curry_roti", "brown_rice_dal"],
    "veg_biryani": ["roti_dal_sabzi", "brown_rice_dal"],
    "chole_bhature": ["roti_dal_sabzi", "rajma_chawal"],
    "north_thali": ["roti_dal_sabzi", "roti_paneer"],
    "pav_bhaji": ["roti_paneer", "dal_khichdi"],
    "chai_sugar": ["chai_nosugar"],
    "filter_coffee": ["chai_nosugar"],
    "samosa": ["roasted_chana", "sprouts"],
    "biscuits": ["roasted_chana", "guava"],
    "namkeen": ["roasted_chana", "sprouts"],
    "sweet_lassi": ["buttermilk"],
    "gulab_jamun": ["besan_laddoo"],
    "jalebi": ["besan_laddoo"],
}


def foods_for(slot: str, region: str) -> list[dict]:
    return [f for f in FOODS if slot in f["slots"] and (region in f["regions"] or "all" in f["regions"])]


def glycaemic_load(food: dict, portion: float = 1.0) -> float:
    return food["gi"] * food["carbs"] * portion / 100.0
