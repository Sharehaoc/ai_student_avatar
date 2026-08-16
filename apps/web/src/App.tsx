import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";

import type { CreateConversationProvider } from "./features/conversation/create-conversation-provider.js";
import type { ConversationStatusProvider } from "./features/conversation/conversation-status-provider.js";
import { waitForConversationSaved } from "./features/conversation/wait-for-conversation-saved.js";
import type {
  AgentState,
  BrowserVoiceEvent,
} from "./features/voice/livekit-room-adapter.js";
import type {
  LiveKitVoiceSession,
  VoiceSessionStatus,
  VoiceTokenProvider,
} from "./features/voice/livekit-voice-session.js";
import {
  INITIAL_PIPELINE_STATUS,
  reducePipelineStatus,
  resolveConnectionStatus,
  resolveDominantSpeaker,
  shouldConfirmBeforeSignOut,
  shouldReportUnexpectedDisconnect,
  upsertTranscriptLine,
  voiceStatusLabel,
  type TranscriptLine,
  type SpeakingParticipant,
  type PipelineStatus,
} from "./features/voice/voice-ui-state.js";
import type { CourseSupabaseSession } from "./lib/supabase-session.js";
import type { StudentStudioApi } from "./features/studio/studio-api.js";
import {
  authErrorMessage,
  changeAuthenticatedPassword,
  validateNewPassword,
} from "./features/auth/auth-form.js";


interface AppProps {
  auth: CourseSupabaseSession;
  personaId: string;
  personaAvatarUrl: string;
  createConversation: CreateConversationProvider;
  getConversationStatus: ConversationStatusProvider;
  tokenProvider: VoiceTokenProvider;
  studioApi: StudentStudioApi;
}

const StudentStudio = lazy(async () => {
  const module = await import("./features/studio/StudentStudio.js");
  return { default: module.StudentStudio };
});

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message.includes("TENANT_QUOTA_EXHAUSTED")) return "這個 AI 分身的通話時數已用完。";
  if (message.includes("VOICE_POWER_OFF")) return "語音服務目前尚未開放。";
  if (message.includes("CONCURRENCY") || message.includes("RATE_LIMIT")) {
    return "目前通話人數較多，請稍後再試。";
  }
  if (message.includes("PERSONA_NOT_AVAILABLE")) return "這個 AI 分身尚未完成設定。";
  if (message.includes("麥克風") || message.toLowerCase().includes("permission")) {
    return "請允許瀏覽器使用麥克風，然後再試一次。";
  }
  return "連線沒有完成，請檢查網路後重試。";
}

function formatDuration(startedAt: number | null, now: number): string {
  const totalSeconds = startedAt ? Math.max(Math.floor((now - startedAt) / 1_000), 0) : 0;
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function sessionDisplayName(session: Session): string {
  const metadata = session.user.user_metadata as Record<string, unknown>;
  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-12.1 4.8M12 19v4M3 3l18 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9c5-4 13-4 18 0 1 1 1.5 2.5 0 4l-2.5 1c-1 .4-2-.2-2.4-1l-.6-1.4c-2.4-1-5.6-1-8 0L6.9 13c-.4.8-1.4 1.4-2.4 1L2 13c-1.5-1.5-1-3 1-4Z" />
    </svg>
  );
}

function CaptionsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 10h4M7 14h5M14 10h3M15 14h2" />
    </svg>
  );
}

