import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { ChatsCircleIcon } from "@phosphor-icons/react/ChatsCircle";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { GearIcon } from "@phosphor-icons/react/Gear";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
import { SignOutIcon } from "@phosphor-icons/react/SignOut";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { SquaresFourIcon } from "@phosphor-icons/react/SquaresFour";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { UserCircleGearIcon } from "@phosphor-icons/react/UserCircleGear";
import { UsersThreeIcon } from "@phosphor-icons/react/UsersThree";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { WaveformIcon } from "@phosphor-icons/react/Waveform";
import type { OwnerStudioPersona } from "@flying-eagle/contracts";

import {
  PERSONA_DRAFT,
  formatDuration,
  formatStudioDate,
  maskEmail,
  type ConversationStatus,
  type PersonaDraft,
  type StudioMessage,
  type StudioConversation,
  type StudioVisitor,
} from "./studio-data.js";
import type { StudentStudioApi } from "./studio-api.js";
import { resolveStudioPage, studioHref, type StudioPage } from "./studio-route.js";
import { validateNewPassword } from "../auth/auth-form.js";
import "./studio.css";

type StudioIcon = ComponentType<{ size?: number | string; weight?: "regular" | "bold" | "duotone" }>;

interface StudentStudioProps {
  ownerName: string;
  ownerEmail: string;
  personaAvatarUrl: string;
  api: StudentStudioApi;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  onSignOut: () => Promise<void>;
}

interface StudioPageMeta {
  title: string;
  description: string;
}

const NAV_ITEMS: Array<{ page: StudioPage; label: string; icon: StudioIcon }> = [
  { page: "dashboard", label: "總覽", icon: SquaresFourIcon },
  { page: "persona", label: "我的 AI 分身", icon: UserCircleGearIcon },
  { page: "voice", label: "聲音試聽", icon: WaveformIcon },
  { page: "users", label: "訪客使用者", icon: UsersThreeIcon },
  { page: "conversations", label: "對話紀錄", icon: ChatsCircleIcon },
  { page: "settings", label: "設定", icon: GearIcon },
];

const PAGE_META: Record<StudioPage, StudioPageMeta> = {
  dashboard: { title: "總覽", description: "查看分身狀態與最近的使用情形" },
  persona: { title: "我的 AI 分身", description: "編輯人格提示詞、開場白與發布版本" },
  voice: { title: "聲音試聽", description: "使用目前分身聲音確認播放效果" },
  users: { title: "訪客使用者", description: "查看曾登入你的 AI 分身前臺的帳號" },
  conversations: { title: "對話紀錄", description: "依訪客、日期與狀態查詢完整逐字稿" },
  settings: { title: "設定", description: "管理登入帳號與密碼安全" },
};

function ownerDisplayName(ownerName: string, ownerEmail: string): string {
  const cleanName = ownerName.trim();
  if (cleanName) return cleanName;
  return ownerEmail.split("@")[0] || "分身管理者";
}

function personaToDraft(persona: OwnerStudioPersona): PersonaDraft {
  return {
    displayName: persona.displayName,
    description: persona.description,
    systemPrompt: persona.systemPrompt,
    openingMessage: persona.openingMessage,
  };
}

function PersonaPlaceholder({ name, src, compact = false }: { name: string; src: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const label = `${name} 尚未設定頭像`;

  if (!src || failed) {
    return (
      <span className={`studio-avatar-placeholder ${compact ? "is-compact" : ""}`} role="img" aria-label={label}>
        <span aria-hidden="true" />
      </span>
    );
  }

  return <img className="studio-avatar-image" src={src} alt={`${name} 頭像`} onError={() => setFailed(true)} />;
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  const meta = {
    PENDING: { label: "等待中", className: "is-active" },
    CONNECTING: { label: "連線中", className: "is-active" },
    ENDED: { label: "已完成", className: "is-success" },
    ACTIVE: { label: "進行中", className: "is-active" },
    FAILED: { label: "未接通", className: "is-danger" },
  }[status];

  return <span className={`studio-status ${meta.className}`}>{meta.label}</span>;
}

function PanelHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="studio-panel-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="studio-panel-action">{action}</div> : null}
    </header>
  );
}

