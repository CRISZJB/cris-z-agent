import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AFFILIATION_UNKNOWN_ANSWER,
  buildAffiliationUnknownAnswer,
  claimsCompanyAffiliation,
  hasAffiliationSpeculation,
  INSUFFICIENT_EVIDENCE_ANSWER,
  isAffiliationUnknownEvidence,
  isBiographyFactQuestion,
  isGeneralKnowledgeQuestion,
  isGenerationOrRewriteRequest,
  isResumeAffiliationQuestion,
  isSafeAffiliationUnknownAnswer,
  isSafeInsufficientAnswer,
  shouldApplyBiographyGuard,
  shouldBlockAffiliationGuess,
  startsWithUnsupportedNegation,
} from "../fact-guard";
import { findUniqueProjectContext } from "../project-context";

describe("fact guard", () => {
  it("treats career and project fact questions as biography facts", () => {
    expect(isBiographyFactQuestion("你以前在 Google 工作过吗？")).toBe(true);
    expect(isBiographyFactQuestion("介绍一下你自己。")).toBe(true);
    expect(isBiographyFactQuestion("你在这个项目中具体负责什么？")).toBe(true);
    expect(isBiographyFactQuestion("我的简历里有哪些项目？")).toBe(true);
  });

  it("does not treat greetings, general knowledge, or generation as biography facts", () => {
    expect(isBiographyFactQuestion("你好")).toBe(false);
    expect(isBiographyFactQuestion("你是谁？")).toBe(false);
    expect(isBiographyFactQuestion("这个页面怎么用？")).toBe(false);
    expect(isGeneralKnowledgeQuestion("什么是 RAG？")).toBe(true);
    expect(isBiographyFactQuestion("什么是 RAG？")).toBe(false);
    expect(isBiographyFactQuestion("解释一下 A/B Test。")).toBe(false);
    expect(isGenerationOrRewriteRequest("根据我的资料帮我写一段 AI 产品经理自我介绍。")).toBe(
      true,
    );
    expect(isBiographyFactQuestion("根据我的资料帮我写一段 AI 产品经理自我介绍。")).toBe(false);
    expect(isBiographyFactQuestion("帮我优化这句话：我是应届生，想做 AI 产品经理。")).toBe(false);
    expect(isBiographyFactQuestion("结合我的经历，你觉得我还缺什么能力？")).toBe(false);
  });

  it("still treats knowledge-base fact checks about personal employment as guarded", () => {
    expect(isBiographyFactQuestion("我的资料里有没有提到 RAG？")).toBe(false);
    expect(isBiographyFactQuestion("你有没有在 Google 工作过？")).toBe(true);
  });

  it("recognizes the canonical insufficient-evidence reply", () => {
    expect(isSafeInsufficientAnswer(INSUFFICIENT_EVIDENCE_ANSWER)).toBe(true);
    expect(isSafeInsufficientAnswer("是的，我之前在 Google 工作过。")).toBe(false);
    expect(isSafeInsufficientAnswer("当前资料没有提到 RAG。")).toBe(true);
  });

  it("treats a leading 没有 as an unsupported factual negation", () => {
    expect(
      startsWithUnsupportedNegation("没有。我的作品集里目前没有收录任何公司任职记录。"),
    ).toBe(true);
    expect(startsWithUnsupportedNegation("没做过 TikTok 推荐。")).toBe(true);
    expect(startsWithUnsupportedNegation("不是，我没在 Google 工作过。")).toBe(true);
    expect(startsWithUnsupportedNegation("从未在 Google 任职。")).toBe(true);
    expect(startsWithUnsupportedNegation(INSUFFICIENT_EVIDENCE_ANSWER)).toBe(false);
  });
});

