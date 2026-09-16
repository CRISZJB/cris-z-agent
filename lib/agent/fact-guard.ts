import { inheritProjectContext } from "./project-context";

export const INSUFFICIENT_EVIDENCE_ANSWER =
  "目前我的资料里没有证据支持这个结论，因此我无法确认或否认。";

/** Tasks that allow generation / rewrite / advice without treating the whole answer as a biography claim. */
const GENERATION_OR_REWRITE_HINTS = [
  /帮我写/,
  /帮我生成/,
  /帮我改写/,
  /帮我优化/,
  /帮我润色/,
  /帮我整理/,
  /帮我总结/,
  /帮我概括/,
  /帮我提炼/,
  /帮我对比/,
  /帮我比较/,
  /写一段/,
  /写一封/,
  /生成.*自我介绍/,
  /自我介绍/,
  /汇报稿/,
  /行动项/,
  /优化这句话/,
  /改写/,
  /润色/,
  /提建议/,
  /给我建议/,
  /你觉得/,
  /还缺什么/,
  /缺什么能力/,
  /brain\s*storm/i,
];

/** Pure general-knowledge questions: do not force biography evidence. */
const GENERAL_KNOWLEDGE_HINTS = [
  /^什么是/,
  /^解释一下/,
  /^请解释/,
  /^如何做/,
  /^怎么做/,
  /^怎样做/,
  /^如何进行/,
  /^怎么进行/,
  /是什么意思/,
  /有哪些步骤/,
  /产品经理怎么做/,
  /用户访谈/,
  /A\/B\s*Test/i,
  /\bRAG\b/i,
  /\bMCP\b/i,
];

const NON_BIOGRAPHY_HINTS = [
  /^(你好|您好|嗨|hi|hello)[！!。.\s]*$/i,
  /你是谁/,
  /你是人工智能/,
  /你是(不是)?智能体/,
  /怎么用/,
  /如何使用/,
  /这个页面/,
];

/**
 * Personal-fact claims that require Evidence.
 * Keep this narrow: identity / education / employment / project ownership / metrics.
 */
const PERSONAL_FACT_HINTS = [
  /介绍一下你自己/,
  /你自己是谁/,
  /工作过/,
  /在哪里工作/,
  /在哪(里|儿)上(学|班)/,
  /任职/,
  /就职/,
  /学历/,
  /毕业/,
  /哪所学校/,
  /什么学校/,
  /学校是/,
  /公司是/,
  /哪家公司/,
  /在(哪|哪家|什么)公司/,
  /我的简历里/,
  /资料里有哪些项目/,
  /简历里有哪些项目/,
  /做过哪些项目/,
  /有哪些项目经历/,
  /具体负责什么/,
  /你的职责/,
  /我的职责/,
  /取得了什么成绩/,
  /有什么成绩/,
  /KPI|指标|转化率|增长率/,
  /你有没有在/,
  /有没有在.+工作/,
  /是否在.+工作/,
  /是否在.+任职/,
  /有没有做过/,
  /是否做过/,
  /google/i,
  /tiktok/i,
  /字节跳动/,
  /阿里巴巴/,
];

const UNSUPPORTED_NEGATION = /^(没有|没做过|不是|从未)/;

export function latestUserText(messages: Array<{ role: string; content?: string | null }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i]?.content ?? "";
    }
  }
  return "";
}

export function isGenerationOrRewriteRequest(text: string): boolean {
  return GENERATION_OR_REWRITE_HINTS.some((pattern) => pattern.test(text));
}

export function isGeneralKnowledgeQuestion(text: string): boolean {
  const trimmed = text.trim();
  // "我的资料里有没有提到 RAG？" is a KB fact check, not general knowledge.
  if (/我的资料|知识库|简历里|文档里|会议记录/.test(trimmed)) {
    return false;
  }
  return GENERAL_KNOWLEDGE_HINTS.some((pattern) => pattern.test(trimmed));
}

export function isBiographyFactQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (NON_BIOGRAPHY_HINTS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  if (isGenerationOrRewriteRequest(trimmed)) {
    return false;
  }
  if (isGeneralKnowledgeQuestion(trimmed)) {
    return false;
  }
  return PERSONAL_FACT_HINTS.some((pattern) => pattern.test(trimmed));
}

export function shouldApplyBiographyGuard(
  messages: Array<{ role: string; content?: string | null }>,
): boolean {
  const latest = latestUserText(messages);
  if (!isBiographyFactQuestion(latest)) {
    return false;
  }
  if (inheritProjectContext(messages)) {
    return false;
  }
  return true;
}

export function startsWithUnsupportedNegation(text: string): boolean {
  const first = text.trim().split(/\n/)[0]?.trim() ?? "";
  return UNSUPPORTED_NEGATION.test(first);
}