function DashboardPage({
  draft,
  visitors,
  conversations,
  activeVersion,
  published,
  avatarUrl,
  navigate,
}: {
  draft: PersonaDraft;
  visitors: StudioVisitor[];
  conversations: StudioConversation[];
  activeVersion: number | null;
  published: boolean;
  avatarUrl: string;
  navigate: (page: StudioPage) => void;
}) {
  const effectiveConversations = conversations.filter((conversation) => conversation.durationSeconds > 0);
  const totalMinutes = Math.round(effectiveConversations.reduce(
    (total, conversation) => total + conversation.durationSeconds,
    0,
  ) / 60);
  const recent = conversations.slice(0, 4);

  return (
    <div className="studio-page-stack">
      <section className="studio-publish-summary studio-panel">
        <div className="studio-publish-copy">
          <span className={`studio-status ${published ? "is-success" : "is-active"}`}><CheckCircleIcon size={15} weight="bold" />{published ? "已發布" : "尚未發布"}</span>
          <h2>{draft.displayName}</h2>
          <p>{activeVersion ? `目前公開版本為 v${activeVersion}。` : "目前還沒有公開版本。"}新的 Prompt 會先儲存成草稿，發布後才會影響下一次對話。</p>
        </div>
        <div className="studio-publish-actions">
          <button className="studio-button secondary" type="button" onClick={() => navigate("persona")}>
            編輯人格
          </button>
          <a className="studio-button primary" href="/">
            開啟對話頁<ArrowSquareOutIcon size={17} />
          </a>
        </div>
      </section>

      <section className="studio-metric-strip" aria-label="本月使用概況">
        <article>
          <span>訪客使用者</span>
          <strong>{visitors.length}</strong>
          <small>曾登入前臺的帳號</small>
        </article>
        <article>
          <span>有效對話</span>
          <strong>{effectiveConversations.length}</strong>
          <small>通話時間大於 0 秒</small>
        </article>
        <article>
          <span>總對話分鐘</span>
          <strong>{totalMinutes}</strong>
          <small>依保存資料加總</small>
        </article>
        <article>
          <span>目前版本</span>
          <strong>{activeVersion ? `v${activeVersion}` : "—"}</strong>
          <small>{published ? "目前公開版本" : "尚未發布"}</small>
        </article>
      </section>

      <div className="studio-dashboard-grid">
        <section className="studio-panel studio-recent-panel">
          <PanelHeader
            title="最近對話"
            description="只顯示你的 AI 分身收到的對話"
            action={(
              <button className="studio-text-button" type="button" onClick={() => navigate("conversations")}>
                查看全部<CaretRightIcon size={15} />
              </button>
            )}
          />
          <div className="studio-activity-list">
            {recent.map((conversation) => {
              const visitor = visitors.find((item) => item.id === conversation.visitorId);
              return (
                <button
                  className="studio-activity-row"
                  type="button"
                  key={conversation.id}
                  onClick={() => navigate("conversations")}
                >
                  <span className="studio-activity-icon"><ChatsCircleIcon size={18} /></span>
                  <span className="studio-activity-copy">
                    <strong>{conversation.title}</strong>
                    <small>{visitor?.name ?? "未知訪客"}，{formatStudioDate(conversation.startedAt)}</small>
                  </span>
                  <span className="studio-activity-meta">
                    <StatusBadge status={conversation.status} />
                    <small>{formatDuration(conversation.durationSeconds)}</small>
                  </span>
                  <CaretRightIcon className="studio-row-caret" size={16} />
                </button>
              );
            })}
          </div>
          {recent.length === 0 ? <div className="studio-empty-state"><ChatsCircleIcon size={24} /><strong>目前還沒有對話</strong><p>訪客完成第一通對話後會顯示在這裡。</p></div> : null}
        </section>

        <aside className="studio-panel studio-readiness-panel">
          <PanelHeader title="發布前檢查" description="確認必要的人格與聲音設定" />
          <div className="studio-readiness-list">
            <div className="is-done"><CheckCircleIcon size={18} weight="fill" /><span>人格提示詞</span><strong>已完成</strong></div>
            <div className="is-done"><CheckCircleIcon size={18} weight="fill" /><span>開場白</span><strong>已完成</strong></div>
            <div className="is-done"><CheckCircleIcon size={18} weight="fill" /><span>聲音設定</span><strong>已完成</strong></div>
            <div className={avatarUrl ? "is-done" : ""}>{avatarUrl ? <CheckCircleIcon size={18} weight="fill" /> : <WarningCircleIcon size={18} />}<span>分身頭像</span><strong>{avatarUrl ? "已完成" : "待設定"}</strong></div>
          </div>
          <button className="studio-button secondary full" type="button" onClick={() => navigate("persona")}>
            完成分身設定
          </button>
        </aside>
      </div>
    </div>
  );
}

