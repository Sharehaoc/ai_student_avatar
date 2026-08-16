import type { ConversationSummary } from "@flying-eagle/contracts";


export type ConversationStatus = "PENDING" | "CONNECTING" | "ACTIVE" | "ENDED" | "FAILED";

export interface StudioMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  elapsed: string;
}

export interface StudioConversation {
  id: string;
  visitorId: string;
  title: string;
  startedAt: string;
  durationSeconds: number;
  status: ConversationStatus;
  personaVersion: number;
  summary: ConversationSummary | null;
  messages: StudioMessage[];
}

export interface StudioVisitor {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface PersonaDraft {
  displayName: string;
  description: string;
  systemPrompt: string;
  openingMessage: string;
}

export const PERSONA_DRAFT: PersonaDraft = {
  displayName: "你的 AI 分身",
  description: "陪使用者釐清問題，整理下一個可執行的步驟。",
  systemPrompt: [
    "你是由學生本人建立的 AI 分身。",
    "回覆時使用自然的台灣繁體中文，先理解對方真正想解決的問題，再提出清楚而具體的建議。",
    "不要假裝知道未提供的資訊。不確定時直接說明，並提出一個最重要的追問。",
    "保持溫和、直接、有條理，不使用中國用語或過度誇張的鼓勵。",
  ].join("\n\n"),
  openingMessage: "嗨，我在這裡。你今天最想先釐清哪一件事？",
};

export const STUDIO_VISITORS: StudioVisitor[] = [
  {
    id: "visitor-1",
    name: "陳怡安",
    email: "yi.an.chen@example.com",
    createdAt: "2026-08-03T08:12:00+08:00",
    lastUsedAt: "2026-08-14T20:18:00+08:00",
  },
  {
    id: "visitor-2",
    name: "林冠宇",
    email: "kuan.yu.lin@example.com",
    createdAt: "2026-08-05T14:20:00+08:00",
    lastUsedAt: "2026-08-14T16:42:00+08:00",
  },
  {
    id: "visitor-3",
    name: "王品妤",
    email: "pin.yu.wang@example.com",
    createdAt: "2026-08-08T10:05:00+08:00",
    lastUsedAt: "2026-08-13T22:06:00+08:00",
  },
  {
    id: "visitor-4",
    name: "郭哲維",
    email: "che.wei.kuo@example.com",
    createdAt: "2026-08-11T19:44:00+08:00",
    lastUsedAt: "2026-08-12T09:31:00+08:00",
  },
];

export const STUDIO_CONVERSATIONS: StudioConversation[] = [
  {
    id: "conversation-1",
    visitorId: "visitor-1",
    title: "職涯方向與下一步",
    startedAt: "2026-08-14T20:18:00+08:00",
    durationSeconds: 754,
    status: "ENDED",
    personaVersion: 3,
    summary: null,
    messages: [
      {
        id: "message-1",
        role: "ASSISTANT",
        elapsed: "00:00",
        content: "嗨，我在這裡。你今天最想先釐清哪一件事？",
      },
      {
        id: "message-2",
        role: "USER",
        elapsed: "00:08",
        content: "我最近想換工作，但又怕只是因為現在很累，所以一直不敢決定。",
      },
      {
        id: "message-3",
        role: "ASSISTANT",
        elapsed: "00:18",
        content: "我們先不要急著決定離不離職。你現在的疲累，比較像工作內容不適合、合作方式不舒服，還是長期沒有休息？",
      },
      {
        id: "message-4",
        role: "USER",
        elapsed: "00:39",
        content: "主要是每天都在救火，做完也不知道自己有沒有累積能力。",
      },
      {
        id: "message-5",
        role: "ASSISTANT",
        elapsed: "00:52",
        content: "這聽起來不只是累，而是你看不到投入和成長之間的連結。今天可以先列出三項你想帶去下一份工作的能力，再回頭檢查目前的工作還能不能提供其中一項。",
      },
    ],
  },
  {
    id: "conversation-2",
    visitorId: "visitor-2",
    title: "課程內容如何落地",
    startedAt: "2026-08-14T16:42:00+08:00",
    durationSeconds: 486,
    status: "ENDED",
    personaVersion: 3,
    summary: null,
    messages: [
      {
        id: "message-6",
        role: "USER",
        elapsed: "00:05",
        content: "我聽懂課程了，但回到公司就不知道先做什麼。",
      },
      {
        id: "message-7",
        role: "ASSISTANT",
        elapsed: "00:13",
        content: "先選一個你這週一定會遇到的工作場景，我們只把那個場景做成可使用的流程。你最常卡住的是會議、整理資料，還是回覆客戶？",
      },
    ],
  },
  {
    id: "conversation-3",
    visitorId: "visitor-3",
    title: "客戶溝通準備",
    startedAt: "2026-08-13T22:06:00+08:00",
    durationSeconds: 622,
    status: "ENDED",
    personaVersion: 2,
    summary: null,
    messages: [
      {
        id: "message-8",
        role: "USER",
        elapsed: "00:07",
        content: "明天要跟一個很難溝通的客戶開會，我想先整理說法。",
      },
      {
        id: "message-9",
        role: "ASSISTANT",
        elapsed: "00:16",
        content: "先把這場會議唯一要確認的決策寫成一句話。接著我們再分成對方可能反對什麼、你有哪些證據、最低可接受結果。",
      },
    ],
  },
  {
    id: "conversation-4",
    visitorId: "visitor-1",
    title: "每週時間安排",
    startedAt: "2026-08-12T21:10:00+08:00",
    durationSeconds: 318,
    status: "ENDED",
    personaVersion: 2,
    summary: null,
    messages: [
      {
        id: "message-10",
        role: "USER",
        elapsed: "00:04",
        content: "我每週排了很多事，但真正重要的都沒有做。",
      },
      {
        id: "message-11",
        role: "ASSISTANT",
        elapsed: "00:12",
        content: "先把所有事情分成必須由你完成、可以延後、可以交給別人三類。我們只替第一類保留固定時間。",
      },
    ],
  },
  {
    id: "conversation-5",
    visitorId: "visitor-4",
    title: "第一次使用",
    startedAt: "2026-08-12T09:31:00+08:00",
    durationSeconds: 0,
    status: "FAILED",
    personaVersion: 2,
    summary: null,
    messages: [],
  },
];

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "未接通";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${rest.toString().padStart(2, "0")} 秒`;
}

export function formatStudioDate(value: string, includeTime = true): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}
