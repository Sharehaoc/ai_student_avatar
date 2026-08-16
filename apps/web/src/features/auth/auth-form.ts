export type AuthFormContext = "login" | "register" | "password";

interface AuthErrorLike {
  code?: string | undefined;
  message?: string | undefined;
}

interface PasswordAuthPort {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: AuthErrorLike | null }>;
  updateUser(attributes: { password: string }): Promise<{ error: AuthErrorLike | null }>;
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "密碼至少需要 8 個字元。";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "密碼必須包含英文大寫、小寫與數字。";
  }
  if (password !== confirmation) return "兩次輸入的密碼不一致。";
  return null;
}

export function authErrorMessage(error: AuthErrorLike, context: AuthFormContext): string {
  const code = error.code ?? "";
  if (code === "over_request_rate_limit") return "嘗試次數過多，請稍後再試。";
  if (context === "login") return "帳號或密碼不正確，請重新輸入。";
  if (context === "register") {
    if (code === "user_already_exists" || code === "email_exists") {
      return "這個電子信箱已經註冊，請直接登入。";
    }
    if (code === "weak_password") return "密碼不符合安全規則，請重新設定。";
    if (code === "email_address_invalid" || code === "validation_failed") {
      return "電子信箱格式不正確，請重新輸入。";
    }
    return "註冊沒有完成，請稍後再試。若問題持續發生，請聯絡管理者。";
  }
  if (code === "same_password") return "新密碼不能與目前密碼相同。";
  if (code === "weak_password") return "新密碼不符合安全規則，請重新設定。";
  if (code === "invalid_credentials") return "目前密碼不正確，請重新輸入。";
  return "密碼變更沒有完成，請稍後再試。";
}

export async function changeAuthenticatedPassword(
  auth: PasswordAuthPort,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthErrorLike | null> {
  const verified = await auth.signInWithPassword({ email, password: currentPassword });
  if (verified.error) return verified.error;
  const updated = await auth.updateUser({ password: newPassword });
  return updated.error;
}
