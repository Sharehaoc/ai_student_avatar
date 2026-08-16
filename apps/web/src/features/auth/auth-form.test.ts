import { describe, expect, it } from "vitest";

import {
  authErrorMessage,
  changeAuthenticatedPassword,
  validateNewPassword,
} from "./auth-form.js";


describe("auth form", () => {
  it.each([
    ["Short1", "Short1", "密碼至少需要 8 個字元。"],
    ["lowercase123", "lowercase123", "密碼必須包含英文大寫、小寫與數字。"],
    ["UPPERCASE123", "UPPERCASE123", "密碼必須包含英文大寫、小寫與數字。"],
    ["NoNumberHere", "NoNumberHere", "密碼必須包含英文大寫、小寫與數字。"],
    ["ValidPass123", "Mismatch123", "兩次輸入的密碼不一致。"],
    ["ValidPass123", "ValidPass123", null],
  ])("validates course password policy", (password, confirmation, expected) => {
    expect(validateNewPassword(password, confirmation)).toBe(expected);
  });

  it.each([
    ["login", "invalid_credentials", "帳號或密碼不正確，請重新輸入。"],
    ["register", "user_already_exists", "這個電子信箱已經註冊，請直接登入。"],
    ["register", "email_exists", "這個電子信箱已經註冊，請直接登入。"],
    ["register", "over_request_rate_limit", "嘗試次數過多，請稍後再試。"],
    ["password", "same_password", "新密碼不能與目前密碼相同。"],
    ["password", "weak_password", "新密碼不符合安全規則，請重新設定。"],
  ] as const)("maps %s error %s to safe copy", (context, code, expected) => {
    expect(authErrorMessage({ code }, context)).toBe(expected);
  });

  it("does not expose unknown Supabase error details", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "secret server detail" }, "register"))
      .toBe("註冊沒有完成，請稍後再試。若問題持續發生，請聯絡管理者。");
  });

  it("verifies the current password before changing an authenticated password", async () => {
    const calls: string[] = [];
    const auth = {
      signInWithPassword: async () => {
        calls.push("verify");
        return { error: null };
      },
      updateUser: async () => {
        calls.push("update");
        return { error: null };
      },
    };

    expect(await changeAuthenticatedPassword(
      auth,
      "owner@example.com",
      "CurrentPass123",
      "NextPass456",
    )).toBeNull();
    expect(calls).toEqual(["verify", "update"]);
  });

  it("does not change the password when current-password verification fails", async () => {
    const verificationError = { code: "invalid_credentials" };
    let updated = false;
    const auth = {
      signInWithPassword: async () => ({ error: verificationError }),
      updateUser: async () => {
        updated = true;
        return { error: null };
      },
    };

    expect(await changeAuthenticatedPassword(
      auth,
      "owner@example.com",
      "WrongPass123",
      "NextPass456",
    )).toBe(verificationError);
    expect(updated).toBe(false);
  });
});
