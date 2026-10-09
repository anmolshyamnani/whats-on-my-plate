import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import fitz


CATEGORIES = {
    "A": "Cereals & millets",
    "B": "Grain legumes",
    "C": "Green leafy vegetables",
    "D": "Other vegetables",
    "E": "Fruits",
    "F": "Roots & tubers",
    "G": "Fresh condiments & spices",
    "H": "Nuts & oil seeds",
    "I": "Sugars",
    "J": "Mushrooms",
    "K": "Miscellaneous foods",
    "L": "Milk & milk products",
    "M": "Eggs",
    "N": "Poultry",
    "O": "Animal meat",
    "P": "Marine fish",
    "Q": "Marine shellfish",
    "R": "Marine mollusks",
    "S": "Freshwater fish & shellfish",
}


def field(code, label, unit, position=None):
    return {"code": code, "label": label, "unit": unit, "position": position}


TABLE_ONE_FIELDS = [
    field("energyKcal", "Energy", "kcal", "energyKcal"),
    field("energyKJ", "Energy", "kJ", "energyKJ"),
    field("moisture", "Moisture", "g", "moisture"),
    field("protein", "Protein", "g", "protein"),
    field("ash", "Ash", "g", "ash"),
    field("fat", "Total fat", "g", "fat"),
    field("carbs", "Available carbohydrate", "g", "carbs"),
    field("fiber", "Dietary fibre, total", "g", "fiber"),
    field("fiberInsoluble", "Dietary fibre, insoluble", "g", "fiberInsoluble"),
    field("fiberSoluble", "Dietary fibre, soluble", "g", "fiberSoluble"),
]


