// Taste preferences only. These name hints are never an allergy safety check.
export const preferenceText = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ـًٌٍَُِّْٰ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const row = (id, label, section, keys, aliases = []) => ({
  id,
  label,
  section,
  keys,
  aliases: [label, ...aliases],
});
export const EXCLUSIONS = [
  row(
    "legumes",
    "كل البقوليات",
    "البروتين والبقول",
    ["fava", "lentils", "chickpeas", "kidney", "whitebeans"],
    ["فول", "عدس", "حمص", "فاصوليا", "beans", "lentils", "chickpeas"],
  ),
  row(
    "fava",
    "الفول",
    "البروتين والبقول",
    ["fava"],
    ["فول", "fava", "broad beans"],
  ),
  row("lentils", "العدس", "البروتين والبقول", ["lentils"], ["عدس", "lentils"]),
  row(
    "chickpeas",
    "الحمص",
    "البروتين والبقول",
    ["chickpeas"],
    ["حمص", "chickpeas"],
  ),
  row(
    "beans",
    "الفاصوليا",
    "البروتين والبقول",
    ["kidney", "whitebeans"],
    ["فاصوليا", "kidney beans", "white beans"],
  ),
  row(
    "eggs",
    "البيض",
    "البروتين والبقول",
    ["egg", "eggwhite", "friedegg"],
    ["بيض", "eggs", "egg"],
  ),
  row(
    "chicken",
    "الفراخ",
    "البروتين والبقول",
    ["chicken", "chickenthigh", "chickenboiled"],
    ["فراخ", "دجاج", "chicken"],
  ),
  row(
    "meat",
    "اللحوم الحمراء",
    "البروتين والبقول",
    ["beef"],
    ["لحم", "لحمه", "لحوم", "beef", "lamb", "mutton"],
  ),
  row(
    "offal",
    "الكبدة والأحشاء",
    "البروتين والبقول",
    [],
    ["كبده", "كبد", "كلاوي", "liver", "offal"],
  ),
  row(
    "fish",
    "كل السمك",
    "البروتين والبقول",
    ["fish", "seabass"],
    [
      "سمك",
      "بلطي",
      "تونه",
      "سلمون",
      "سردين",
      "fish",
      "tilapia",
      "tuna",
      "salmon",
      "sardines",
    ],
  ),
  row(
    "shellfish",
    "الجمبري والمأكولات البحرية",
    "البروتين والبقول",
    ["shrimp"],
    [
      "جمبري",
      "روبيان",
      "كابوريا",
      "كاليماري",
      "shrimp",
      "prawns",
      "crab",
      "squid",
    ],
  ),
  row(
    "dairy",
    "كل الألبان والجبن",
    "الألبان",
    ["yogurt", "cottage", "feta", "milk"],
    [
      "لبن",
      "حليب",
      "زبادي",
      "جبنه",
      "جبن",
      "قشطه",
      "milk",
      "yogurt",
      "yoghurt",
      "cheese",
      "cream",
    ],
  ),
  row("milk", "اللبن", "الألبان", [], ["لبن", "حليب", "milk"]),
  row(
    "yogurt",
    "الزبادي",
    "الألبان",
    ["yogurt"],
    ["زبادي", "yogurt", "yoghurt"],
  ),
  row(
    "cheese",
    "الجبن",
    "الألبان",
    ["cottage", "feta"],
    ["جبنه", "جبن", "cheese"],
  ),
  row(
    "bread",
    "العيش والخبز",
    "النشويات",
    ["bread", "wholebread"],
    ["عيش", "خبز", "bread", "pita"],
  ),
  row(
    "rice",
    "الأرز بكل أنواعه",
    "النشويات",
    ["rice", "brownrice"],
    ["ارز", "رز", "rice"],
  ),
  row(
    "pasta",
    "المكرونة",
    "النشويات",
    ["pasta"],
    ["مكرونه", "ماكرونه", "pasta", "macaroni", "spaghetti"],
  ),
  row("oats", "الشوفان", "النشويات", ["oats"], ["شوفان", "oats"]),
  row(
    "potato",
    "البطاطس",
    "النشويات",
    ["potato"],
    ["بطاطس", "potato", "potatoes"],
  ),
  row(
    "sweetpotato",
    "البطاطا الحلوة",
    "النشويات",
    [],
    ["بطاطا", "sweet potato"],
  ),
  row(
    "tomato",
    "الطماطم",
    "الخضار",
    ["tomato", "tomatocooked"],
    ["طماطم", "tomato", "tomatoes"],
  ),
  row("cucumber", "الخيار", "الخضار", ["cucumber"], ["خيار", "cucumber"]),
  row("spinach", "السبانخ", "الخضار", ["spinach"], ["سبانخ", "spinach"]),
  row("broccoli", "البروكلي", "الخضار", ["broccoli"], ["بروكلي", "broccoli"]),
  row("onion", "البصل", "الخضار", [], ["بصل", "onion", "onions"]),
  row("garlic", "الثوم", "الخضار", [], ["ثوم", "توم", "garlic"]),
  row("pepper", "الفلفل", "الخضار", [], ["فلفل", "pepper", "peppers"]),
  row(
    "eggplant",
    "الباذنجان",
    "الخضار",
    [],
    ["باذنجان", "بتنجان", "eggplant", "aubergine"],
  ),
  row("zucchini", "الكوسة", "الخضار", [], ["كوسه", "zucchini", "courgette"]),
  row("okra", "البامية", "الخضار", [], ["باميه", "okra"]),
  row("molokhia", "الملوخية", "الخضار", [], ["ملوخيه", "molokhia"]),
  row("cabbage", "الكرنب", "الخضار", [], ["كرنب", "cabbage"]),
  row("cauliflower", "القرنبيط", "الخضار", [], ["قرنبيط", "cauliflower"]),
  row("carrot", "الجزر", "الخضار", [], ["جزر", "carrot", "carrots"]),
  row("peas", "البسلة", "الخضار", [], ["بسله", "بازلاء", "peas"]),
  row(
    "mushrooms",
    "المشروم",
    "الخضار",
    [],
    ["مشروم", "فطر", "mushroom", "mushrooms"],
  ),
  row("apple", "التفاح", "الفاكهة", ["apple"], ["تفاح", "apple", "apples"]),
  row("banana", "الموز", "الفاكهة", ["banana"], ["موز", "banana", "bananas"]),
  row(
    "orange",
    "البرتقال",
    "الفاكهة",
    ["orange"],
    ["برتقال", "orange", "oranges"],
  ),
  row("dates", "التمر والبلح", "الفاكهة", ["dates"], ["تمر", "بلح", "dates"]),
  row("mango", "المانجو", "الفاكهة", [], ["مانجو", "mango"]),
  row("guava", "الجوافة", "الفاكهة", [], ["جوافه", "guava"]),
  row(
    "strawberry",
    "الفراولة",
    "الفاكهة",
    [],
    ["فراوله", "strawberry", "strawberries"],
  ),
  row("grapes", "العنب", "الفاكهة", [], ["عنب", "grape", "grapes"]),
  row("watermelon", "البطيخ", "الفاكهة", [], ["بطيخ", "watermelon"]),
  row("citrus", "الليمون", "الفاكهة", [], ["ليمون", "lemon", "lime"]),
  row(
    "nuts",
    "كل المكسرات",
    "المكسرات والإضافات",
    ["peanuts", "almonds"],
    [
      "مكسرات",
      "فول سوداني",
      "لوز",
      "بندق",
      "عين جمل",
      "كاجو",
      "nuts",
      "peanuts",
      "almonds",
      "walnuts",
      "cashews",
    ],
  ),
  row(
    "peanuts",
    "الفول السوداني",
    "المكسرات والإضافات",
    ["peanuts"],
    ["فول سوداني", "peanut", "peanuts"],
  ),
  row(
    "almonds",
    "اللوز",
    "المكسرات والإضافات",
    ["almonds"],
    ["لوز", "almond", "almonds"],
  ),
  row(
    "sesame",
    "السمسم والطحينة",
    "المكسرات والإضافات",
    [],
    ["سمسم", "طحينه", "sesame", "tahini"],
  ),
  row(
    "olive",
    "زيت الزيتون",
    "المكسرات والإضافات",
    ["olive"],
    ["زيت زيتون", "olive oil"],
  ),
  row(
    "butter",
    "الزبدة والسمنة",
    "المكسرات والإضافات",
    [],
    ["زبده", "سمنه", "سمن", "butter", "ghee"],
  ),
  row("honey", "العسل", "المكسرات والإضافات", [], ["عسل", "honey"]),
  row("sugar", "السكر المضاف", "المكسرات والإضافات", [], ["سكر", "sugar"]),
  row(
    "coconut",
    "جوز الهند",
    "المكسرات والإضافات",
    [],
    ["جوز هند", "جوز الهند", "coconut"],
  ),
];
// Explicit mapping of regional library keys to existing taste groups.
const extraKeys = {
  legumes: ["falafel"],
  chicken: ["turkey", "shawarma_chicken"],
  meat: ["lamb", "shawarma_beef"],
  offal: ["liver"],
  fish: ["tuna", "salmon"],
  dairy: ["greekyogurt", "wholemilk", "mozzarella"],
  milk: ["milk", "wholemilk"],
  yogurt: ["greekyogurt"],
  cheese: ["mozzarella"],
  bread: ["toast"],
  rice: ["basmati"],
  sweetpotato: ["sweetpotato"],
  peas: ["peas"],
  okra: ["okra"],
  zucchini: ["zucchini"],
  eggplant: ["eggplant", "babaghanouj"],
  carrot: ["carrot", "carrotcooked"],
  pepper: ["pepper"],
  cabbage: ["cabbage"],
  onion: ["onion"],
  garlic: ["garlic"],
  mango: ["mango"],
  guava: ["guava"],
  grapes: ["grape"],
  watermelon: ["watermelon"],
  strawberry: ["strawberry"],
  citrus: ["lemon"],
  nuts: ["peanutbutter", "walnuts", "cashews"],
  peanuts: ["peanutbutter"],
  sesame: ["tahini", "babaghanouj"],
  honey: ["honey"],
};
for (const group of EXCLUSIONS)
  group.keys = [...new Set([...group.keys, ...(extraKeys[group.id] || [])])];
