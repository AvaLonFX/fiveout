export async function trackInteraction(params: {
  itemType?: string;
  itemId: string | number;
  eventType: string;
  weight?: number;
}) {
  try {
    await fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // ignore
  }
}