TABLES = [
    {
        "key": "table2",
        "title": "Table 2 · Water-soluble vitamins",
        "pages": (71, 98),
        "fields": [
            field("THIA", "Thiamine (B1)", "mg"),
            field("RIBF", "Riboflavin (B2)", "mg"),
            field("NIA", "Niacin (B3)", "mg"),
            field("PANTAC", "Pantothenic acid (B5)", "mg"),
            field("VITB6A", "Vitamin B6", "mg"),
            field("BIOT", "Biotin (B7)", "µg"),
            field("FOLSUM", "Total folates (B9)", "µg"),
            field("VITC", "Vitamin C", "mg"),
        ],
    },
    {
        "key": "table3",
        "title": "Table 3 · Fat-soluble vitamins",
        "pages": (101, 128),
        "fields": [
            field("RETOL", "Retinol (vitamin A)", "µg"),
            field("ERGCAL", "Ergocalciferol (vitamin D2)", "µg"),
            field("CHOCAL", "Cholecalciferol (vitamin D3)", "µg"),
            field("TOCPHA", "α-Tocopherol", "mg"),
            field("TOCPHB", "β-Tocopherol", "mg"),
            field("TOCPHG", "γ-Tocopherol", "mg"),
            field("TOCPHD", "δ-Tocopherol", "mg"),
            field("TOCTRA", "α-Tocotrienol", "mg"),
            field("TOCTRB", "β-Tocotrienol", "mg"),
            field("TOCTRG", "γ-Tocotrienol", "mg"),
            field("TOCTRD", "δ-Tocotrienol", "mg"),
            field("VITE", "Vitamin E", "mg"),
            field("VITK1", "Vitamin K1", "µg"),
            field("VITK2", "Vitamin K2", "µg"),
        ],
    },
    {
        "key": "table4",
        "title": "Table 4 · Carotenoids",
        "pages": (131, 147),
        "fields": [
            field("LUTN", "Lutein", "µg"),
            field("ZEA", "Zeaxanthin", "µg"),
            field("LYCPN", "Lycopene", "µg"),
            field("CRYPXB", "β-Cryptoxanthin", "µg"),
            field("CARTG", "γ-Carotene", "µg"),
            field("CARTA", "α-Carotene", "µg"),
            field("CARTB", "β-Carotene", "µg"),
            field("CARTOID", "Total carotenoids", "µg"),
        ],
    },
    {
        "key": "table5",
        "title": "Table 5 · Minerals and trace elements",
        "pages": (151, 206),
        "fields": [
            field("AL", "Aluminium", "mg"),
            field("AS", "Arsenic", "µg"),
            field("CD", "Cadmium", "mg"),
            field("CA", "Calcium", "mg"),
            field("CR", "Chromium", "mg"),
            field("CO", "Cobalt", "mg"),
            field("CU", "Copper", "mg"),
            field("FE", "Iron", "mg"),
            field("PB", "Lead", "mg"),
            field("LI", "Lithium", "mg"),
            field("MG", "Magnesium", "mg"),
            field("MN", "Manganese", "mg"),
            field("HG", "Mercury", "µg"),
            field("MO", "Molybdenum", "mg"),
            field("NI", "Nickel", "mg"),
            field("P", "Phosphorus", "mg"),
            field("K", "Potassium", "mg"),
            field("SE", "Selenium", "µg"),
            field("NA", "Sodium", "mg"),
            field("ZN", "Zinc", "mg"),
        ],
    },
    {
        "key": "table6",
        "title": "Table 6 · Starch and individual sugars",
        "pages": (209, 224),
        "fields": [
            field("CHO", "Available carbohydrate (CHO)", "g", 360),
            field("STARCH", "Total starch", "g"),
            field("FRUS", "Fructose", "g"),
            field("GLUS", "Glucose", "g"),
            field("SUCS", "Sucrose", "g"),
            field("MALS", "Maltose", "g"),
            field("TOTAL_SUGARS", "Total free sugars", "g", 758),
        ],
    },
    {
        "key": "table7",
        "title": "Table 7 · Fatty acid profile",
        "pages": (227, 293),
        "blankMeansBelowDetection": True,
        "fields": [
            field("F10D0", "Capric acid (C10:0)", "mg"),
            field("F12D0", "Lauric acid (C12:0)", "mg"),
            field("F14D0", "Myristic acid (C14:0)", "mg"),
            field("F16D0", "Palmitic acid (C16:0)", "mg"),
            field("F18D0", "Stearic acid (C18:0)", "mg"),
            field("F20D0", "Arachidic acid (C20:0)", "mg"),
            field("F22D0", "Behenic acid (C22:0)", "mg"),
            field("F24D0", "Lignoceric acid (C24:0)", "mg"),
            field("F11D0", "Undecanoic acid (C11:0)", "mg"),
            field("F15D0", "Pentadecanoic acid (C15:0)", "mg"),
            field("F14D1", "Myristoleic acid (C14:1)", "mg"),
            field("F16D1", "Palmitoleic acid (C16:1)", "mg"),
            field("F18D1N9", "Oleic acid (C18:1n9)", "mg"),
            field("F18D1TN9", "Elaidic acid (C18:1 trans)", "mg"),
            field("F20D1N9", "Gondoic acid (C20:1n9)", "mg"),
            field("F22D1N9", "Erucic acid (C22:1n9)", "mg"),
            field("F24D1N9", "Nervonic acid (C24:1n9)", "mg"),
            field("F18D2N6", "Linoleic acid (C18:2n6)", "mg"),
            field("F20D2", "Eicosadienoic acid (C20:2)", "mg"),
            field("F20D3N6", "Eicosatrienoic acid (C20:3n6)", "mg"),
            field("F20D4N6", "Arachidonic acid (C20:4n6)", "mg"),
            field("F20D5N3", "EPA (C20:5n3)", "mg"),
            field("F18D3N3", "α-Linolenic acid (C18:3n3)", "mg"),
            field("F22D2", "Docosadienoic acid (C22:2)", "mg"),
            field("F22D5N3", "DPA (C22:5n3)", "mg"),
            field("F22D6N3", "DHA (C22:6n3)", "mg"),
            field("CHOLC", "Cholesterol", "mg"),
            field("FASAT", "Total saturated fatty acids", "mg"),
            field("FAMS", "Total monounsaturated fatty acids", "mg"),
            field("FAPU", "Total polyunsaturated fatty acids", "mg"),
        ],
    },
    {
        "key": "table8",
        "title": "Table 8 · Amino acid profile",
        "pages": (297, 361),
        "fields": [
            field("HIS", "Histidine", "g per 100 g protein"),
            field("ILE", "Isoleucine", "g per 100 g protein"),
            field("LEU", "Leucine", "g per 100 g protein"),
            field("LYS", "Lysine", "g per 100 g protein"),
            field("MET", "Methionine", "g per 100 g protein"),
            field("CYS", "Cystine", "g per 100 g protein"),
            field("PHE", "Phenylalanine", "g per 100 g protein"),
            field("THR", "Threonine", "g per 100 g protein"),
            field("TRP", "Tryptophan", "g per 100 g protein"),
            field("VAL", "Valine", "g per 100 g protein"),
            field("ALA", "Alanine", "g per 100 g protein"),
            field("ARG", "Arginine", "g per 100 g protein"),
            field("ASN", "Asparagine", "g per 100 g protein"),
            field("ASP", "Aspartic acid", "g per 100 g protein"),
            field("GLU", "Glutamic acid", "g per 100 g protein"),
            field("GLY", "Glycine", "g per 100 g protein"),
            field("PRO", "Proline", "g per 100 g protein"),
            field("SER", "Serine", "g per 100 g protein"),
            field("TYR", "Tyrosine", "g per 100 g protein"),
        ],
    },
    {
        "key": "table9",
        "title": "Table 9 · Oxalates and organic acids",
        "pages": (364, 380),
        "blankMeansBelowDetection": True,
        "fields": [
            field("TOTAL_OXALATE", "Total oxalate", "mg", 271),
            field("SOLUBLE_OXALATE", "Soluble oxalate", "mg", 323),
            field("INSOLUBLE_OXALATE", "Insoluble oxalate", "mg", 377),
            field("CISACON", "Cis-aconitic acid", "mg", 433),
            field("CITAC", "Citric acid", "mg"),
            field("FUMAC", "Fumaric acid", "mg"),
            field("MALAC", "Malic acid", "mg"),
            field("QUINAC", "Quinic acid", "mg", 656),
            field("SUCAC", "Succinic acid", "mg"),
            field("TARAC", "Tartaric acid", "mg"),
        ],
    },
    {
        "key": "table10",
        "title": "Table 10 · Polyphenols",
        "pages": (384, 451),
        "blankMeansBelowDetection": True,
        "fields": [],
    },
    {
        "key": "table11",
        "title": "Table 11 · Oligosaccharides, phytosterols, phytates and saponins",
        "pages": (454, 471),
        "blankMeansBelowDetection": True,
        "fields": [
            field("RAFS", "Raffinose", "g"),
            field("STAS", "Stachyose", "g"),
            field("VERS", "Verbascose", "g"),
            field("AJUG", "Ajugose", "g", 450),
            field("CAMT", "Campesterol", "mg"),
            field("STGSTR", "Stigmasterol", "mg"),
            field("SITOST", "β-Sitosterol", "mg", 631),
            field("PHYTAC", "Phytate", "mg"),
            field("SAPONIN", "Total saponins", "g", 773),
        ],
    },
    {
        "key": "table12",
        "title": "Table 12 · Fatty acid profile of edible oils and fats",
        "pages": (474, 475),
        "blankMeansBelowDetection": True,
        "fields": [
            field("F6D0", "Caproic acid (C6:0)", "%"),
            field("F8D0", "Caprylic acid (C8:0)", "%"),
            field("F10D0", "Capric acid (C10:0)", "%"),
            field("F12D0", "Lauric acid (C12:0)", "%"),
            field("F14D0", "Myristic acid (C14:0)", "%"),
            field("F16D0", "Palmitic acid (C16:0)", "%"),
            field("F18D0", "Stearic acid (C18:0)", "%"),
            field("F20D0", "Arachidic acid (C20:0)", "%"),
            field("F22D0", "Behenic acid (C22:0)", "%"),
            field("F24D0", "Lignoceric acid (C24:0)", "%"),
            field("F16D1", "Palmitoleic acid (C16:1)", "%"),
            field("F18D1N9", "Oleic acid (C18:1n9)", "%"),
            field("F18D1TN9", "Elaidic acid (C18:1 trans)", "%"),
            field("F20D1N9", "Gondoic acid (C20:1n9)", "%"),
            field("F22D1N9", "Erucic acid (C22:1n9)", "%"),
            field("F18D2N6", "Linoleic acid (C18:2n6)", "%"),
            field("F18D3N3", "α-Linolenic acid (C18:3n3)", "%"),
            field("FASAT", "Total saturated fatty acids", "%"),
            field("FAMS", "Total monounsaturated fatty acids", "%"),
            field("FAPU", "Total polyunsaturated fatty acids", "%"),
        ],
    },
]