EXCLUSIONS.push(
  row(
    "greenbeans",
    "الفاصوليا الخضراء",
    "الخضار",
    ["greenbeans"],
    ["فاصوليا خضراء", "green beans"],
  ),
  row("lettuce", "الخس", "الخضار", ["lettuce"], ["خس", "lettuce"]),
  row("parsley", "البقدونس", "الخضار", ["parsley", "tabbouleh", "fattoush"], ["بقدونس", "parsley", "تبوله", "فتوش"]),
  row("fig", "التين", "الفاكهة", ["fig"], ["تين", "figs"]),
  row("pear", "الكمثرى", "الفاكهة", ["pear"], ["كمثري", "pears"]),
  row("melon", "الكنتالوب", "الفاكهة", ["melon"], ["كنتالوب", "شمام", "melon"]),
  row("bulgur", "البرغل", "النشويات", ["bulgur", "tabbouleh"], ["برغل", "bulgur"]),
  row(
    "couscous",
    "الكسكسي",
    "النشويات",
    ["couscous"],
    ["كسكسي", "كسكس", "couscous"],
  ),
  row("quinoa", "الكينوا والفريك", "النشويات", ["quinoa"], ["كينوا", "فريك", "quinoa", "freekeh"]),
  row("avocado", "الأفوكادو", "الفاكهة", ["avocado"], ["افوكادو", "avocado"]),
);
export function expandedKeys(p) {
  return [
    ...new Set([
      ...(p.excludedKeys || []),
      ...((p.excludedKeys || []).includes("tomato") ? ["tomatocooked"] : []),
      ...(p.excludedGroups || []).flatMap(
        (id) => EXCLUSIONS.find((g) => g.id === id)?.keys || [],
      ),
    ]),
  ];
}
export function excludedTaste(food, p, library) {
  const ids = new Set(p.excludedFoodIds || []),
    keys = new Set(expandedKeys(p));
  if (
    ids.has(food.id) ||
    Object.values(library.ingredients).some(
      (i) => i.food_id === food.id && keys.has(i.key),
    )
  )
    return ["مكوّن مستبعد من اختياراتك"];
  const names = [food.name, food.english, ...(food.names || [])].map(
    preferenceText,
  );
  return EXCLUSIONS.filter(
    (g) =>
      (p.excludedGroups || []).includes(g.id) &&
      !(
        ["fava", "legumes"].includes(g.id) &&
        names.some((n) => /فول سوداني|peanuts?/.test(n))
      ) &&
      g.aliases.some((a) =>
        names.some((n) =>
          (" " + n + " ").includes(" " + preferenceText(a) + " "),
        ),
      ),
  ).map((g) => g.label);
}
