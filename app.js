const STORAGE_KEY = "plateful-state-v1";
const INITIAL_VISIBLE_FOODS = 18;
const FOODS_PER_PAGE = 18;
const FOOD_SEARCH_ALIASES = {
  D061: ["green pea", "green peas", "fresh pea", "fresh peas", "hare matar"]
};
const MACRO_TARGETS = {
  carbs: { min: 45, max: 55, caloriesPerGram: 4 },
  protein: { min: 10, max: 15, caloriesPerGram: 4 },
  fat: { min: 20, max: 30, caloriesPerGram: 9 }
};

const elements = {
  profileDialog: document.querySelector("#profile-dialog"),
  nutrientDialog: document.querySelector("#nutrient-dialog"),
  nutrientKicker: document.querySelector("#nutrient-kicker"),
  nutrientTitle: document.querySelector("#nutrient-title"),
  nutrientSubtitle: document.querySelector("#nutrient-subtitle"),
  nutrientSummary: document.querySelector("#nutrient-summary"),
  nutrientSections: document.querySelector("#nutrient-sections"),
  closeNutrientButton: document.querySelector("#close-nutrient-button"),
  profileForm: document.querySelector("#profile-form"),
  closeProfileButton: document.querySelector("#close-profile-button"),
  editProfileButton: document.querySelector("#edit-profile-button"),
  profileButtonLabel: document.querySelector("#profile-button-label"),
  formMessage: document.querySelector("#form-message"),
  dailyEnergyValue: document.querySelector("#daily-energy-value"),
  dailyEnergyCaption: document.querySelector("#daily-energy-caption"),
  bmiValue: document.querySelector("#bmi-value"),
  bmiCaption: document.querySelector("#bmi-caption"),
  bmrValue: document.querySelector("#bmr-value"),
  tefValue: document.querySelector("#tef-value"),
  plateTarget: document.querySelector("#plate-drop-target"),
  plateVisual: document.querySelector("#plate-visual"),
  plateItems: document.querySelector("#plate-items"),
  portionCaption: document.querySelector("#portion-caption"),
  emptyPlate: document.querySelector("#empty-plate"),
  plateCalories: document.querySelector("#plate-calories"),
  plateGoalCalories: document.querySelector("#plate-goal-calories"),
  mealShareLabel: document.querySelector("#meal-share-label"),
  mealShareSelect: document.querySelector("#meal-share-select"),
  energyProgress: document.querySelector("#energy-progress"),
  goalCaption: document.querySelector("#goal-caption"),
  macroDonut: document.querySelector("#macro-donut"),
  macroCount: document.querySelector("#macro-count"),
  balanceScore: document.querySelector("#balance-score"),
  balanceNote: document.querySelector("#balance-note"),
  foodSearch: document.querySelector("#food-search"),
  categoryFilter: document.querySelector("#category-filter"),
  foodCount: document.querySelector("#food-count"),
  resultsLabel: document.querySelector("#results-label"),
  foodList: document.querySelector("#food-list"),
  showMoreButton: document.querySelector("#show-more-button"),
  browseFoodsButton: document.querySelector("#browse-foods-button"),
  toast: document.querySelector("#toast")
};

let state = {
  profile: null,
  items: [],
  mealShare: 0.3
};
let foods = [];
let foodByCode = new Map();
let nutrientTables = [];
let visibleFoodCount = INITIAL_VISIBLE_FOODS;
let toastTimeout;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function readSavedState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Could not read the saved plate from browser storage.", error);
    showToast("Browser storage is unavailable. Your changes will only last for this visit.");
    return;
  }

  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    const hasValidProfile = saved.profile
      && Number.isFinite(saved.profile.age)
      && Number.isFinite(saved.profile.height)
      && Number.isFinite(saved.profile.weight)
      && Number.isFinite(saved.profile.activity)
      && ["female", "male"].includes(saved.profile.equation);
    const validItems = Array.isArray(saved.items)
      && saved.items.every((item) => typeof item.code === "string" && Number.isFinite(item.grams) && item.grams > 0);
    const validMealShare = [0.25, 0.3, 0.35, 0.4].includes(saved.mealShare);

    if (!hasValidProfile || !validItems || !validMealShare) {
      throw new TypeError("Saved plate does not match the expected format.");
    }

    state = {
      profile: saved.profile,
      items: saved.items,
      mealShare: saved.mealShare
    };
  } catch (error) {
    console.error("Could not restore the saved profile and plate.", error);
    showToast("Your saved plate couldn't be read, so a fresh one is ready.");
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save the current plate to browser storage.", error);
    showToast("Browser storage is unavailable. Your latest changes may not be saved.");
  }
}