function PersonaAvatar({ name, src }: { name: string; src: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!src || imageFailed) {
    return (
      <span
        className="coach-avatar-placeholder"
        role="img"
        aria-label={`${name} 尚未設定頭像`}
      >
        <span aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} 頭像`}
      onError={() => setImageFailed(true)}
    />
  );
}

export function App({
  auth,
  personaId,
  personaAvatarUrl,
  createConversation,
  getConversationStatus,
  tokenProvider,
  studioApi,
}: AppProps) {
  const studioRequested = window.location.pathname === "/studio"
    || window.location.pathname.startsWith("/studio/");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<VoiceSessionStatus>("IDLE");
  const [agentState, setAgentState] = useState<AgentState>("unknown");
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    ...INITIAL_PIPELINE_STATUS,
  });
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [captionOn, setCaptionOn] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState("你的 AI 分身");
  const [personaDescription, setPersonaDescription] = useState("開始一段專屬於你的語音對話。");
  const [currentPersonaAvatarUrl, setCurrentPersonaAvatarUrl] = useState(personaAvatarUrl);
  const [muted, setMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [hangupDialogOpen, setHangupDialogOpen] = useState(false);
  const [savingConversation, setSavingConversation] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [speakingParticipant, setSpeakingParticipant] = useState<SpeakingParticipant>(null);
  const [signOutAfterSave, setSignOutAfterSave] = useState(false);
  const [unexpectedDisconnect, setUnexpectedDisconnect] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const sessionRef = useRef<LiveKitVoiceSession | null>(null);
  const cancelHangupRef = useRef<HTMLButtonElement | null>(null);
  const hangupDialogRef = useRef<HTMLElement | null>(null);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const voiceOrbRef = useRef<HTMLDivElement | null>(null);
  const audioLevelsRef = useRef<Record<"AGENT" | "USER", number>>({ AGENT: 0, USER: 0 });
  const speakingParticipantRef = useRef<SpeakingParticipant>(null);

  const handleVoiceEvent = useCallback((event: BrowserVoiceEvent) => {
    setPipelineStatus((current) => reducePipelineStatus(current, event));
    if (event.type === "AGENT_STATE") setAgentState(event.state);
    if (event.type === "CONNECTION_STATE") {
      setCallStatus((current) => resolveConnectionStatus(current, event.state));
    }
    if (event.type === "TRANSCRIPT") {
      setTranscript((current) => upsertTranscriptLine(current, event));
    }
    if (event.type === "AUDIO_LEVEL") {
      audioLevelsRef.current[event.speaker] = event.level;
      const dominantSpeaker = resolveDominantSpeaker(audioLevelsRef.current);
      const peakLevel = Math.max(audioLevelsRef.current.AGENT, audioLevelsRef.current.USER);
      voiceOrbRef.current?.style.setProperty("--voice-level", peakLevel.toFixed(3));
      if (dominantSpeaker !== speakingParticipantRef.current) {
        speakingParticipantRef.current = dominantSpeaker;
        setSpeakingParticipant(dominantSpeaker);
      }
    }
    if (event.type === "PIPELINE_ERROR") {
      const label = event.stage === "STT" ? "語音辨識"
        : event.stage === "LLM" ? "AI 回覆" : "語音播放";
      setCallError(`${label}處理失敗，請結束通話後重新連線。`);
    }
    if (
      event.type === "DISCONNECTED"
      && sessionRef.current
      && shouldReportUnexpectedDisconnect(sessionRef.current.status)
    ) {
      setCallStatus("ERROR");
      setUnexpectedDisconnect(true);
      setCallError("語音連線已中斷，請結束通話並確認紀錄保存。");
    }
  }, []);

  const ensureVoiceSession = useCallback(async (): Promise<LiveKitVoiceSession> => {
    if (sessionRef.current) return sessionRef.current;
    const [{ BrowserLiveKitRoomAdapter }, { LiveKitVoiceSession }] = await Promise.all([
      import("./features/voice/livekit-room-adapter.js"),
      import("./features/voice/livekit-voice-session.js"),
    ]);
    const created = new LiveKitVoiceSession({
      room: new BrowserLiveKitRoomAdapter({ subscribe: handleVoiceEvent }),
      tokenProvider,
    });
    sessionRef.current = created;
    return created;
  }, [handleVoiceEvent, tokenProvider]);

  useEffect(() => {
    let active = true;
    void auth.client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError("無法讀取登入狀態，請重新整理頁面。");
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = auth.client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
      void sessionRef.current?.disconnect();
    };
  }, [auth.client.auth]);

  useEffect(() => {
    if (studioRequested) return undefined;
    let active = true;
    void studioApi.getPublicPersona(personaId).then((persona) => {
      if (!active) return;
      setPersonaName(persona.displayName);
      setPersonaDescription(persona.description);
      setCurrentPersonaAvatarUrl(persona.avatarUrl ?? "");
    }).catch(() => {
      // 尚未發布時保留安全的通用名稱與斜線頭像。
    });
    return () => { active = false; };
  }, [personaId, studioRequested, studioApi]);

  useEffect(() => {
    if (studioRequested || !session) return;
    void studioApi.recordVisitorActivity(personaId).catch(() => {
      // 登入與通話不應被活動紀錄失敗阻斷；後端仍會在建立對話時再次同步。
    });
  }, [personaId, session, studioApi, studioRequested]);

  useEffect(() => {
    if (!startedAt || !["LISTENING", "RECONNECTING"].includes(callStatus)) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [callStatus, startedAt]);

  useEffect(() => {
    if (!hangupDialogOpen) return undefined;
    if (savingConversation) hangupDialogRef.current?.focus();
    else cancelHangupRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingConversation) {
        closeHangupDialog();
      }
      if (event.key === "Tab") {
        if (savingConversation) {
          event.preventDefault();
          return;
        }
        const controls = [...(hangupDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hangupDialogOpen, saveError, savingConversation]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { error } = await auth.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) setAuthError(authErrorMessage(error, "login"));
    } catch {
      setAuthError("登入沒有完成，請檢查網路後再試一次。");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      setAuthError(validationError);
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await auth.client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthError(authErrorMessage(error, "register"));
      } else if (!data.session) {
        setAuthError("註冊已建立，但目前環境仍要求 Email 認證。請聯絡管理者關閉 Email 認證後再試。");
      } else {
        setAuthMode("login");
        setSession(data.session);
      }
    } catch {
      setAuthError("註冊沒有完成，請檢查網路後再試一次。");
    } finally {
      setAuthBusy(false);
    }
  }

  function switchAuthMode(nextMode: "login" | "register") {
    setAuthMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setAuthError(null);
  }

  async function handleStart() {
    setCallError(null);
    setSaveNotice(null);
    setUnexpectedDisconnect(false);
    setPipelineStatus({ ...INITIAL_PIPELINE_STATUS });
    setCallStatus("CONNECTING");
    try {
      const created = conversationId
        ? { conversationId, personaDisplayName: personaName, personaDescription }
        : await createConversation(personaId);
      setConversationId(created.conversationId);
      setPersonaName(created.personaDisplayName);
      setPersonaDescription(created.personaDescription);
      setTranscript([]);
      const voiceSession = await ensureVoiceSession();
      await voiceSession.start(created.conversationId);
      setMuted(false);
      setStartedAt(Date.now());
      setClock(Date.now());
      setCallStatus("LISTENING");
    } catch (error) {
      setCallStatus("ERROR");
      setCallError(readableError(error));
    }
  }

  function openHangupDialog(shouldSignOut = false) {
    dialogOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSaveError(null);
    setSignOutAfterSave(shouldSignOut);
    setHangupDialogOpen(true);
  }

  function resetAudioActivity() {
    audioLevelsRef.current = { AGENT: 0, USER: 0 };
    speakingParticipantRef.current = null;
    setSpeakingParticipant(null);
    voiceOrbRef.current?.style.setProperty("--voice-level", "0");
  }

  function closeHangupDialog() {
    if (savingConversation) return;
    if (saveError) {
      setCallStatus("IDLE");
      setAgentState("unknown");
      setPipelineStatus({ ...INITIAL_PIPELINE_STATUS });
      resetAudioActivity();
      setMuted(false);
      setStartedAt(null);
      setConversationId(null);
      setCaptionOn(false);
      setUnexpectedDisconnect(false);
      setSaveNotice("通話已結束，但尚未確認紀錄保存完成。請稍後確認對話紀錄。");
    }
    setHangupDialogOpen(false);
    setSaveError(null);
    setSignOutAfterSave(false);
    const opener = dialogOpenerRef.current;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  async function handleConfirmedHangup() {
    if (!conversationId) return;
    setSavingConversation(true);
    setSaveError(null);
    setCallError(null);
    setCallStatus("DISCONNECTING");
    try {
      if (sessionRef.current?.status !== "IDLE") {
        await sessionRef.current?.disconnect();
      }
      const finalStatus = await waitForConversationSaved(
        conversationId,
        getConversationStatus,
      );
      const shouldSignOut = signOutAfterSave;
      setCallStatus("IDLE");
      setAgentState("unknown");
      setPipelineStatus({ ...INITIAL_PIPELINE_STATUS });
      resetAudioActivity();
      setMuted(false);
      setStartedAt(null);
      setConversationId(null);
      setCaptionOn(false);
      setUnexpectedDisconnect(false);
      setHangupDialogOpen(false);
      setSignOutAfterSave(false);
      setSaveNotice(finalStatus.status === "ENDED"
        ? "通話已結束，對話紀錄已保存。"
        : "通話已結束，但系統回報紀錄處理異常，請確認對話紀錄。");
      if (shouldSignOut) await auth.client.auth.signOut();
    } catch {
      setSaveError("通話已中斷，但尚未確認紀錄保存完成。請稍後再次確認。");
    } finally {
      setSavingConversation(false);
    }
  }

  async function handleMute() {
    const nextMuted = !muted;
    try {
      await sessionRef.current?.setMuted(nextMuted);
      setMuted(nextMuted);
    } catch {
      setCallError("麥克風狀態無法更新，請稍後再試。");
    }
  }

  async function handleSignOut() {
    if (shouldConfirmBeforeSignOut(conversationId, sessionRef.current?.status)) {
      openHangupDialog(true);
      return;
    }
    await auth.client.auth.signOut();
  }

  if (!authReady) {
    return <main className="shell shell-centered"><p aria-live="polite">正在確認登入狀態…</p></main>;
  }

  if (!session) {
    const visitorRegistering = !studioRequested && authMode === "register";
    return (
      <main className="shell shell-centered">
        <section
          className="login-panel"
          aria-labelledby={studioRequested ? "studio-login-title" : "login-title"}
        >
          <p className="product-mark" id={studioRequested ? "studio-login-title" : undefined}>
            {studioRequested ? "學員 AI 分身 - 管理後台" : "學員 AI 分身"}
          </p>
          {studioRequested ? (
            <div className="studio-login-avatar">
              <PersonaAvatar name={personaName} src={currentPersonaAvatarUrl} />
            </div>
          ) : (
            <>
              <h1 id="login-title">{visitorRegistering ? "建立訪客帳號" : "登入後開始對話"}</h1>
              <p className="supporting-copy">
                {visitorRegistering
                  ? "填寫三個欄位即可完成，註冊後會直接登入，不需要 Email 認證。"
                  : "你的通話與逐字稿只會保存在專屬帳號內。"}
              </p>
              <div className="auth-mode-switch" aria-label="登入或註冊">
                <button
                  type="button"
                  className={authMode === "login" ? "is-active" : ""}
                  aria-pressed={authMode === "login"}
                  onClick={() => switchAuthMode("login")}
                >
                  登入
                </button>
                <button
                  type="button"
                  className={authMode === "register" ? "is-active" : ""}
                  aria-pressed={authMode === "register"}
                  onClick={() => switchAuthMode("register")}
                >
                  註冊
                </button>
              </div>
            </>
          )}
          <form onSubmit={(event) => void (visitorRegistering
            ? handleRegister(event)
            : handleLogin(event))}>
            <label htmlFor="email">電子信箱</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="password">密碼</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={visitorRegistering ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="text-button"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "隱藏" : "顯示"}
              </button>
            </div>
            {visitorRegistering ? (
              <>
                <label htmlFor="confirm-password">確認密碼</label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
                <p className="password-requirements">至少 8 個字元，包含英文大寫、小寫與數字。</p>
              </>
            ) : null}
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="primary-button" type="submit" disabled={authBusy}>
              {authBusy
                ? visitorRegistering ? "正在建立帳號…" : "正在登入…"
                : visitorRegistering ? "建立帳號並登入" : "登入"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (studioRequested) {
    return (
      <Suspense fallback={(
        <main className="shell shell-centered" aria-busy="true">
          <p className="supporting-copy">正在載入管理後臺…</p>
        </main>
      )}>
        <StudentStudio
          ownerName={sessionDisplayName(session)}
          ownerEmail={session.user.email ?? ""}
          personaAvatarUrl={currentPersonaAvatarUrl}
          api={studioApi}
          onChangePassword={async (currentPassword, nextPassword) => {
            const error = await changeAuthenticatedPassword(
              auth.client.auth,
              session.user.email ?? "",
              currentPassword,
              nextPassword,
            );
            return error ? authErrorMessage(error, "password") : null;
          }}
          onSignOut={() => auth.client.auth.signOut().then(() => undefined)}
        />
      </Suspense>
    );
  }

  const inCall = callStatus === "LISTENING" || callStatus === "RECONNECTING";
  const connecting = callStatus === "CONNECTING" || callStatus === "DISCONNECTING";
  const statusText = voiceStatusLabel(callStatus, agentState, speakingParticipant);
  const pipelineStatusLabel = (state: PipelineStatus[keyof PipelineStatus]) => ({
    idle: "等待",
    active: "處理中",
    success: "完成",
    error: "失敗",
  })[state];

  const durationText = formatDuration(startedAt, clock);
  const particleStyles = Array.from({ length: 92 }, (_, index) => ({
    "--particle-x": `${12 + ((index * 37) % 76)}%`,
    "--particle-y": `${10 + ((index * 53) % 78)}%`,
    "--particle-size": `${1.5 + (index % 4) * 0.7}px`,
    "--particle-delay": `${(index % 11) * 0.18}s`,
    "--particle-duration": `${3.6 + (index % 6) * 0.45}s`,
  })) as CSSProperties[];

  return (
    <main className="coach-call-shell">
      <div className="coach-call-content" inert={hangupDialogOpen} aria-hidden={hangupDialogOpen}>
        <header className="coach-call-topbar">
          <div className="coach-persona-pill">
            <span aria-hidden="true" />
            {personaName}
          </div>
          <div className="coach-call-meta">
            {inCall && <span className="coach-live-dot" aria-hidden="true" />}
            <span className="coach-timer" aria-label={`通話時間 ${durationText}`}>
              {durationText}
            </span>
            {!inCall && (
              <button className="coach-signout-button" type="button" onClick={() => void handleSignOut()}>
                登出
              </button>
            )}
          </div>
        </header>

        <section className="coach-call-main" aria-labelledby="persona-name">
          <h1 className="visually-hidden" id="persona-name">{personaName}</h1>
          <div
            ref={voiceOrbRef}
            className={`coach-voice-visual ${inCall ? "is-active" : ""}`}
            data-speaker={speakingParticipant ?? "NONE"}
          >
            <div className="coach-orb-stage">
              <div className="coach-particle-field" aria-hidden="true">
                {particleStyles.map((style, index) => <span key={index} style={style} />)}
              </div>
              <div className="coach-orb-glow" aria-hidden="true" />
              <div className="coach-avatar-frame">
                <PersonaAvatar name={personaName} src={currentPersonaAvatarUrl} />
                <span className="coach-avatar-status" aria-hidden="true" />
              </div>
            </div>

            <div className="coach-connection-status" aria-live="polite">
              <p className="coach-semantic-status">
                <span aria-hidden="true" />
                {statusText}
              </p>
              {connecting && (
                <div className="coach-dialing-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
              )}
              {(inCall || connecting || callStatus === "ERROR") && (
                <div className="coach-pipeline-status" aria-label="語音處理狀態">
                  {(["STT", "AI", "TTS"] as const).map((stage) => (
                    <span className="coach-pipeline-item" data-status={pipelineStatus[stage]} key={stage}>
                      <i aria-hidden="true" />
                      <strong>{stage}</strong>
                      <small>{pipelineStatusLabel(pipelineStatus[stage])}</small>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="coach-energy-ribbon" aria-hidden="true">
              <span />
            </div>
          </div>

          {!inCall && !connecting && (
            <div className="coach-persona-copy">
              <h2>{personaName}</h2>
              <p>{personaDescription}</p>
            </div>
          )}

          {callError && <p className="coach-call-error" role="alert">{callError}</p>}
          {saveNotice && <p className="coach-save-notice" role="status">{saveNotice}</p>}

          {!inCall && (
            <button
              className="coach-start-button"
              type="button"
              disabled={connecting}
              onClick={() => unexpectedDisconnect
                ? openHangupDialog()
                : void handleStart()}
            >
              {connecting
                ? "正在接通"
                : unexpectedDisconnect
                  ? "結束並確認紀錄"
                  : callStatus === "ERROR"
                    ? "重新連線"
                    : "開始語音對話"}
            </button>
          )}

          {captionOn && (
            <aside className="coach-subtitle-panel" aria-labelledby="transcript-title">
              <div className="coach-subtitle-head">
                <div>
                  <p>即時字幕</p>
                  <h2 id="transcript-title">這次對話</h2>
                </div>
                <button type="button" onClick={() => setCaptionOn(false)} aria-label="收起字幕視窗">
                  <span aria-hidden="true" />
                </button>
              </div>
              <div className="coach-subtitle-list" aria-live="polite" aria-relevant="additions text">
                {transcript.length === 0 ? (
                  <p className="coach-subtitle-empty">對話開始後，字幕會顯示在這裡。</p>
                ) : transcript.map((line) => (
                  <article
                    className={`coach-subtitle-item subtitle-${line.speaker.toLowerCase()}`}
                    key={line.segmentId}
                  >
                    <p className="coach-subtitle-speaker">
                      {line.speaker === "AGENT" ? personaName : "你"}
                    </p>
                    <p className={line.final ? "" : "partial-transcript"}>{line.text}</p>
                  </article>
                ))}
              </div>
            </aside>
          )}
        </section>

        {inCall && (
          <div className="coach-call-controls" aria-label="通話控制">
            <button
              className={`coach-control-button ${muted ? "is-selected" : ""}`}
              type="button"
              aria-label={muted ? "開啟麥克風" : "靜音"}
              aria-pressed={muted}
              title={muted ? "開啟麥克風" : "靜音"}
              onClick={() => void handleMute()}
            >
              <MicrophoneIcon muted={muted} />
            </button>
            <button
              className="coach-hangup-button"
              type="button"
              aria-label="結束通話"
              title="結束通話"
              onClick={() => openHangupDialog()}
            >
              <HangupIcon />
            </button>
            <button
              className={`coach-control-button ${captionOn ? "is-selected" : ""}`}
              type="button"
              aria-label={captionOn ? "隱藏字幕" : "顯示字幕"}
              aria-pressed={captionOn}
              title={captionOn ? "隱藏字幕" : "顯示字幕"}
              onClick={() => setCaptionOn((visible) => !visible)}
            >
              <CaptionsIcon />
            </button>
          </div>
        )}
      </div>

      {hangupDialogOpen && (
        <div className="dialog-backdrop">
          <section
            ref={hangupDialogRef}
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hangup-dialog-title"
            aria-describedby="hangup-dialog-description"
            aria-busy={savingConversation}
            tabIndex={-1}
          >
            <div className="confirmation-glow glow-a" aria-hidden="true" />
            <div className="confirmation-glow glow-b" aria-hidden="true" />
            <div className="confirmation-content">
              <p className="confirmation-eyebrow"><span aria-hidden="true" />安全結束通話</p>
              <h2 id="hangup-dialog-title">
                {savingConversation ? "正在保存這次對話" : "確定要結束通話嗎？"}
              </h2>
              <p id="hangup-dialog-description" className="dialog-description">
                {savingConversation
                  ? "請稍候，確認對話紀錄已保存後才會完成。"
                  : "結束後會先確認本次對話紀錄已保存，再離開通話。"}
              </p>
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <div className="dialog-actions">
                <button
                  ref={cancelHangupRef}
                  className="confirmation-cancel"
                  type="button"
                  disabled={savingConversation}
                  onClick={closeHangupDialog}
                >
                  {saveError ? "關閉提示" : "繼續通話"}
                </button>
                <button
                  className="confirmation-end"
                  type="button"
                  disabled={savingConversation}
                  onClick={() => void handleConfirmedHangup()}
                >
                  {savingConversation
                    ? "正在保存…"
                    : saveError
                      ? "再次確認保存狀態"
                      : signOutAfterSave
                        ? "結束、保存並登出"
                        : "結束並保存"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
