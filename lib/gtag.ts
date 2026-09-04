export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

function analytics() {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag || null;
}

export const pageview = (url: string) => {
  const gtag = analytics();
  if (!GA_ID || !gtag) return;
  gtag("config", GA_ID, { page_path: url });
};

export const trackEvent = (name: string, params: Record<string, any> = {}) => {
  const gtag = analytics();
  if (!GA_ID || !gtag) return;
  gtag("event", name, params);
};
