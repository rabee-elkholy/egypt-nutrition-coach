import { normalize, searchScore } from "./core.mjs";

// Presentation groups only. Original category labels, IDs and food records stay intact.
const GROUPS = {
  "أرز ومكرونة": "أرز ومكرونة",
  "الأرز والمكرونة والفتة": "أرز ومكرونة",
  أسماك: "أسماك",
  الأسماك: "أسماك",
  "أكلات إقليمية": "أكلات إقليمية",
  "حلويات إقليمية": "حلويات",
  "أكلات مطاعم": "أكلات مطاعم",
  "أكلات منزلية": "أكل بيتي وخضار",
  "خضار وأكلات بيتية": "أكل بيتي وخضار",
  "الأكل البيتي والخضار": "أكل بيتي وخضار",
  "الألبان والأجبان": "ألبان وأجبان",
  الحلويات: "حلويات",
  حلويات: "حلويات",
  "السلطات والمقبلات": "سلطات ومقبلات",
  "سلطات ومقبلات": "سلطات ومقبلات",
  "العيش والمخبوزات": "عيش ومخبوزات",
  "عيش ومخبوزات": "عيش ومخبوزات",
  "الفطار والبقول": "فطار وبقول",
  "فطار وبقول": "فطار وبقول",
  "اللحوم والأحشاء وأكل الشارع": "لحوم وساندوتشات",
  "لحوم وساندوتشات": "لحوم وساندوتشات",
  المحاشي: "محاشي",
  محاشي: "محاشي",
  مشروبات: "مشروبات",
  "مشروبات شعبية وعصائر": "مشروبات",
};
export const groupLabel = (label) => GROUPS[label] || label;
export function catalogMatches(
  catalog,
  foods,
  { query = "", group = "", quality = "" } = {},
) {
  const lookup = new Map(foods.map((f) => [f.id, f]));
  const found = [];
  for (const entry of catalog) {
    if (group && groupLabel(entry.group_label) !== group) continue;
    let profiles = [
      ...new Set([...entry.linked_food_ids, ...(entry.estimate_ids || [])]),
    ]
      .map((id) => lookup.get(id))
      .filter(Boolean);
    profiles = profiles.filter(
      (f) =>
        !quality ||
        (quality === "approved"
          ? f.status === "approved"
          : quality === "reference_proxy"
            ? f.estimate_type === "reference_proxy"
            : f.status === "estimated" &&
              f.estimate_type !== "reference_proxy"),
    );
    if (!profiles.length) continue;
    const identityScore = searchScore(
      {
        searchNames: [entry.name_ar, entry.name_en || "", ...entry.aliases].map(
          normalize,
        ),
      },
      query,
    );
    const scored = profiles.map((f) => [
      f,
      searchScore(
        { searchNames: f.searchNames || f.names.map(normalize) },
        query,
      ),
    ]);
    const score = Math.max(identityScore, ...scored.map((x) => x[1]));
    if (!score) continue;
    if (!identityScore)
      profiles = scored.filter((x) => x[1] > 0).map((x) => x[0]);
    profiles.sort(
      (a, b) =>
        (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1) ||
        a.name.localeCompare(b.name, "ar") ||
        a.id.localeCompare(b.id),
    );
    found.push({
      ...entry,
      display_group: groupLabel(entry.group_label),
      profiles,
      score,
    });
  }
  return found.sort(
    (a, b) =>
      b.score - a.score ||
      a.name_ar.localeCompare(b.name_ar, "ar") ||
      a.id.localeCompare(b.id),
  );
}
export function qualityLabel(food) {
  if (food.estimate_type === "reference_proxy")
    return { label: "بديل مرجعي · تقريب مرتفع", className: "proxy" };
  if (food.status === "estimated")
    return { label: "وصفة تقريبية", className: "estimate" };
  return { label: "مرجع غذائي", className: "reference" };
}