TABLE10_PAGE_FIELDS = [
    [
        field("DHBZA", "3,4-Dihydroxybenzoic acid", "mg", 282),
        field("HYBZAL", "3-Hydroxybenzaldehyde", "mg", 347),
        field("PROTAC", "Protocatechuic acid", "mg", 405),
        field("VANAC", "Vanillic acid", "mg", 475),
        field("GALLAC", "Gallic acid", "mg", 535),
        field("CINAC", "Cinnamic acid", "mg", 592),
        field("OCOUMAC", "O-Coumaric acid", "mg", 637),
        field("PCOUMAC", "P-Coumaric acid", "mg", 713),
        field("CAFFAC", "Caffeic acid", "mg", 756),
    ],
    [
        field("CHLRAC", "Chlorogenic acid", "mg", 284),
        field("FERAC", "Ferulic acid", "mg", 338),
        field("APIGEN", "Apigenin", "mg", 396),
        field("API6C", "Apigenin-6-C-glucoside", "mg", 445),
        field("API7O", "Apigenin-7-O-neohesperidoside", "mg", 497),
        field("LUTEOL", "Luteolin", "mg", 556),
        field("KAEMF", "Kaempferol", "mg", 602),
        field("QUERCE", "Quercetin", "mg", 659),
        field("QUER3GLUC", "Quercetin-3-β-D-glucoside", "mg", 716),
        field("QUER3RUT", "Quercetin-3-O-rutinoside", "mg", 779),
    ],
    [
        field("QUER3GAL", "Quercetin-3-β-D-galactoside", "mg", 284),
        field("ISORHAM", "Isorhamnetin", "mg", 337),
        field("MYRICETIN", "Myricetin", "mg", 395),
        field("RESVERATROL", "Resveratrol", "mg", 446),
        field("HESPT", "Hesperetin", "mg", 498),
        field("NARINGENIN", "Naringenin", "mg", 551),
        field("HESPD", "Hesperidin", "mg", 605),
        field("DAIDZN", "Daidzein", "mg", 661),
        field("GNSTEIN", "Genistein", "mg", 712),
        field("EPICATEC", "Epicatechin", "mg", 760),
    ],
    [
        field("EPICATEGC", "Epigallocatechin", "mg", 285),
        field("EPIGCATECG", "Epigallocatechin-3-gallate", "mg", 345),
        field("CATECHIN", "(+)-Catechin", "mg", 405),
        field("GALLOCATG", "Gallocatechin gallate", "mg", 459),
        field("GALLOCAT", "Gallocatechin", "mg", 534),
        field("SYRAC", "Syringic acid", "mg", 579),
        field("SINAPAC", "Sinapinic acid", "mg", 637),
        field("ELLAC", "Ellagic acid", "mg", 700),
        field("TOTAL_POLYPHENOLS", "Total polyphenols", "mg", 770),
    ],
]


