# What's on my plate?

A browser-based plate builder using Indian Food Composition Tables 2017. Set up an adult profile, search the food catalogue, add 100 g servings, adjust portions in 25 g steps, and review estimated energy and macronutrients.

## Run locally

From this folder, run:

```sh
npm run dev
```

On the computer, open <http://localhost:4173>. To use it on a phone, connect the phone and computer to the same Wi-Fi, find the computer's IPv4 address with `ipconfig`, then open `http://<computer-ip>:4173` on the phone (for example, `http://192.168.1.20:4173`). Allow Python through Windows Firewall on a private network if prompted. The layout adapts to small screens with larger touch controls and a direct link from the plate to the food search. Use the local server rather than opening the files directly as a `file://` URL.

## Data and estimates

- The bundled `data/ifct-foods.json` contains all **528 coded foods** from Table 1, their available nutrient profiles from Tables 2–11, and **14 edible-oil profiles** from Table 12 of the **Indian Food Composition Tables 2017**, published by ICMR–National Institute of Nutrition. The source PDF is not included in this public repository.
- Nutrient profiles open from the **Profile** button on any food card. Profiles are grouped by source table and retain the printed units. Most values are per 100 g edible portion; amino-acid values are per 100 g protein, and Table 12 oil fatty-acid values are percentages of total fatty acids. Blank, unreported, and layout-omitted values are not invented.
- IFCT lists green peas as **Peas, fresh (D061)**; search also recognizes “green peas,” “fresh peas,” and “hare matar.”
- Table 12 lists fatty acids but not energy or macronutrients, so its 14 oil entries are profile-only and cannot be added to the calorie-balanced plate. Table 1 entries remain plate-addable; if carbohydrate is not reported for an item, the plate leaves it out of the carbohydrate share.
- The plate and catalogue use category- and name-matched emoji illustrations, not food photographs. Each plate icon scales with serving weight, and the icons redistribute when foods or portions change.
- Added portions are marked on their catalogue cards with the selected gram weight; source food code and category remain visible so each item can be traced to its IFCT profile.
- BMI is weight (kg) divided by height (m) squared. Resting energy uses the revised Harris–Benedict equations (weight in kg, height in cm, age in years):
  - Female equation: `BMR = 447.593 + 9.247 × weight + 3.098 × height − 4.330 × age`
  - Male equation: `BMR = 88.362 + 13.397 × weight + 4.799 × height − 5.677 × age`
  - Estimated total daily energy expenditure is `BMR × activity factor ÷ 0.90`, treating the thermic effect of food as approximately 10% of that total. This is a simplified educational estimate, not a clinical calculation.
- Macro shares are calculated from reported grams using 4 kcal/g for carbohydrate and protein and 9 kcal/g for fat. The displayed 45–55% carbohydrate, 10–15% protein and 20–30% fat bands are the requested exploration targets; they are **not** represented as FDA rules or individual medical advice.
- Profile and plate data are saved in this browser only.

Food-composition source: Longvah, T., Ananthan, R., Bhaskarachary, K. & Venkaiah, K. (2017). *Indian Food Composition Tables 2017*. National Institute of Nutrition, Indian Council of Medical Research.

## Regenerate the IFCT catalogue

To regenerate the catalogue, place a legally obtained copy of `IFCT2017.pdf` in the project root. The extractor reads it and writes the bundled JSON:

```sh
python -m pip install -r requirements.txt
python scripts/extract_ifct_foods.py
```
