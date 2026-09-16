const SECTION_KEYS: Record<string, string> = {
  概述: "overview",
  个人介绍: "intro",
  职业方向: "direction",
  产品能力: "product-skills",
  人工智能能力: "ai-skills",
  技术能力: "technical-skills",
  产品理念: "philosophy",
  工作经历: "experience",
  教育经历: "education",
  明确不存在的信息: "non-claims",
  如何发现值得做的问题: "problem-discovery-method",
  如何做产品取舍: "tradeoff-method",
  如何判断是否使用人工智能: "ai-fit-method",
  如何和工程师合作: "engineering-collaboration",
  失败与复盘: "failures",
  项目背景: "project-background",
  用户问题: "user-problem",
  商业问题: "business-problem",
  我的职责: "role",
  问题发现: "problem-discovery",
  核心洞察: "insight",
  产品决策: "product-decision",
  备选方案: "alternatives",
  产品取舍: "tradeoffs",
  产品方案: "solution",
  最终方案: "solution",
  人工智能与技术设计: "ai-design",
  最小可行产品: "mvp",
  上线结果: "results",
  项目复盘: "retro",
};

export function slugifySection(heading: string): string {
  const trimmed = heading.trim();
  if (SECTION_KEYS[trimmed]) {
    return SECTION_KEYS[trimmed];
  }

  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "section";
}

export function evidenceIdFor(documentKey: string, heading: string): string {
  return `${documentKey}:${slugifySection(heading)}`;
}