function calculateNeeds(profile) {
  const { age, height, weight, equation, activity } = profile;
  const bmr = equation === "male"
    ? 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
    : 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  const activityAdjusted = bmr * activity;
  const tee = activityAdjusted / 0.9;

  return {
    bmi: weight / ((height / 100) ** 2),
    bmr,
    tef: tee - activityAdjusted,
    tee
  };
}

function numberLabel(value) {
  return Math.round(value).toLocaleString();
}

function setProfileForm(profile) {
  const form = elements.profileForm.elements;
  if (!profile) return;

  form.namedItem("age").value = profile.age;
  form.namedItem("equation").value = profile.equation;
  form.namedItem("height").value = profile.height;
  form.namedItem("weight").value = profile.weight;
  form.namedItem("activity").value = String(profile.activity);
}

function renderProfile() {
  if (!state.profile) {
    elements.dailyEnergyValue.textContent = "—";
    elements.dailyEnergyCaption.textContent = "Personalized with your details";
    elements.bmiValue.textContent = "—";
    elements.bmiCaption.textContent = "A height-to-weight ratio";
    elements.bmrValue.textContent = "—";
    elements.tefValue.textContent = "—";
    elements.profileButtonLabel.textContent = "Your profile";
    return;
  }

  const needs = calculateNeeds(state.profile);
  elements.dailyEnergyValue.textContent = numberLabel(needs.tee);
  elements.dailyEnergyCaption.textContent = "Estimated total daily energy expenditure";
  elements.bmiValue.textContent = needs.bmi.toFixed(1);
  elements.bmiCaption.textContent = "A screening measure, not a diagnosis";
  elements.bmrValue.textContent = numberLabel(needs.bmr);
  elements.tefValue.textContent = numberLabel(needs.tef);
  elements.profileButtonLabel.textContent = "Edit profile";
}

function foodIcon(food) {
  const category = typeof food === "string" ? food : food.category;
  const name = typeof food === "string" ? "" : food.name.toLocaleLowerCase();
  const foodIllustrations = [
    [/coconut oil/, "🥥"],
    [/oil|ghee|vanaspati/, "🫒"],
    [/rice|puffed|flakes/, "🍚"],
    [/maize|corn/, "🌽"],
    [/oat/, "🌾"],
    [/mango/, "🥭"],
    [/banana/, "🍌"],
    [/apple/, "🍎"],
    [/guava|pear/, "🍐"],
    [/grape/, "🍇"],
    [/orange|lemon|citrus/, "🍊"],
    [/papaya|jackfruit/, "🍈"],
    [/pineapple/, "🍍"],
    [/watermelon/, "🍉"],
    [/pomegranate/, "🍎"],
    [/tomato/, "🍅"],
    [/eggplant|brinjal/, "🍆"],
    [/potato/, "🥔"],
    [/onion/, "🧅"],
    [/garlic/, "🧄"],
    [/ginger/, "🫚"],
    [/carrot/, "🥕"],
    [/spinach|leaves/, "🥬"],
    [/cabbage/, "🥬"],
    [/cauliflower|broccoli/, "🥦"],
    [/cucumber|okra|lady finger/, "🥒"],
    [/capsicum|bell pepper/, "🫑"],
    [/pumpkin/, "🎃"],
    [/chilli|chillies/, "🌶️"],
    [/\beggs?\b/, "🥚"],
    [/milk|curd|paneer|khoa/, "🥛"],
    [/coconut/, "🥥"],
    [/cashew|almond|groundnut|peanut|sesame/, "🥜"],
    [/chicken/, "🍗"],
    [/goat|lamb|mutton|beef|pork/, "🥩"],
    [/prawn|crab|shrimp/, "🦐"],
    [/fish|meen|rohu|tuna|salmon/, "🐟"],
    [/lentil|gram|dal|pulse|bean|soy/, "🫘"],
    [/pea|matar/, "🫛"],
    [/wheat|bread|roti/, "🫓"]
  ];
  const illustration = foodIllustrations.find(([pattern]) => pattern.test(name));
  if (illustration) return illustration[1];
  if (category.includes("Cereals")) return "🌾";
  if (category.includes("legumes")) return "🫘";
  if (category.includes("leafy")) return "🥬";
  if (category.includes("vegetables")) return "🥕";
  if (category.includes("Fruits")) return "🍊";
  if (category.includes("Roots")) return "🥔";
  if (category.includes("spices")) return "🌶️";
  if (category.includes("Nuts")) return "🥜";
  if (category.includes("Sugars")) return "🍯";
  if (category.includes("Mushrooms")) return "🍄";
  if (category.includes("Miscellaneous")) return "🥥";
  if (category.includes("Milk")) return "🥛";
  if (category.includes("Eggs")) return "🥚";
  if (category.includes("Poultry")) return "🍗";
  if (category.includes("meat")) return "🥩";
  if (category.includes("shellfish")) return "🦐";
  if (category.includes("mollusks")) return "🐚";
  if (category.includes("fish")) return "🐟";
  return "🍽️";
}

