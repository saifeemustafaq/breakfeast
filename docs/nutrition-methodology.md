# Nutrition methodology

Reviewed October 2026. Re-review if a recipe, portion, or ingredient brand changes.

## What the numbers are

Every figure is an estimate for one serving, calculated per ingredient:

```
nutrient for recipe = sum over ingredients of (USDA value per 100 g × grams used / 100)
% of a day          = nutrient for recipe / FDA adult Daily Value × 100
```

- **Source data:** USDA FoodData Central, SR Legacy release (April 2018). Each ingredient maps to one FDC record in `scripts/extract-usda.py`; `lib/nutrition-data.ts` is generated from the CSV download and never edited by hand.
- **Gram weights:** `PORTION_GRAMS` in `lib/nutrition.ts` converts each recipe quantity (cups, tablespoons, pieces) into grams using the USDA portion weights for that same record. Loose amounts such as "a handful" or "to taste" use a typical portion and are flagged in the UI.
- **Daily Values:** FDA adult Daily Values (21 CFR 101.9). Omega-3 (ALA) has no Daily Value, so it uses the NIH Adequate Intake of 1.6 g.
- **Missing data:** when a USDA record doesn't report a nutrient, it counts as unknown, never zero. The UI marks the nutrient with an asterisk and names the ingredient.

## Confidence

- **Good:** every ingredient maps closely to a USDA record.
- **Fair:** at least one ingredient varies a lot by brand. Today that's fortified soy milk (calcium, vitamin D, B12 depend on fortification), iron-fortified cereal (the record is Cheerios; other cereals differ widely), and canned lentils (modeled on boiled lentils, so sodium usually reads low).

## Insight copy

Insights in `lib/nutrition.ts` (`RULES`) fire from the calculated totals, so they change automatically if a recipe changes. Rules for the copy:

- Every insight cites at least one source: NIH Office of Dietary Supplements fact sheets, FDA regulations, MedlinePlus, Harvard T.H. Chan, or PubMed studies.
- Each insight is tagged **Well established** (consensus physiology or an authorized health claim) or **Seen in studies** (observational findings, labeled as such in the text).
- No disease, cure, or treatment claims, and no regulated nutrient-content phrases ("high in", "good source"). `lib/nutrition.test.ts` enforces this.
- Nails and skin: nutrient deficiencies can affect nails, but a 2024 review found limited evidence that vitamins improve nails in people who aren't deficient, so the copy says so. The skin insight links vitamin C to collagen (established) and cites the observational wrinkle study separately.

Key studies:

- Cosgrove et al. 2007, vitamin C intake and skin aging (PubMed 17921406)
- Devore et al. 2012, berry intake and cognitive decline (PubMed 22535616)
- Leidy et al. 2015, protein and appetite (PubMed 25926512)
- Curtis and Lipner 2024, vitamins and nail health (PMC10987071)

## Not medical advice

These are general estimates for a healthy adult. Anyone with a medical condition, pregnancy, or medication such as warfarin should check with a clinician or dietitian.
