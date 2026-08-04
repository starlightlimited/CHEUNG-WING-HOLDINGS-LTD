/**
 * 已知全名／拼音混名 → Daisy 這類短英文名
 */
const FULL_NAME_TO_SHORT: { test: RegExp; short: string }[] = [
  { test: /TAI\s*CHUK\s*NI|戴祝妮/i, short: "Daisy" },
  { test: /WONG\s*OI\s*YEE|黃愛義/i, short: "Amy" },
  { test: /WONG\s*YUEN\s*YING|黃婉英/i, short: "Winnie" },
  { test: /WONG\s*OI\s*CHUN|黃爱真|黃愛真/i, short: "Joyce" },
];

/**
 * 用戶顯示名：優先映射為短英文名（Daisy / Joyce 等）；
 * 已是短英文名則原樣；其餘維持原名。
 */
export function displayUserName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";

  for (const rule of FULL_NAME_TO_SHORT) {
    if (rule.test.test(raw)) return rule.short;
  }

  // 已是純英文短名（如 Daisy / Admin / Joyce）
  if (/^[A-Za-z][A-Za-z0-9.'\-]*$/.test(raw)) {
    return raw;
  }

  return raw;
}