TABLE_ONE_COLUMNS = {
    "wide": {
        "moisture": (300, 365),
        "protein": (365, 425),
        "ash": (425, 470),
        "fat": (470, 525),
        "fiber": (525, 585),
        "fiberInsoluble": (585, 645),
        "fiberSoluble": (645, 685),
        "carbs": (685, 755),
        "energyKJ": (755, 810),
    },
    "animals": {
        "moisture": (325, 385),
        "protein": (385, 480),
        "ash": (480, 565),
        "fat": (565, 660),
        "energyKJ": (660, 745),
    },
    "fish": {
        "moisture": (365, 425),
        "protein": (425, 510),
        "ash": (510, 590),
        "fat": (590, 680),
        "energyKJ": (680, 745),
    },
}


def mean_from_word(text):
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(match.group()) if match else None


def get_code_words(words, pattern=r"[A-Z]\d{3}"):
    return sorted(
        [word for word in words if re.fullmatch(pattern, word[4])],
        key=lambda word: (word[1], word[0]),
    )


def food_name(words, code_word, previous_y, next_y, max_x=276):
    x_code, y_code = code_word[0], code_word[1]
    low = (previous_y + y_code) / 2 if previous_y is not None else y_code - 9
    high = (y_code + next_y) / 2 if next_y is not None else y_code + 12
    grouped = defaultdict(list)
    for word in words:
        if x_code + 20 <= word[0] < max_x and low <= word[1] < high:
            grouped[round(word[1])].append(word)

    parts = []
    for baseline in sorted(grouped):
        line_words = sorted(grouped[baseline], key=lambda word: word[0])
        line = " ".join(word[4] for word in line_words)
        letters = [char for char in line if char.isalpha()]
        if letters and line.upper() == line:
            continue
        parts.append(line)
    return " ".join(parts).strip()


