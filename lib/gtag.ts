export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export const pageview = (url: string) => {
  if (!GA_ID) return;
  // @ts-ignore
  window.gtag("config", GA_ID, { page_path: url });
};

export const trackEvent = (name: string, params: Record<string, any> = {}) => {
  if (!GA_ID) return;
  // @ts-ignore
  window.gtag("event", name, params);
};