export function isSafeInsufficientAnswer(text: string): boolean {
  if (startsWithUnsupportedNegation(text)) {
    return false;
  }
  return /没有证据支持这个结论|没有足够信息支持这个结论|无法确认或否认|没有相关记录|作品集中没有|没有收录|资料里没有|资料中没有|当前资料没有|没有提到/.test(
    text,
  );
}

export const FACT_RETRY_NUDGE =
  "系统检查：这是用户个人事实类问题（身份、教育、任职、项目归属、成绩等）。缺少证据不等于否定事实。不要回答「没有」「没做过」「不是」「从未」，除非工具结果里有明确否定性证据。若仍无证据，必须回答：目前我的资料里没有证据支持这个结论，因此我无法确认或否认。不要编造公司、项目、学校或岗位。改写、总结、生成建议类任务不受此条拦截。";

/** Canonical reply when resume evidence cannot reliably map a project/duty to a company. */
export const AFFILIATION_UNKNOWN_ANSWER =
  "当前资料可以确认你参与过相关工作，但现有简历解析结果无法可靠确认它属于哪一段公司经历。";

export function buildAffiliationUnknownAnswer(question: string): string {
  const trimmed = question.trim();
  const match = trimmed.match(
    /^[\s「」""'']*(.+?)(?:属于哪|归属哪|是哪|哪段经历|哪家公司|对应哪|挂在哪)/,
  );
  const subject = match?.[1]?.trim().replace(/[？?。！!\s]+$/g, "");
  if (subject && subject.length >= 2 && subject.length <= 48) {
    return `当前资料可以确认你参与过${subject}相关工作，但现有简历解析结果无法可靠确认它属于哪一段公司经历。`;
  }
  return AFFILIATION_UNKNOWN_ANSWER;
}

const AFFILIATION_QUESTION_HINTS = [
  /属于哪(段|家|个)/,
  /归属(哪|于哪)/,
  /哪段(经历|实习|工作)/,
  /哪家公司/,
  /是哪(家|段)/,
  /对应哪/,
  /挂在哪/,
  /属于.*(经历|公司|实习)/,
  /是在哪(家|段)/,
];

const AFFILIATION_SPECULATION = [
  /可能属于/,
  /大概率属于/,
  /很可能属于/,
  /应该属于/,
  /推测属于/,
  /根据位置/,
  /根据(chunk|文本)?顺序/,
  /根据相邻/,
  /最可能归属/,
  /最可能属于/,
  /猜测.*属于/,
  /估计属于/,
  /大概属于/,
];

const COMPANY_AFFILIATION_CLAIM =
  /(属于|归属|挂在|对应).{0,24}(有限公司|科技|网联|物联|大学|实习|经历)/;

const SAFE_AFFILIATION_UNKNOWN =
  /无法可靠确认|无法确定.*归属|无法确认.*属于|未标明所属公司|无法可靠确认它属于哪一段/;

export function isResumeAffiliationQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return AFFILIATION_QUESTION_HINTS.some((pattern) => pattern.test(trimmed));
}

export function hasAffiliationSpeculation(text: string): boolean {
  return AFFILIATION_SPECULATION.some((pattern) => pattern.test(text));
}

export function claimsCompanyAffiliation(text: string): boolean {
  if (SAFE_AFFILIATION_UNKNOWN.test(text)) {
    return false;
  }
  return COMPANY_AFFILIATION_CLAIM.test(text);
}

export function isSafeAffiliationUnknownAnswer(text: string): boolean {
  return SAFE_AFFILIATION_UNKNOWN.test(text);
}

export type AffiliationUnknownEvidence = {
  affiliationUnknown?: boolean;
  sectionType?: string;
  company?: string;
  section?: string;
};

export function isAffiliationUnknownEvidence(item: AffiliationUnknownEvidence): boolean {
  if (item.affiliationUnknown) {
    return true;
  }
  if (item.sectionType === "experience_detail" && !item.company) {
    return true;
  }
  if (item.section && /未标明所属公司/.test(item.section)) {
    return true;
  }
  return false;
}

export function shouldBlockAffiliationGuess(options: {
  question: string;
  answer: string;
  hasUnknownAffiliationEvidence: boolean;
}): boolean {
  if (!isResumeAffiliationQuestion(options.question)) {
    return false;
  }
  if (isSafeAffiliationUnknownAnswer(options.answer)) {
    return false;
  }
  if (hasAffiliationSpeculation(options.answer)) {
    return true;
  }
  if (options.hasUnknownAffiliationEvidence && claimsCompanyAffiliation(options.answer)) {
    return true;
  }
  return false;
}