def build_table_one(pdf):
    foods = []
    for page_number in range(41, 69):
        words = pdf[page_number - 1].get_text("words")
        codes = get_code_words(words)
        for index, code_word in enumerate(codes):
            code = code_word[4]
            group = "wide"
            if code[0] in "MNO":
                group = "animals"
            elif code[0] in "PQRS":
                group = "fish"
            previous_y = codes[index - 1][1] if index else None
            next_y = codes[index + 1][1] if index + 1 < len(codes) else None
            name = food_name(words, code_word, previous_y, next_y)
            values = {key: None for key in TABLE_ONE_COLUMNS[group]}
            region_range = (285, 325) if group == "animals" else (315, 360) if group == "fish" else (275, 300)

            for word in words:
                x, y, _, _, text = word[:5]
                if abs(y - code_word[1]) >= 2.5:
                    continue
                if region_range[0] <= x < region_range[1]:
                    regions = mean_from_word(text)
                    if regions is not None:
                        values["regions"] = int(regions)
                for nutrient, (left, right) in TABLE_ONE_COLUMNS[group].items():
                    if left <= x < right:
                        values[nutrient] = mean_from_word(text)
                        break

            if not name or values.get("protein") is None or values.get("fat") is None:
                raise ValueError(f"Could not extract Table 1 row {code}: {name!r}")
            energy_kj = values.get("energyKJ")
            if energy_kj is None:
                raise ValueError(f"Could not extract Table 1 energy for {code}")

            food = {
                "code": code,
                "name": name,
                "category": CATEGORIES[code[0]],
                "regions": values.get("regions"),
                "profileLayout": group,
                "energyKcal": round(energy_kj / 4.184, 1),
                "energyKJ": energy_kj,
                "moisture": values.get("moisture"),
                "protein": values["protein"],
                "ash": values.get("ash"),
                "fat": values["fat"],
                "carbs": values.get("carbs"),
                "fiber": values.get("fiber"),
                "fiberInsoluble": values.get("fiberInsoluble"),
                "fiberSoluble": values.get("fiberSoluble"),
                "nutrients": {},
                "profileTables": ["table1"],
            }
            table_one_values = {
                "energyKcal": food["energyKcal"],
                "energyKJ": energy_kj,
                "moisture": food["moisture"],
                "protein": food["protein"],
                "ash": food["ash"],
                "fat": food["fat"],
                "carbs": food["carbs"],
                "fiber": food["fiber"],
                "fiberInsoluble": food["fiberInsoluble"],
                "fiberSoluble": food["fiberSoluble"],
            }
            for field_info in TABLE_ONE_FIELDS:
                value = table_one_values[field_info["position"]]
                if value is not None:
                    food["nutrients"][f"table1:{field_info['code']}"] = value
            foods.append(food)

    foods.sort(key=lambda item: item["code"])
    if len(foods) != 528:
        raise ValueError(f"Expected 528 Table 1 entries, found {len(foods)}")
    return foods