describe("affiliation unknown fact boundary", () => {
  const question = "国信智会 / 国信密盒属于哪段经历？";

  it("detects resume affiliation questions", () => {
    expect(isResumeAffiliationQuestion(question)).toBe(true);
    expect(isResumeAffiliationQuestion("这个项目是哪家公司做的？")).toBe(true);
    expect(isResumeAffiliationQuestion("介绍一下你自己")).toBe(false);
  });

  it("detects speculation and company-affiliation claims", () => {
    expect(hasAffiliationSpeculation("可能属于亿次网联")).toBe(true);
    expect(hasAffiliationSpeculation("根据位置推测属于公司 A")).toBe(true);
    expect(hasAffiliationSpeculation("大概率属于亿次网联")).toBe(true);
    expect(claimsCompanyAffiliation("国信密盒属于亿次网联科技有限公司")).toBe(true);
    expect(
      claimsCompanyAffiliation(
        "当前资料可以确认你参与过相关工作，但现有简历解析结果无法可靠确认它属于哪一段公司经历。",
      ),
    ).toBe(false);
  });

  it("treats experience_detail / affiliation_unknown metadata as unknown evidence", () => {
    expect(
      isAffiliationUnknownEvidence({
        affiliationUnknown: true,
      }),
    ).toBe(true);
    expect(
      isAffiliationUnknownEvidence({
        sectionType: "experience_detail",
        company: undefined,
      }),
    ).toBe(true);
    expect(
      isAffiliationUnknownEvidence({
        section: "工作经历细节（原文未标明所属公司）",
      }),
    ).toBe(true);
    expect(
      isAffiliationUnknownEvidence({
        sectionType: "experience",
        company: "亿次网联",
      }),
    ).toBe(false);
  });

  it("blocks position/order/adjacency guesses when affiliation is unknown", () => {
    expect(
      shouldBlockAffiliationGuess({
        question,
        answer: "可能属于亿次网联。",
        hasUnknownAffiliationEvidence: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockAffiliationGuess({
        question,
        answer: "根据 chunk 顺序，大概率属于亿次网联。",
        hasUnknownAffiliationEvidence: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockAffiliationGuess({
        question,
        answer: "国信智会属于亿次网联科技有限公司。",
        hasUnknownAffiliationEvidence: true,
      }),
    ).toBe(true);
  });

  it("allows the safe unknown-affiliation answer and does not block when evidence is clear", () => {
    const safe = buildAffiliationUnknownAnswer(question);
    expect(safe).toContain("国信智会 / 国信密盒");
    expect(safe).toContain("无法可靠确认它属于哪一段公司经历");
    expect(isSafeAffiliationUnknownAnswer(safe)).toBe(true);
    expect(isSafeAffiliationUnknownAnswer(AFFILIATION_UNKNOWN_ANSWER)).toBe(true);
    expect(
      shouldBlockAffiliationGuess({
        question,
        answer: safe,
        hasUnknownAffiliationEvidence: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockAffiliationGuess({
        question,
        answer: "根据 Evidence，该项目写在亿次网联经历下。",
        hasUnknownAffiliationEvidence: false,
      }),
    ).toBe(false);
  });
});

describe("project follow-up context", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finds the unique published project from conversation", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const project = findUniqueProjectContext([
      { role: "user", content: "介绍一下人工智能作品集智能体。" },
    ]);
    expect(project?.id).toBe("project-1");
  });

  it("does not treat a project redo follow-up as a generic biography question", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const messages = [
      { role: "user" as const, content: "介绍一下人工智能作品集智能体。" },
      { role: "assistant" as const, content: "这是人工智能作品集智能体项目。" },
      { role: "user" as const, content: "这里面最难的决策是什么？" },
      { role: "assistant" as const, content: "最难的是产品取舍。" },
      { role: "user" as const, content: "如果重新做一次，你会改什么？" },
    ];
    // Follow-up is generation-ish redo; project context still disables guard.
    expect(shouldApplyBiographyGuard(messages)).toBe(false);
  });

  it("still applies the biography guard to a Google question after a project discussion", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const messages = [
      { role: "user" as const, content: "介绍一下人工智能作品集智能体。" },
      { role: "assistant" as const, content: "这是人工智能作品集智能体项目。" },
      { role: "user" as const, content: "你有没有在 Google 工作过？" },
    ];
    expect(shouldApplyBiographyGuard(messages)).toBe(true);
  });
});
