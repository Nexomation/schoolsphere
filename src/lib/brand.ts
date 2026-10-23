/**
 * Product branding. Override per deployment with NEXT_PUBLIC_APP_NAME /
 * NEXT_PUBLIC_APP_TAGLINE; individual schools can set their own display name
 * and accent colour in Settings → Branding.
 */
export const brand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "SchoolSphere",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || "One School. One Platform. Complete Visibility.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@schoolsphere.test",
};

/** Returns a CSS colour only if it is a valid hex that keeps white text readable (WCAG AA, 4.5:1). */
export function safeAccent(hex: string | undefined | null): string | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithWhite >= 4.5 ? hex : null;
}