def get_table10_fields(page_text):
    lowered = " ".join(page_text.lower().split())
    for marker, fields in [
        ("3,4-dihydroxy", TABLE10_PAGE_FIELDS[0]),
        ("chlorogenic", TABLE10_PAGE_FIELDS[1]),
        ("isorhamnetin", TABLE10_PAGE_FIELDS[2]),
        ("total polyphenols", TABLE10_PAGE_FIELDS[3]),
    ]:
        if marker in lowered:
            return fields
    return []


def page_fields(table, page_number, page_text):
    if table["key"] == "table10":
        return get_table10_fields(page_text)
    return table["fields"]


def get_header_positions(words, fields, first_row_y):
    positions = []
    for field_info in fields:
        if field_info["position"] is not None:
            positions.append((field_info["position"], field_info))
            continue
        matches = [
            word for word in words
            if word[4] == field_info["code"]
            and word[0] >= 250
            and word[1] < first_row_y - 5
        ]
        if matches:
            header = max(matches, key=lambda word: word[1])
            positions.append((header[0], field_info))
    return sorted(positions, key=lambda entry: entry[0])


def attach_table_profiles(pdf, foods, table):
    by_code = {food["code"]: food for food in foods}
    first_page, last_page = table["pages"]
    for page_number in range(first_page, last_page + 1):
        page = pdf[page_number - 1]
        words = page.get_text("words")
        codes = get_code_words(words, r"[A-Z]\d{3}" if table["key"] != "table12" else r"T\d{3}")
        if not codes:
            continue

        first_row_y = codes[0][1]
        fields = page_fields(table, page_number, page.get_text())
        headers = get_header_positions(words, fields, first_row_y)
        if not headers:
            continue
        minimum_x = min(position for position, _ in headers) - 10
        for code_word in codes:
            food = by_code.get(code_word[4])
            if food is None:
                continue
            food["profileTables"].append(table["key"])
            row_values = {}
            for word in words:
                x, y, _, _, text = word[:5]
                if abs(y - code_word[1]) >= 1.7 or x < minimum_x:
                    continue
                value = mean_from_word(text)
                if value is None:
                    continue
                position, field_info = min(headers, key=lambda entry: abs(x - entry[0]))
                if abs(x - position) > 34:
                    continue
                row_values[field_info["code"]] = value

            for code, value in row_values.items():
                food["nutrients"][f"{table['key']}:{code}"] = value