function foodColor(category) {
  if (category.includes("oils")) return "#f5ecd8";
  if (category.includes("leafy")) return "#e6f0dd";
  if (category.includes("vegetables")) return "#edf2df";
  if (category.includes("Fruits")) return "#f9ead9";
  if (category.includes("legumes")) return "#e7eee2";
  if (category.includes("fish") || category.includes("shellfish") || category.includes("mollusks")) return "#e7eff1";
  if (category.includes("meat") || category.includes("Poultry")) return "#f6e8df";
  if (category.includes("Milk") || category.includes("Eggs")) return "#f2efdf";
  if (category.includes("Nuts")) return "#f3e9d9";
  if (category.includes("spices")) return "#f5e5d9";
  if (category.includes("Sugars")) return "#f5eed9";
  if (category.includes("Mushrooms")) return "#eee8e2";
  return "#f4efdf";
}

function formatMacro(value) {
  return value === null ? "n/r" : `${value.toFixed(1)}g`;
}

function canAddFood(food) {
  return Boolean(food)
    && Number.isFinite(food.energyKcal)
    && Number.isFinite(food.protein)
    && Number.isFinite(food.fat);
}

function renderCategoryOptions() {
  const categories = [...new Set(foods.map((food) => food.category))];
  elements.categoryFilter.innerHTML = [
    '<option value="">All food groups</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");
}

function getFilteredFoods() {
  const query = elements.foodSearch.value.trim().toLocaleLowerCase();
  const category = elements.categoryFilter.value;

  return foods.filter((food) => {
    const matchesCategory = !category || food.category === category;
    const matchesQuery = !query
      || food.name.toLocaleLowerCase().includes(query)
      || (FOOD_SEARCH_ALIASES[food.code] || []).some((alias) => alias.includes(query))
      || food.code.toLocaleLowerCase().includes(query)
      || food.category.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
}

function renderFoodLibrary() {
  if (!foods.length) return;

  const filteredFoods = getFilteredFoods();
  const visibleFoods = filteredFoods.slice(0, visibleFoodCount);
  elements.foodCount.textContent = foods.length.toLocaleString();
  elements.resultsLabel.textContent = `${filteredFoods.length.toLocaleString()} ${filteredFoods.length === 1 ? "food" : "foods"}`;
  elements.showMoreButton.hidden = visibleFoods.length >= filteredFoods.length;
  elements.showMoreButton.textContent = `Show ${Math.min(FOODS_PER_PAGE, filteredFoods.length - visibleFoods.length)} more foods ↓`;

  if (!filteredFoods.length) {
    elements.foodList.innerHTML = '<div class="food-empty"><strong>No IFCT foods match.</strong><span>Try a different name or food group.</span></div>';
    return;
  }

  elements.foodList.innerHTML = visibleFoods.map((food, index) => {
    const canAdd = canAddFood(food);
    const portion = state.items.find((item) => item.code === food.code)?.grams;
    return `
    <article class="food-card${canAdd ? "" : " is-profile-only"}${portion ? " is-on-plate" : ""}" draggable="${canAdd}" data-food-code="${escapeHtml(food.code)}" title="${canAdd ? "Drag to your plate, or use the plus button." : "Profile only: Table 12 does not report energy or macronutrients."}" style="--food-tint:${foodColor(food.category)};--card-index:${index}">
      <span class="food-icon" aria-hidden="true"><span class="food-icon-art">${foodIcon(food)}</span></span>
      <span class="food-card-main">
        <span class="food-card-title"><span class="food-card-name">${escapeHtml(food.name)}</span><span class="food-in-plate" aria-live="polite"${portion ? "" : " hidden"}>${portion ? `${portion} g on plate` : ""}</span></span>
        <span class="food-card-meta">
          <span class="food-code">${escapeHtml(food.code)}</span>
          <span aria-hidden="true">·</span>
          <span class="food-category">${escapeHtml(food.category)}</span>
          <span aria-hidden="true">·</span>
          <span>${canAdd ? `${numberLabel(food.energyKcal)} kcal / 100 g` : "Fatty-acid profile · no calorie data"}</span>
          <span class="food-macro-line">P ${formatMacro(food.protein)} · C ${formatMacro(food.carbs)} · F ${formatMacro(food.fat)}</span>
        </span>
      </span>
      <button class="food-details" type="button" data-food-details="${escapeHtml(food.code)}" aria-label="View the full nutrient profile for ${escapeHtml(food.name)}">Profile</button>
      <button class="food-add" type="button" data-add-food="${escapeHtml(food.code)}" aria-label="${canAdd ? `Add ${escapeHtml(food.name)} to your plate` : `${escapeHtml(food.name)} is profile-only and cannot be added to the plate`}"${canAdd ? "" : " disabled"}>${canAdd ? "+" : "—"}</button>
    </article>
  `;}).join("");
}

function addFood(code) {
  const food = foodByCode.get(code);
  if (!food) {
    showToast("That food is no longer in the library. Please choose another.");
    return;
  }

  if (!canAddFood(food)) {
    showToast(`${food.name} has a Table 12 fatty-acid profile only, so it cannot be added to the plate.`);
    return;
  }

  const existing = state.items.find((item) => item.code === code);
  if (existing) {
    existing.grams += 100;
  } else {
    state.items.push({ code, grams: 100 });
  }
  updateFoodCardState(code);
  saveState();
  renderPlate();
  showToast(`${food.name} added · 100 g`);
}

function getPlateTotals() {
  return state.items.reduce((totals, item) => {
    const food = foodByCode.get(item.code);
    if (!food || !canAddFood(food)) return totals;
    const portion = item.grams / 100;
    totals.energy += food.energyKcal * portion;
    totals.protein += food.protein * portion;
    totals.fat += food.fat * portion;
    if (food.carbs !== null) {
      totals.carbs += food.carbs * portion;
      totals.carbsReported = true;
    } else {
      totals.carbsUnreported = true;
    }

    return totals;
  }, { energy: 0, protein: 0, fat: 0, carbs: 0, carbsReported: false, carbsUnreported: false });
}

function updateFoodCardState(code) {
  const card = [...elements.foodList.querySelectorAll(".food-card")]
    .find((foodCard) => foodCard.dataset.foodCode === code);
  if (!card) return;
  const portion = state.items.find((item) => item.code === code)?.grams;
  card.classList.toggle("is-on-plate", Boolean(portion));
  const status = card.querySelector(".food-in-plate");
  if (status) {
    status.textContent = portion ? `${portion} g on plate` : "";
    status.hidden = !portion;
  }
}

function getPortionPosition(index, count) {
  if (count === 1) return { x: 50, y: 50 };

  if (count > 8) {
    const columns = count <= 12 ? 3 : count <= 16 ? 4 : 5;
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, count - (row * columns));
    const spread = count <= 12 ? 52 : 60;
    const x = itemsInRow === 1
      ? 50
      : 50 - (spread / 2) + (spread * column) / (itemsInRow - 1);
    const rows = Math.ceil(count / columns);
    const y = rows === 1 ? 50 : 20 + (60 * row) / (rows - 1);
    return { x, y };
  }

  const radius = Math.min(32, 18 + count * 2);
  const angle = (-Math.PI / 2) + (index * (2 * Math.PI / count));
  return {
    x: 50 + (radius * Math.cos(angle)),
    y: 50 + (radius * Math.sin(angle))
  };
}

function updateMacroSummary(totals) {
  const macroCalories = {
    carbs: totals.carbs * MACRO_TARGETS.carbs.caloriesPerGram,
    protein: totals.protein * MACRO_TARGETS.protein.caloriesPerGram,
    fat: totals.fat * MACRO_TARGETS.fat.caloriesPerGram
  };
  const macroTotal = macroCalories.carbs + macroCalories.protein + macroCalories.fat;
  const shares = {
    carbs: macroTotal && totals.carbsReported ? (macroCalories.carbs / macroTotal) * 100 : null,
    protein: macroTotal ? (macroCalories.protein / macroTotal) * 100 : null,
    fat: macroTotal ? (macroCalories.fat / macroTotal) * 100 : null
  };

  elements.macroCount.textContent = macroTotal ? numberLabel(macroTotal) : "—";
  elements.macroDonut.setAttribute(
    "aria-label",
    macroTotal
      ? `Macro calorie balance: ${shares.carbs === null ? "carbohydrate not reported" : `${Math.round(shares.carbs)} percent carbohydrate`}, ${Math.round(shares.protein)} percent protein, ${Math.round(shares.fat)} percent fat`
      : "Add food to see your macronutrient balance"
  );

  if (macroTotal) {
    const carbEnd = shares.carbs ?? 0;
    const proteinEnd = carbEnd + shares.protein;
    elements.macroDonut.style.background = `conic-gradient(var(--carbs) 0% ${carbEnd}%, var(--protein) ${carbEnd}% ${proteinEnd}%, var(--fat) ${proteinEnd}% 100%)`;
  } else {
    elements.macroDonut.style.background = "";
  }

  let scoreTotal = 0;
  let inRangeCount = 0;
  let evaluatedCount = 0;
  for (const key of Object.keys(MACRO_TARGETS)) {
    const row = document.querySelector(`.macro-row[data-macro="${key}"]`);
    const shareElement = document.querySelector(`#${key}-share`);
    const share = shares[key];
    const target = MACRO_TARGETS[key];
    row.classList.remove("is-in-range", "is-low", "is-high");

    if (share === null) {
      shareElement.textContent = "—";
      continue;
    }

    evaluatedCount += 1;
    const inRange = share >= target.min && share <= target.max;
    const status = inRange ? "is-in-range" : share < target.min ? "is-low" : "is-high";
    row.classList.add(status);
    shareElement.textContent = `${Math.round(share)}%`;
    inRangeCount += Number(inRange);
    scoreTotal += inRange
      ? 100
      : share < target.min
        ? (share / target.min) * 100
        : (target.max / share) * 100;
  }

  if (!macroTotal) {
    elements.balanceScore.textContent = "—";
    elements.balanceNote.textContent = "Add a food to see how its macros contribute to your plate.";
    elements.balanceNote.classList.remove("is-positive");
    return;
  }

  elements.balanceScore.textContent = String(Math.round(scoreTotal / evaluatedCount));
  const balanceText = inRangeCount === 3
    ? "Lovely balance — all three macros are inside the ranges you chose."
    : `${inRangeCount} of ${evaluatedCount} reported macros are inside your chosen ranges. Tweak a portion or add another food to explore.`;
  const noteText = totals.carbsUnreported
    ? `${balanceText} Carbohydrate is not reported for one or more foods on this plate.`
    : balanceText;
  elements.balanceNote.textContent = noteText;
  elements.balanceNote.classList.toggle("is-positive", inRangeCount === 3);
}

function renderPlate() {
  const availableItems = state.items.filter((item) => {
    const food = foodByCode.get(item.code);
    return food && canAddFood(food);
  });
  const overflowCount = Math.max(0, availableItems.length - 24);
  const visualItems = overflowCount ? availableItems.slice(0, 24) : availableItems;
  const visualLayoutCount = overflowCount ? 25 : visualItems.length;
  const totals = getPlateTotals();
  const hasProfile = Boolean(state.profile);
  const targetCalories = hasProfile ? calculateNeeds(state.profile).tee * state.mealShare : 0;
  const progress = targetCalories ? Math.min(100, (totals.energy / targetCalories) * 100) : 0;

  elements.emptyPlate.hidden = availableItems.length > 0;
  elements.plateCalories.textContent = numberLabel(totals.energy);
  elements.plateGoalCalories.textContent = numberLabel(targetCalories);
  elements.mealShareLabel.textContent = `${Math.round(state.mealShare * 100)}%`;
  elements.mealShareSelect.value = String(state.mealShare);
  elements.energyProgress.style.width = `${progress}%`;
  elements.goalCaption.textContent = totals.energy > targetCalories && targetCalories
    ? "You've gone past this flexible meal-sized energy guide."
    : "A flexible meal-sized starting point, not a prescription.";

  const maxSize = visualLayoutCount <= 2
    ? 104
    : visualLayoutCount <= 4
      ? 90
      : visualLayoutCount <= 6
        ? 76
        : visualLayoutCount <= 8
          ? 62
          : visualLayoutCount <= 12
            ? 44
            : visualLayoutCount <= 16
              ? 36
              : visualLayoutCount <= 25
                ? 28
                : 24;
  const minSize = visualLayoutCount > 16 ? 24 : visualLayoutCount > 8 ? 28 : 44;
  const sizeBase = visualLayoutCount > 6 ? maxSize * 0.82 : 72;
  elements.portionCaption.innerHTML = overflowCount
    ? `<span aria-hidden="true">↕</span> 24 foods shown · ${overflowCount} more in the portion list below`
    : '<span aria-hidden="true">↕</span> Food illustrations grow with your serving · adjust in 25 g steps';
  elements.plateVisual.innerHTML = visualItems.map((item, index) => {
    const food = foodByCode.get(item.code);
    const { x, y } = getPortionPosition(index, visualLayoutCount);
    const size = Math.min(maxSize, Math.max(minSize, Math.round(sizeBase * Math.sqrt(item.grams / 100))));
    return `
      <span class="food-portion" role="listitem" aria-label="${escapeHtml(food.name)}, ${item.grams} grams"
        style="--portion-x:${x.toFixed(1)}%;--portion-y:${y.toFixed(1)}%;--portion-size:${size}px;--portion-background:${foodColor(food.category)}">
        <span class="food-portion-icon" aria-hidden="true">${foodIcon(food)}</span>
        <span class="food-portion-grams">${item.grams} g</span>
      </span>
    `;
  }).join("");
  if (overflowCount) {
    const { x, y } = getPortionPosition(24, 25);
    elements.plateVisual.innerHTML += `<span class="food-portion-overflow" role="listitem" aria-label="${overflowCount} additional foods in the portion list" style="--portion-x:${x.toFixed(1)}%;--portion-y:${y.toFixed(1)}%">+${overflowCount}</span>`;
  }

  elements.plateItems.innerHTML = availableItems.map((item) => {
    const food = foodByCode.get(item.code);
    const calories = numberLabel(food.energyKcal * item.grams / 100);
    const carbohydrateNote = food.carbs === null ? " · carbs not reported" : "";
    return `
      <div class="plate-food-row">
        <span class="plate-food-icon" aria-hidden="true">${foodIcon(food)}</span>
        <span class="plate-food-main">
          <span class="plate-food-name" title="${escapeHtml(food.name)}">${escapeHtml(food.name)}</span>
          <span class="plate-food-details">${calories} kcal${carbohydrateNote}</span>
        </span>
        <span class="portion-controls">
          <button type="button" data-action="decrease" data-code="${escapeHtml(item.code)}" aria-label="Remove 25 grams of ${escapeHtml(food.name)}">−</button>
          <span class="portion-size">${item.grams}g</span>
          <button type="button" data-action="increase" data-code="${escapeHtml(item.code)}" aria-label="Add 25 grams of ${escapeHtml(food.name)}">+</button>
        </span>
      </div>
    `;
  }).join("");

  updateMacroSummary(totals);
}

function nutrientValueLabel(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function nutrientMissingLabel(food, table, field) {
  if (table.key === "table1" && ["animals", "fish"].includes(food.profileLayout)
    && ["carbs", "fiber", "fiberInsoluble", "fiberSoluble"].includes(field.code)) {
    return "Not listed in this Table 1 layout";
  }
  return table.blankMeansBelowDetection ? "Below detectable limit" : "Not reported";
}

function renderNutrientSection(food, table) {
  const hasTableProfile = food.profileTables.includes(table.key);
  const recordedCount = hasTableProfile
    ? table.fields.filter((field) => Number.isFinite(food.nutrients[`${table.key}:${field.code}`])).length
    : 0;
  const rows = hasTableProfile
    ? table.fields.map((field) => {
      const value = food.nutrients[`${table.key}:${field.code}`];
      const display = Number.isFinite(value)
        ? `${nutrientValueLabel(value)} <span>${escapeHtml(field.unit)}</span>`
        : `<span class="nutrient-missing">${escapeHtml(nutrientMissingLabel(food, table, field))}</span>`;
      return `
        <div class="nutrient-field">
          <span>${escapeHtml(field.label)}</span>
          <strong>${display}</strong>
        </div>
      `;
    }).join("")
    : '<p class="nutrient-no-data">IFCT does not list a profile for this food in this table.</p>';
  const isOpen = table.key === "table1" || (food.profileLayout === "supplemental" && table.key === "table12");

  return `
    <details class="nutrient-section"${isOpen ? " open" : ""}>
      <summary>
        <span>${escapeHtml(table.title)}</span>
        <small>${hasTableProfile ? `${recordedCount} of ${table.fields.length} values` : "No entry"}</small>
      </summary>
      <div class="nutrient-grid">${rows}</div>
    </details>
  `;
}

function openNutrientProfile(code) {
  const food = foodByCode.get(code);
  if (!food) {
    showToast("That food is no longer in the library. Please choose another.");
    return;
  }

  elements.nutrientKicker.textContent = food.profileLayout === "supplemental"
    ? "IFCT 2017 · FATTY-ACID PERCENTAGES OF TOTAL FATTY ACIDS"
    : "IFCT 2017 · PER 100 G EDIBLE PORTION";
  elements.nutrientTitle.textContent = food.name;
  elements.nutrientSubtitle.textContent = `${food.code} · ${food.category}${food.regions ? ` · reported in ${food.regions} ${food.regions === 1 ? "region" : "regions"}` : ""}`;
  const summaryFields = [
    ["Energy", Number.isFinite(food.energyKcal) ? `${nutrientValueLabel(food.energyKcal)} kcal` : "Not reported"],
    ["Protein", Number.isFinite(food.protein) ? `${nutrientValueLabel(food.protein)} g` : "Not reported"],
    ["Available carbohydrate", Number.isFinite(food.carbs) ? `${nutrientValueLabel(food.carbs)} g` : "Not reported"],
    ["Total fat", Number.isFinite(food.fat) ? `${nutrientValueLabel(food.fat)} g` : "Not reported"]
  ];
  elements.nutrientSummary.innerHTML = summaryFields.map(([label, value]) => `
    <div class="nutrient-summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
  elements.nutrientSections.innerHTML = nutrientTables
    .map((table) => renderNutrientSection(food, table))
    .join("");
  elements.nutrientDialog.showModal();
}

async function loadFoodData() {
  try {
    const response = await fetch("./data/ifct-foods.json");
    if (!response.ok) {
      throw new Error(`IFCT food data request failed with status ${response.status}.`);
    }
    const data = await response.json();
    if (!Array.isArray(data.foods)
      || data.foods.length !== 542
      || data.mainFoodCount !== 528
      || data.supplementalFoodCount !== 14
      || !Array.isArray(data.tables)
      || data.tables.length !== 12
      || data.tables.some((table) => !Array.isArray(table.fields) || table.fields.length === 0)) {
      throw new TypeError("IFCT food data is missing or incomplete.");
    }
    foods = data.foods;
    nutrientTables = data.tables;
    foodByCode = new Map(foods.map((food) => [food.code, food]));
    const savedItemCount = state.items.length;
    state.items = state.items.filter((item) => {
      const food = foodByCode.get(item.code);
      return food && canAddFood(food);
    });
    if (state.items.length !== savedItemCount) {
      saveState();
      showToast("Foods no longer in the catalogue were removed from your saved plate.");
    }
    renderCategoryOptions();
    renderFoodLibrary();
    renderPlate();
  } catch (error) {
    console.error("Could not load the IFCT food catalogue.", error);
    elements.foodList.innerHTML = '<div class="food-empty"><strong>The IFCT catalogue is unavailable.</strong><span>Start the local web server from the project folder, then reload this page.</span></div>';
    elements.resultsLabel.textContent = "Food data unavailable";
    showToast("The IFCT catalogue needs a local web server to load.");
  }
}

elements.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  elements.formMessage.textContent = "";
  if (!elements.profileForm.reportValidity()) return;

  const form = new FormData(elements.profileForm);
  const profile = {
    age: Number(form.get("age")),
    equation: form.get("equation"),
    height: Number(form.get("height")),
    weight: Number(form.get("weight")),
    activity: Number(form.get("activity"))
  };
  const valid = Number.isInteger(profile.age)
    && profile.age >= 18
    && profile.age <= 100
    && profile.height >= 100
    && profile.height <= 230
    && profile.weight >= 30
    && profile.weight <= 300
    && Number.isFinite(profile.activity);

  if (!valid) {
    elements.formMessage.textContent = "Please check the values and try again.";
    return;
  }

  state.profile = profile;
  saveState();
  renderProfile();
  renderPlate();
  elements.profileDialog.close();
  showToast("Your plate is ready to make your own.");
});

elements.editProfileButton.addEventListener("click", () => {
  setProfileForm(state.profile);
  elements.formMessage.textContent = "";
  elements.closeProfileButton.hidden = !state.profile;
  elements.profileDialog.showModal();
});

elements.closeProfileButton.addEventListener("click", () => {
  elements.profileDialog.close();
});

elements.closeNutrientButton.addEventListener("click", () => {
  elements.nutrientDialog.close();
});

elements.profileDialog.addEventListener("cancel", (event) => {
  if (!state.profile) {
    event.preventDefault();
    showToast("Add your details to get started.");
  }
});

elements.foodSearch.addEventListener("input", () => {
  visibleFoodCount = INITIAL_VISIBLE_FOODS;
  renderFoodLibrary();
});

elements.categoryFilter.addEventListener("change", () => {
  visibleFoodCount = INITIAL_VISIBLE_FOODS;
  renderFoodLibrary();
});

elements.showMoreButton.addEventListener("click", () => {
  visibleFoodCount += FOODS_PER_PAGE;
  renderFoodLibrary();
});

elements.browseFoodsButton.addEventListener("click", () => {
  document.querySelector("#food-search").scrollIntoView({ behavior: "smooth", block: "center" });
});

elements.foodList.addEventListener("click", (event) => {
  const detailsButton = event.target.closest("[data-food-details]");
  if (detailsButton) {
    openNutrientProfile(detailsButton.dataset.foodDetails);
    return;
  }
  const button = event.target.closest("[data-add-food]");
  if (button) addFood(button.dataset.addFood);
});

elements.foodList.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".food-card");
  if (!card || !event.dataTransfer || !canAddFood(foodByCode.get(card.dataset.foodCode))) return;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", card.dataset.foodCode);
});

elements.foodList.addEventListener("dragend", (event) => {
  const card = event.target.closest(".food-card");
  if (card) card.classList.remove("is-dragging");
  elements.plateTarget.classList.remove("is-dragging");
});

elements.plateTarget.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  elements.plateTarget.classList.add("is-dragging");
});

elements.plateTarget.addEventListener("dragleave", (event) => {
  if (!elements.plateTarget.contains(event.relatedTarget)) {
    elements.plateTarget.classList.remove("is-dragging");
  }
});

elements.plateTarget.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.plateTarget.classList.remove("is-dragging");
  const code = event.dataTransfer?.getData("text/plain");
  if (code) addFood(code);
});

elements.plateItems.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = state.items.find((plateItem) => plateItem.code === button.dataset.code);
  if (!item) return;

  if (button.dataset.action === "increase") {
    item.grams += 25;
  } else if (button.dataset.action === "decrease") {
    item.grams -= 25;
    if (item.grams <= 0) {
      state.items = state.items.filter((plateItem) => plateItem.code !== item.code);
    }
  }
  updateFoodCardState(item.code);
  saveState();
  renderPlate();
});

elements.mealShareSelect.addEventListener("change", () => {
  const share = Number(elements.mealShareSelect.value);
  if (![0.25, 0.3, 0.35, 0.4].includes(share)) {
    showToast("Choose one of the meal-share options to update your plate.");
    elements.mealShareSelect.value = String(state.mealShare);
    return;
  }
  state.mealShare = share;
  saveState();
  renderPlate();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "/" && !elements.profileDialog.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    event.preventDefault();
    elements.foodSearch.focus();
  }
});

readSavedState();
renderProfile();
setProfileForm(state.profile);
elements.closeProfileButton.hidden = !state.profile;
if (!state.profile) elements.profileDialog.showModal();
renderPlate();
loadFoodData();
