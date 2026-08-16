export type StudioPage = "dashboard" | "persona" | "voice" | "users" | "conversations" | "settings";

const PAGE_HREFS: Record<StudioPage, string> = {
  dashboard: "/studio",
  persona: "/studio/persona",
  voice: "/studio/voice",
  users: "/studio/users",
  conversations: "/studio/conversations",
  settings: "/studio/settings",
};

const ROUTE_SEGMENTS: Array<[segment: string, page: StudioPage]> = [
  ["persona", "persona"],
  ["voice", "voice"],
  ["users", "users"],
  ["conversations", "conversations"],
  ["settings", "settings"],
];

export function resolveStudioPage(pathname: string): StudioPage {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments[0] !== "studio") return "dashboard";
  return ROUTE_SEGMENTS.find(([segment]) => segments[1] === segment)?.[1] ?? "dashboard";
}

export function studioHref(page: StudioPage): string {
  return PAGE_HREFS[page];
}
