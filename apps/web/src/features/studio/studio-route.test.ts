import { describe, expect, it } from "vitest";

import { resolveStudioPage, studioHref } from "./studio-route.js";

describe("studio route", () => {
  it.each([
    ["/studio", "dashboard"],
    ["/studio/", "dashboard"],
    ["/studio/persona", "persona"],
    ["/studio/voice/", "voice"],
    ["/studio/users/member-1", "users"],
    ["/studio/conversations/conversation-1", "conversations"],
    ["/studio/settings", "settings"],
  ] as const)("resolves %s to %s", (pathname, expected) => {
    expect(resolveStudioPage(pathname)).toBe(expected);
  });

  it("falls back to the dashboard for unknown studio paths", () => {
    expect(resolveStudioPage("/studio/unknown")).toBe("dashboard");
  });

  it("builds stable deep links for every studio page", () => {
    expect(studioHref("dashboard")).toBe("/studio");
    expect(studioHref("persona")).toBe("/studio/persona");
    expect(studioHref("voice")).toBe("/studio/voice");
    expect(studioHref("users")).toBe("/studio/users");
    expect(studioHref("conversations")).toBe("/studio/conversations");
    expect(studioHref("settings")).toBe("/studio/settings");
  });
});
