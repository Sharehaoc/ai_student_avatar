import { describe, expect, it } from "vitest";

import {
  INITIAL_PIPELINE_STATUS,
  reducePipelineStatus,
  resolveDominantSpeaker,
  resolveConnectionStatus,
  shouldConfirmBeforeSignOut,
  shouldReportUnexpectedDisconnect,
  upsertTranscriptLine,
  voiceStatusLabel,
} from "./voice-ui-state.js";


describe("voice UI state", () => {
  it("依真實事件更新 STT、AI、TTS 燈號，TTS 錯誤不會被後續狀態蓋掉", () => {
    const listening = reducePipelineStatus(INITIAL_PIPELINE_STATUS, {
      type: "AUDIO_LEVEL",
      speaker: "USER",
      level: 0.4,
    });
    const transcribed = reducePipelineStatus(listening, {
      type: "TRANSCRIPT",
      segmentId: "user-1",
      participantIdentity: "visitor-1",
      speaker: "USER",
      text: "你好",
      final: true,
    });
    const speaking = reducePipelineStatus(transcribed, {
      type: "AGENT_STATE",
      state: "speaking",
    });
    const playbackFinished = reducePipelineStatus(speaking, {
      type: "AGENT_STATE",
      state: "listening",
    });
    const failed = reducePipelineStatus(speaking, {
      type: "PIPELINE_ERROR",
      stage: "TTS",
      code: "TTS_FAILED",
    });

    expect(listening.STT).toBe("active");
    expect(transcribed).toMatchObject({ STT: "success", AI: "active" });
    expect(speaking).toMatchObject({ AI: "success", TTS: "active" });
    expect(playbackFinished.TTS).toBe("success");
    expect(failed.TTS).toBe("error");
    expect(reducePipelineStatus(failed, {
      type: "AGENT_STATE",
      state: "listening",
    }).TTS).toBe("error");

    expect(reducePipelineStatus(speaking, {
      type: "PIPELINE_STATUS",
      stage: "TTS",
      status: "success",
    }).TTS).toBe("success");
  });

  it("TTS 完成後不會被同一輪較晚抵達的 speaking 事件降回處理中，下一輪才重置", () => {
    const completed = reducePipelineStatus(
      { STT: "success", AI: "success", TTS: "active" },
      { type: "PIPELINE_STATUS", stage: "TTS", status: "success" },
    );
    const lateSpeaking = reducePipelineStatus(completed, {
      type: "AGENT_STATE",
      state: "speaking",
    });
    const nextTurn = reducePipelineStatus(lateSpeaking, {
      type: "AGENT_STATE",
      state: "thinking",
    });

    expect(lateSpeaking.TTS).toBe("success");
    expect(nextTurn).toMatchObject({ AI: "active", TTS: "idle" });
  });

  it("同一段 partial 字幕會被 final 取代，不重複顯示", () => {
    const partial = upsertTranscriptLine([], {
      type: "TRANSCRIPT",
      segmentId: "segment-1",
      participantIdentity: "visitor-1",
      speaker: "USER",
      text: "我想",
      final: false,
    });
    const final = upsertTranscriptLine(partial, {
      type: "TRANSCRIPT",
      segmentId: "segment-1",
      participantIdentity: "visitor-1",
      speaker: "USER",
      text: "我想談談團隊。",
      final: true,
    });

    expect(final).toEqual([{
      segmentId: "segment-1",
      speaker: "USER",
      text: "我想談談團隊。",
      final: true,
    }]);
  });

  it("通話狀態用訪客看得懂的文字呈現", () => {
    expect(voiceStatusLabel("CONNECTING", "unknown")).toBe("正在安全連線");
    expect(voiceStatusLabel("RECONNECTING", "unknown")).toBe("正在重新連線");
    expect(voiceStatusLabel("LISTENING", "speaking")).toBe("AI 正在回覆");
    expect(voiceStatusLabel("LISTENING", "listening", "USER")).toBe("你正在說話");
    expect(voiceStatusLabel("LISTENING", "listening")).toBe("正在聽你說");
  });

  it("只在真實音量超過門檻時判定目前說話者", () => {
    expect(resolveDominantSpeaker({ AGENT: 0.01, USER: 0.015 })).toBe(null);
    expect(resolveDominantSpeaker({ AGENT: 0.18, USER: 0.42 })).toBe("USER");
    expect(resolveDominantSpeaker({ AGENT: 0.63, USER: 0.22 })).toBe("AGENT");
  });

  it("短暫斷線時保留通話，LiveKit 恢復後回到聆聽狀態", () => {
    expect(resolveConnectionStatus("LISTENING", "reconnecting")).toBe("RECONNECTING");
    expect(resolveConnectionStatus("RECONNECTING", "connected")).toBe("LISTENING");
    expect(resolveConnectionStatus("IDLE", "reconnecting")).toBe("IDLE");
  });

  it("使用者主動結束通話時不誤報為斷線", () => {
    expect(shouldReportUnexpectedDisconnect("LISTENING")).toBe(true);
    expect(shouldReportUnexpectedDisconnect("RECONNECTING")).toBe(true);
    expect(shouldReportUnexpectedDisconnect("DISCONNECTING")).toBe(false);
    expect(shouldReportUnexpectedDisconnect("IDLE")).toBe(false);
  });

  it("完全閒置時可直接登出，有對話或連線才先確認收尾", () => {
    expect(shouldConfirmBeforeSignOut(null, undefined)).toBe(false);
    expect(shouldConfirmBeforeSignOut(null, "IDLE")).toBe(false);
    expect(shouldConfirmBeforeSignOut("conversation-1", "IDLE")).toBe(true);
    expect(shouldConfirmBeforeSignOut(null, "CONNECTING")).toBe(true);
  });
});