function PersonaPage({
  draft,
  avatarUrl,
  onChange,
  onSave,
  onPublish,
  onAvatarUpload,
}: {
  draft: PersonaDraft;
  avatarUrl: string;
  onChange: (patch: Partial<PersonaDraft>) => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onAvatarUpload: (file: File) => Promise<void>;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave();
  }

  return (
    <div className="studio-page-stack">
      <form className="studio-panel studio-editor-form" onSubmit={handleSubmit}>
        <PanelHeader title="身份與說明" description="這些內容會顯示在公開對話頁" />
        <div className="studio-avatar-editor">
          <PersonaPlaceholder name={draft.displayName} src={avatarUrl} />
          <div>
            <button className="studio-button secondary" type="button" onClick={() => avatarInputRef.current?.click()}>
              <UploadSimpleIcon size={17} />更換頭像
            </button>
            <input
              ref={avatarInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onAvatarUpload(file);
                event.target.value = "";
              }}
            />
            <p>建議使用正方形 JPG、PNG 或 WebP，最大 5 MB。</p>
          </div>
        </div>
        <div className="studio-form-grid two-columns">
          <label className="studio-field">
            <span>分身名稱</span>
            <input
              value={draft.displayName}
              maxLength={80}
              onChange={(event) => onChange({ displayName: event.target.value })}
            />
            <small>{draft.displayName.length} / 80</small>
          </label>
          <label className="studio-field">
            <span>公開介紹</span>
            <input
              value={draft.description}
              maxLength={1000}
              onChange={(event) => onChange({ description: event.target.value })}
            />
            <small>用一句話說明這個分身可以提供什麼協助。</small>
          </label>
        </div>

        <div className="studio-form-divider" />
        <PanelHeader
          title="人格提示詞"
          description="這是 AI 分身判斷語氣、角色與回應方式的主要依據"
          action={<span className="studio-field-count">{draft.systemPrompt.length.toLocaleString("zh-TW")} / 30,000</span>}
        />
        <label className="studio-field">
          <span className="visually-hidden">人格提示詞內容</span>
          <textarea
            className="studio-prompt-input"
            value={draft.systemPrompt}
            maxLength={30_000}
            spellCheck={false}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
          />
          <small>請寫清楚角色、回應原則、不能做的事，以及不確定時應該怎麼處理。</small>
        </label>

        <div className="studio-form-divider" />
        <PanelHeader title="對話開場白" description="每次新對話開始時，AI 分身會先說這句話" />
        <label className="studio-field">
          <span className="visually-hidden">對話開場白內容</span>
          <textarea
            rows={3}
            value={draft.openingMessage}
            maxLength={1000}
            onChange={(event) => onChange({ openingMessage: event.target.value })}
          />
          <small>{draft.openingMessage.length} / 1,000</small>
        </label>

        <div className="studio-form-actions">
          <button className="studio-button secondary" type="button" onClick={() => void onPublish()}>發布新版本</button>
          <button className="studio-button primary" type="submit"><FloppyDiskIcon size={17} />儲存草稿</button>
        </div>
      </form>

    </div>
  );
}

function VoicePage({
  previewVoice,
  notify,
}: {
  previewVoice: (text: string) => Promise<Blob>;
  notify: (message: string) => void;
}) {
  const [previewText, setPreviewText] = useState("我們先把問題拆小，找到今天最值得處理的一步。");
  const [previewing, setPreviewing] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function playPreview() {
    const text = previewText.trim();
    if (!text) {
      notify("請先輸入試聽文字。");
      return;
    }
    setPreviewing(true);
    try {
      const audio = await previewVoice(text);
      const nextUrl = URL.createObjectURL(audio);
      setAudioUrl(nextUrl);
      window.requestAnimationFrame(() => {
        void audioRef.current?.play().catch(() => {
          notify("瀏覽器封鎖了自動播放，請按下音訊播放鍵。");
        });
      });
    } catch (error) {
      notify(error instanceof Error && error.message === "VOICE_PREVIEW_RATE_LIMIT"
        ? "試聽次數過於頻繁，請一分鐘後再試。"
        : "聲音試聽失敗，請確認 Voice Agent 與 MiniMax 設定。");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="studio-page-stack">
        <section className="studio-panel studio-voice-preview studio-voice-preview-only">
          <PanelHeader title="聲音試聽" description="先確認句子，再用目前 Voice ID 播放" />
          <label className="studio-field">
            <span>試聽文字</span>
            <textarea rows={6} maxLength={500} value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
            <small>{previewText.length} / 500</small>
          </label>
          <div className="studio-audio-placeholder" aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => <span key={index} style={{ height: `${20 + ((index * 13) % 48)}%` }} />)}
          </div>
          <button
            className="studio-button primary full"
            type="button"
            disabled={previewing}
            onClick={() => void playPreview()}
          >
            <PlayIcon size={17} weight="fill" />{previewing ? "正在產生試聽" : "播放試聽"}
          </button>
          {audioUrl ? <audio ref={audioRef} className="studio-audio-player" src={audioUrl} controls preload="none" /> : null}
          <p className="studio-inline-note"><ShieldCheckIcon size={17} />試聽文字不會被保存成正式對話。</p>
        </section>
    </div>
  );
}