def get_table12_foods(pdf, oils_table):
    oils = {}
    first_page, last_page = oils_table["pages"]
    for page_number in range(first_page, last_page + 1):
        words = pdf[page_number - 1].get_text("words")
        codes = get_code_words(words, r"T\d{3}")
        if not codes:
            continue
        headers = get_header_positions(words, oils_table["fields"], codes[0][1])
        if not headers:
            continue
        minimum_x = min(position for position, _ in headers) - 10
        for index, code_word in enumerate(codes):
            code = code_word[4]
            oil = oils.setdefault(code, {
                "code": code,
                "name": "",
                "category": "Edible oils & fats",
                "regions": None,
                "profileLayout": "supplemental",
                "energyKcal": None,
                "energyKJ": None,
                "moisture": None,
                "protein": None,
                "ash": None,
                "fat": None,
                "carbs": None,
                "fiber": None,
                "fiberInsoluble": None,
                "fiberSoluble": None,
                "nutrients": {},
                "profileTables": [],
            })
            next_y = codes[index + 1][1] if index + 1 < len(codes) else None
            if not oil["name"]:
                oil["name"] = food_name(
                    words,
                    code_word,
                    codes[index - 1][1] if index else None,
                    next_y,
                    max_x=190,
                )
            oil["profileTables"].append("table12")
            for word in words:
                x, y, _, _, text = word[:5]
                if abs(y - code_word[1]) >= 1.7:
                    continue
                if 185 <= x < 225:
                    region = mean_from_word(text)
                    if region is not None:
                        oil["regions"] = int(region)
                if x < minimum_x:
                    continue
                value = mean_from_word(text)
                if value is None:
                    continue
                position, field_info = min(headers, key=lambda entry: abs(x - entry[0]))
                if abs(x - position) <= 34:
                    oil["nutrients"][f"table12:{field_info['code']}"] = value

    for oil in oils.values():
        oil["profileTables"] = sorted(set(oil["profileTables"]))
        if not oil["name"]:
            raise ValueError(f"Could not extract Table 12 food name for {oil['code']}")
    return sorted(oils.values(), key=lambda item: item["code"])


def main():
    parser = argparse.ArgumentParser(description="Extract IFCT 2017 food profiles from the included PDF.")
    parser.add_argument("--pdf", type=Path, default=Path("IFCT2017.pdf"))
    parser.add_argument("--output", type=Path, default=Path("data/ifct-foods.json"))
    args = parser.parse_args()

    if not args.pdf.exists():
        raise FileNotFoundError(f"IFCT PDF not found: {args.pdf}")
    pdf = fitz.open(args.pdf)
    foods = build_table_one(pdf)
    for table in TABLES:
        if table["key"] != "table12":
            attach_table_profiles(pdf, foods, table)

    oils = get_table12_foods(pdf, TABLES[-1])
    for table in TABLES:
        if table["key"] == "table10":
            fields = [field_info for group in TABLE10_PAGE_FIELDS for field_info in group]
        else:
            fields = table["fields"]
        table["fields"] = [
            {key: value for key, value in field_info.items() if key != "position"}
            for field_info in fields
        ]
    table_one = {
        "key": "table1",
        "title": "Table 1 · Proximate principles and dietary fibre",
        "blankMeansBelowDetection": True,
        "fields": [
            {key: value for key, value in field_info.items() if key != "position"}
            for field_info in TABLE_ONE_FIELDS
        ],
    }
    for food in foods:
        food["profileTables"] = sorted(set(food["profileTables"]))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "Indian Food Composition Tables 2017, Tables 1–12 (ICMR-NIN)",
        "per": "100 g edible portion unless a table specifies otherwise",
        "mainFoodCount": len(foods),
        "supplementalFoodCount": len(oils),
        "tables": [table_one] + [
            {key: value for key, value in table.items() if key != "pages"}
            for table in TABLES
        ],
        "foods": foods + oils,
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(foods)} Table 1 foods and {len(oils)} Table 12 oil profiles to {args.output}")
    for table in payload["tables"]:
        populated = sum(
            sum(key.startswith(f"{table['key']}:") for key in food["nutrients"])
            for food in payload["foods"]
        )
        print(f"{table['key']}: {len(table['fields'])} nutrients, {populated} recorded values")


if __name__ == "__main__":
    main()