function UsersPage({
  navigate,
  allVisitors,
  allConversations,
}: {
  navigate: (page: StudioPage) => void;
  allVisitors: StudioVisitor[];
  allConversations: StudioConversation[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(allVisitors[0]?.id ?? "");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  const visitors = allVisitors.filter((visitor) => (
    !normalizedQuery
    || visitor.name.toLocaleLowerCase("zh-TW").includes(normalizedQuery)
    || visitor.email.toLocaleLowerCase("zh-TW").includes(normalizedQuery)
  ));
  const selected = allVisitors.find((visitor) => visitor.id === selectedId) ?? visitors[0] ?? null;
  const selectedConversations = selected
    ? allConversations.filter((conversation) => conversation.visitorId === selected.id)
    : [];
  const totalSeconds = selectedConversations.reduce((total, conversation) => total + conversation.durationSeconds, 0);

  return (
    <div className="studio-users-layout">
      <section className="studio-panel studio-users-list-panel">
        <div className="studio-list-toolbar">
          <label className="studio-search-field">
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            <span className="visually-hidden">搜尋訪客使用者</span>
            <input value={query} placeholder="搜尋姓名或 Email" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span className="studio-result-count">{visitors.length} 位訪客</span>
        </div>

        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th scope="col">訪客</th><th scope="col">有效對話</th><th scope="col">最後使用</th><th scope="col"><span className="visually-hidden">查看詳情</span></th></tr></thead>
            <tbody>
              {visitors.map((visitor) => {
                const conversations = allConversations.filter((item) => item.visitorId === visitor.id && item.durationSeconds > 0);
                const active = selected?.id === visitor.id;
                return (
                  <tr className={active ? "is-selected" : ""} key={visitor.id}>
                    <td>
                      <button className="studio-person-cell" type="button" onClick={() => setSelectedId(visitor.id)} aria-pressed={active}>
                        <span>{visitor.name.slice(0, 1)}</span><span><strong>{visitor.name}</strong><small>{visitor.email ? maskEmail(visitor.email) : "未提供 Email"}</small></span>
                      </button>
                    </td>
                    <td>{conversations.length}</td>
                    <td>{formatStudioDate(visitor.lastUsedAt)}</td>
                    <td><button className="studio-icon-button" type="button" aria-label={`查看 ${visitor.name} 詳情`} onClick={() => setSelectedId(visitor.id)}><CaretRightIcon size={17} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visitors.length === 0 ? (
          <div className="studio-empty-state"><MagnifyingGlassIcon size={24} /><strong>找不到符合的訪客</strong><p>請改用姓名或完整 Email 搜尋。</p></div>
        ) : null}
      </section>

      <aside className="studio-panel studio-user-detail">
        {selected ? (
          <>
            <div className="studio-user-identity">
              <span>{selected.name.slice(0, 1)}</span>
              <div><h2>{selected.name}</h2><p>{selected.email || "未提供 Email"}</p></div>
            </div>
            <dl className="studio-detail-stats">
              <div><dt>有效對話</dt><dd>{selectedConversations.filter((item) => item.durationSeconds > 0).length}</dd></div>
              <div><dt>總對話時間</dt><dd>{Math.round(totalSeconds / 60)} 分鐘</dd></div>
              <div><dt>第一次使用</dt><dd>{formatStudioDate(selected.createdAt, false)}</dd></div>
              <div><dt>最後使用</dt><dd>{formatStudioDate(selected.lastUsedAt)}</dd></div>
            </dl>
            <div className="studio-form-divider" />
            <PanelHeader title="最近對話" />
            <div className="studio-mini-conversations">
              {selectedConversations.length ? selectedConversations.map((conversation) => (
                <button type="button" key={conversation.id} onClick={() => navigate("conversations")}>
                  <span><strong>{conversation.title}</strong><small>{formatStudioDate(conversation.startedAt)}</small></span>
                  <CaretRightIcon size={16} />
                </button>
              )) : <p className="studio-muted-copy">目前沒有可閱讀的對話。</p>}
            </div>
            <button className="studio-button secondary full" type="button" onClick={() => navigate("conversations")}>查看這位訪客的對話</button>
          </>
        ) : <div className="studio-empty-state"><UsersThreeIcon size={24} /><strong>選擇一位訪客</strong><p>詳細資料會顯示在這裡。</p></div>}
      </aside>
    </div>
  );
}

function ConversationsPage({
  allConversations,
  allVisitors,
  personaName,
  loadConversation,
  onDeleteConversation,
}: {
  allConversations: StudioConversation[];
  allVisitors: StudioVisitor[];
  personaName: string;
  loadConversation: (conversationId: string) => Promise<StudioMessage[]>;
  onDeleteConversation: (conversationId: string) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(allConversations[0]?.id ?? "");
  const [loadedMessages, setLoadedMessages] = useState<Record<string, StudioMessage[]>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ConversationStatus>("ALL");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  const conversations = allConversations.filter((conversation) => {
    const visitor = allVisitors.find((item) => item.id === conversation.visitorId);
    const matchesStatus = status === "ALL" || conversation.status === status;
    const matchesQuery = !normalizedQuery
      || conversation.title.toLocaleLowerCase("zh-TW").includes(normalizedQuery)
      || visitor?.name.toLocaleLowerCase("zh-TW").includes(normalizedQuery);
    return Boolean(matchesStatus && matchesQuery);
  });
  const selectedBase = allConversations.find((conversation) => conversation.id === selectedId)
    ?? conversations[0]
    ?? null;
  const selected = selectedBase ? {
    ...selectedBase,
    messages: loadedMessages[selectedBase.id] ?? selectedBase.messages,
  } : null;
  const selectedVisitor = selected ? allVisitors.find((visitor) => visitor.id === selected.visitorId) : null;

  useEffect(() => {
    if (!allConversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(allConversations[0]?.id ?? "");
    }
  }, [allConversations, selectedId]);

  useEffect(() => {
    if (!selected?.id || loadedMessages[selected.id]) return;
    let active = true;
    void loadConversation(selected.id).then((messages) => {
      if (active) setLoadedMessages((current) => ({ ...current, [selected.id]: messages }));
    });
    return () => { active = false; };
  }, [loadConversation, loadedMessages, selected?.id]);

  return (
    <div className="studio-conversation-layout">
      <section className="studio-panel studio-conversation-browser">
        <div className="studio-list-toolbar stacked">
          <label className="studio-search-field">
            <MagnifyingGlassIcon size={18} aria-hidden="true" />
            <span className="visually-hidden">搜尋對話</span>
            <input value={query} placeholder="搜尋主題或訪客" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="studio-filter-row" aria-label="對話狀態篩選">
            {([
              ["ALL", "全部"],
              ["ENDED", "已完成"],
              ["FAILED", "未接通"],
            ] as const).map(([value, label]) => (
              <button type="button" key={value} className={status === value ? "is-active" : ""} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="studio-conversation-list">
          {conversations.map((conversation) => {
            const visitor = allVisitors.find((item) => item.id === conversation.visitorId);
            const active = selected?.id === conversation.id;
            return (
              <button className={active ? "is-selected" : ""} type="button" key={conversation.id} aria-pressed={active} onClick={() => setSelectedId(conversation.id)}>
                <span className="studio-conversation-row-title"><strong>{conversation.title}</strong><StatusBadge status={conversation.status} /></span>
                <span className="studio-conversation-row-meta"><small>{visitor?.name ?? "未知訪客"}</small><small>{formatStudioDate(conversation.startedAt)}</small></span>
                <span className="studio-conversation-row-meta"><small>{formatDuration(conversation.durationSeconds)}</small><small>v{conversation.personaVersion}</small></span>
              </button>
            );
          })}
          {conversations.length === 0 ? (
            <div className="studio-empty-state"><ChatsCircleIcon size={24} /><strong>找不到符合的對話</strong><p>請調整搜尋文字或狀態篩選。</p></div>
          ) : null}
        </div>
      </section>

      <section className="studio-panel studio-transcript-panel">
        {selected ? (
          <>
            <header className="studio-transcript-header">
              <div>
                <span className="studio-status-line"><StatusBadge status={selected.status} />人格版本 v{selected.personaVersion}</span>
                <h2>{selected.title}</h2>
                <p>{selectedVisitor?.name ?? "未知訪客"}，{formatStudioDate(selected.startedAt)}，{formatDuration(selected.durationSeconds)}</p>
              </div>
              <button
                className="studio-button studio-danger-button"
                type="button"
                onClick={() => void onDeleteConversation(selected.id)}
              >
                <TrashIcon size={17} />刪除紀錄
              </button>
            </header>
            <section className="studio-conversation-summary" aria-label="對話摘要">
              <strong>對話摘要</strong>
              {selected.summary ? (
                <>
                  <p>{selected.summary.oneLine}</p>
                  {selected.summary.topics.length ? (
                    <ul>{selected.summary.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
                  ) : null}
                  {selected.summary.actionItems.length ? (
                    <ol>{selected.summary.actionItems.map((item) => <li key={item}>{item}</li>)}</ol>
                  ) : null}
                </>
              ) : <p>這通對話尚未產生摘要。</p>}
            </section>
            <div className="studio-transcript" role="list" aria-label="完整對話逐字稿">
              {selected.messages.length ? selected.messages.map((message) => (
                <article className={message.role === "USER" ? "is-user" : "is-assistant"} role="listitem" key={message.id}>
                  <header><strong>{message.role === "USER" ? selectedVisitor?.name ?? "訪客" : personaName}</strong><time>{message.elapsed}</time></header>
                  <p>{message.content}</p>
                </article>
              )) : (
                <div className="studio-empty-state"><WarningCircleIcon size={24} /><strong>沒有可閱讀的逐字稿</strong><p>這通對話未接通，因此沒有保存訊息。</p></div>
              )}
            </div>
          </>
        ) : <div className="studio-empty-state"><ChatsCircleIcon size={24} /><strong>選擇一通對話</strong><p>完整逐字稿會顯示在這裡。</p></div>}
      </section>
    </div>
  );
}

function SettingsPage({
  ownerEmail,
  onChangePassword,
}: {
  ownerEmail: string;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentPassword) {
      setError("請輸入目前密碼。");
      return;
    }
    const validationError = validateNewPassword(newPassword, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      const changeError = await onChangePassword(currentPassword, newPassword);
      if (changeError) {
        setError(changeError);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);
      setSuccess("密碼已更新，目前裝置會維持登入狀態。");
    } catch {
      setError("密碼變更沒有完成，請檢查網路後再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-page-stack studio-settings-page">
      <form className="studio-panel studio-editor-form studio-settings-form" onSubmit={(event) => void handleSubmit(event)}>
        <PanelHeader
          title="帳號安全"
          description="先確認目前密碼，再設定新的管理後臺密碼"
          action={(
            <button
              className="studio-text-button"
              type="button"
              aria-pressed={showPasswords}
              onClick={() => setShowPasswords((visible) => !visible)}
            >
              {showPasswords ? "隱藏密碼" : "顯示密碼"}
            </button>
          )}
        />
        <label className="studio-field is-readonly">
          <span>登入電子信箱</span>
          <input value={ownerEmail} readOnly aria-readonly="true" />
        </label>
        <div className="studio-form-divider" />
        <div className="studio-form-grid studio-password-grid">
          <label className="studio-field">
            <span>目前密碼</span>
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="studio-field">
            <span>新密碼</span>
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <small>至少 8 個字元，包含英文大寫、小寫與數字。</small>
          </label>
          <label className="studio-field">
            <span>確認新密碼</span>
            <input
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
        </div>
        {error ? <p className="studio-form-message is-error" role="alert">{error}</p> : null}
        {success ? <p className="studio-form-message is-success" role="status">{success}</p> : null}
        <div className="studio-form-actions">
          <button className="studio-button primary" type="submit" disabled={busy}>
            {busy ? "正在更新密碼" : "更新密碼"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function StudentStudio({
  ownerName,
  ownerEmail,
  personaAvatarUrl,
  api,
  onChangePassword,
  onSignOut,
}: StudentStudioProps) {
  const [page, setPage] = useState<StudioPage>(() => resolveStudioPage(window.location.pathname));
  const [draft, setDraft] = useState<PersonaDraft>(PERSONA_DRAFT);
  const [visitors, setVisitors] = useState<StudioVisitor[]>([]);
  const [conversations, setConversations] = useState<StudioConversation[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [published, setPublished] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(personaAvatarUrl);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const displayName = ownerDisplayName(ownerName, ownerEmail);
  const meta = PAGE_META[page];

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.getStudio().then((studio) => {
      if (!active) return;
      const persona = studio.persona;
      setDraft(personaToDraft(persona));
      setVisitors(studio.visitors.map((visitor) => ({
        id: visitor.id,
        name: visitor.displayName,
        email: visitor.email ?? "",
        createdAt: visitor.createdAt,
        lastUsedAt: visitor.lastUsedAt,
      })));
      setConversations(studio.conversations.map((conversation) => ({
        id: conversation.id,
        visitorId: conversation.visitorId,
        title: conversation.title,
        startedAt: conversation.startedAt,
        durationSeconds: conversation.durationSeconds,
        status: conversation.status,
        personaVersion: conversation.personaVersion,
        summary: conversation.summary,
        messages: [],
      })));
      setActiveVersion(persona.activeVersion);
      setPublished(persona.published);
      setAvatarUrl(persona.avatarUrl ?? "");
      setLoadError(null);
    }).catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      setLoadError(message === "OWNER_STUDIO_NOT_FOUND"
        ? "這個帳號不是此 AI 分身的管理者。"
        : "管理後臺資料載入失敗，請確認 Core API 與本機 Supabase 已啟動。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    const handlePopState = () => setPage(resolveStudioPage(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = `${meta.title} | 學員 AI 分身`;
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [meta.title]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  function notify(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }

  function navigate(nextPage: StudioPage) {
    const href = studioHref(nextPage);
    if (window.location.pathname !== href) window.history.pushState({}, "", href);
    setPage(nextPage);
  }

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, nextPage: StudioPage) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(nextPage);
  }

  function patchDraft(patch: Partial<PersonaDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function saveDraft(): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    try {
      await api.saveDraft({
        displayName: draft.displayName,
        description: draft.description,
        systemPrompt: draft.systemPrompt,
        openingMessage: draft.openingMessage,
      });
      notify("草稿已儲存。尚未影響目前公開版本。");
      return true;
    } catch {
      notify("草稿儲存失敗，請檢查必填欄位與 Core API 狀態。");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    try {
      const saved = await saveDraft();
      if (!saved) return;
      const result = await api.publishDraft();
      setActiveVersion(result.version);
      setPublished(true);
      notify(`v${result.version} 已發布，新對話會使用這個版本。`);
    } catch {
      notify("發布失敗，草稿尚未切換成公開版本。");
    }
  }

  async function deleteConversation(conversationId: string): Promise<boolean> {
    if (!window.confirm("確定要刪除這通對話與完整逐字稿嗎？刪除後無法還原。")) return false;
    try {
      await api.deleteConversation(conversationId);
      setConversations((current) => current.filter((item) => item.id !== conversationId));
      notify("對話與逐字稿已刪除。");
      return true;
    } catch {
      notify("對話刪除失敗，資料仍完整保留。");
      return false;
    }
  }

  async function uploadAvatar(file: File) {
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)
      || file.size <= 0
      || file.size > 5 * 1024 * 1024) {
      notify("頭像只接受 5 MB 內的 JPG、PNG 或 WebP。");
      return;
    }
    try {
      const uploadedUrl = await api.uploadAvatar(file);
      setAvatarUrl(uploadedUrl);
      notify("頭像已更新，前臺通話頁重新整理後會同步顯示。");
    } catch {
      notify("頭像上傳失敗，請稍後重試。");
    }
  }

  async function loadConversation(conversationId: string): Promise<StudioMessage[]> {
    try {
      const detail = await api.getConversation(conversationId);
      return detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        elapsed: new Intl.DateTimeFormat("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date(message.createdAt)),
      }));
    } catch {
      notify("逐字稿載入失敗，請稍後重試。");
      return [];
    }
  }

  const topbarAction = page === "settings" ? null : page === "persona" ? (
    <div className="studio-topbar-actions">
      <button className="studio-button secondary" type="button" disabled={saving} onClick={() => void publishDraft()}>發布新版本</button>
      <button className="studio-button primary" type="button" disabled={saving} onClick={() => void saveDraft()}><FloppyDiskIcon size={17} />{saving ? "儲存中" : "儲存草稿"}</button>
    </div>
  ) : (
    <a className="studio-button secondary" href="/">開啟對話頁<ArrowSquareOutIcon size={17} /></a>
  );

  if (!loading && loadError === "這個帳號不是此 AI 分身的管理者。") {
    return (
      <main className="studio-root studio-access-denied-shell">
        <section className="studio-panel studio-access-denied-panel" aria-labelledby="studio-access-denied-title">
          <span className="studio-access-denied-icon" aria-hidden="true"><ShieldCheckIcon size={24} /></span>
          <p>學員 AI 分身</p>
          <h1 id="studio-access-denied-title">無法進入管理後臺</h1>
          <p>這個帳號是訪客帳號，不具備此 AI 分身的管理權限。</p>
          <div>
            <a className="studio-button primary" href="/">回到對話頁</a>
            <button className="studio-button secondary" type="button" onClick={() => void onSignOut()}>登出</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="studio-root" data-screen-label={`studio-${page}`}>
      <a className="studio-skip-link" href="#studio-main">跳到主要內容</a>
      <div className="studio-shell">
        <aside className="studio-rail-outer">
          <div className="studio-rail">
            <a className="studio-brand" href="/studio" onClick={(event) => handleNavClick(event, "dashboard")} aria-label="前往分身工作室總覽">
              <span className="studio-brand-mark" aria-hidden="true"><SparkleIcon size={17} weight="fill" /></span>
              <span><strong>分身工作室</strong><small>學員 AI 分身</small></span>
            </a>

            <div className="studio-owner-card">
              <PersonaPlaceholder name={draft.displayName} src={avatarUrl} compact />
              <div><strong>{displayName}</strong><span>分身管理者</span></div>
            </div>

            <nav className="studio-nav" aria-label="學生後臺導覽">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.page === page;
                return (
                  <a
                    key={item.page}
                    href={studioHref(item.page)}
                    className={active ? "is-active" : ""}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => handleNavClick(event, item.page)}
                  >
                    <Icon size={19} weight={active ? "bold" : "regular"} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="studio-utilities">
              <button type="button" onClick={() => void onSignOut()}>
                <SignOutIcon size={18} /><span>登出</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="studio-main-column">
          <header className="studio-topbar">
            <div><h1>{meta.title}</h1><p>{meta.description}</p></div>
            {topbarAction}
          </header>

          <main ref={mainRef} className="studio-content" id="studio-main" tabIndex={-1}>
            {loading ? <div className="studio-empty-state"><strong>正在讀取管理後臺資料</strong><p>請稍候。</p></div> : null}
            {loadError ? <div className="studio-empty-state" role="alert"><WarningCircleIcon size={24} /><strong>無法開啟管理後臺</strong><p>{loadError}</p></div> : null}
            {!loading && !loadError && page === "dashboard" ? <DashboardPage draft={draft} visitors={visitors} conversations={conversations} activeVersion={activeVersion} published={published} avatarUrl={avatarUrl} navigate={navigate} /> : null}
            {!loading && !loadError && page === "persona" ? (
              <PersonaPage draft={draft} avatarUrl={avatarUrl} onChange={patchDraft} onSave={async () => { await saveDraft(); }} onPublish={publishDraft} onAvatarUpload={uploadAvatar} />
            ) : null}
            {!loading && !loadError && page === "voice" ? <VoicePage previewVoice={api.previewVoice} notify={notify} /> : null}
            {!loading && !loadError && page === "users" ? <UsersPage navigate={navigate} allVisitors={visitors} allConversations={conversations} /> : null}
            {!loading && !loadError && page === "conversations" ? <ConversationsPage allVisitors={visitors} allConversations={conversations} personaName={draft.displayName} loadConversation={loadConversation} onDeleteConversation={deleteConversation} /> : null}
            {!loading && !loadError && page === "settings" ? <SettingsPage ownerEmail={ownerEmail} onChangePassword={onChangePassword} /> : null}
          </main>
        </div>
      </div>

      <div className={`studio-toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">
        <CheckCircleIcon size={18} weight="fill" />
        <span>{toast}</span>
        {toast ? <button type="button" aria-label="關閉提示" onClick={() => setToast(null)}>關閉</button> : null}
      </div>
    </div>
  );
}
