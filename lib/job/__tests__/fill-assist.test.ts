import { describe, expect, it } from "vitest";
import legacyChatgpt from "../../../fixtures/job-profile.legacy-chatgpt.json";
import { normalizeJobProfile } from "../../documents/job-profile";
import {
  FILL_MISSING,
  buildGenericApplicationReason,
  fillJobFormFields,
  formatCompactProjects,
  parseRequestedFields,
  pickHighestEducation,
  pickLatestInternship,
  toPlainText,
} from "../fill-assist";

const PROFILE = normalizeJobProfile({
  name: "张三",
  target_roles: "AI 产品经理",
  education: [
    {
      school: "北京科技大学",
      degree: "本科",
      major: "物联网工程",
      date_range: "2021-08 ~ 2025-06",
    },
    {
      school: "香港理工大学",
      degree: "硕士",
      major: "电子与信息工程",
      date_range: "2025-09 ~ 2026-10",
    },
  ],
  internships: normalizeJobProfile(legacyChatgpt).internships,
  skills: { product: "PRD", data: "SQL", ai: "RAG" },
  academic: { papers: [], patents: [] },
});

const FIELDS = `姓名：
学校：
专业：
毕业时间：
最近一段实习：
公司：
岗位：
项目经历：
自我介绍：
为什么申请这个岗位：
`;

describe("job fill assist", () => {
  it("parses form field labels", () => {
    expect(parseRequestedFields(FIELDS)).toEqual([
      "姓名",
      "学校",
      "专业",
      "毕业时间",
      "最近一段实习",
      "公司",
      "岗位",
      "项目经历",
      "自我介绍",
      "为什么申请这个岗位",
    ]);
  });

  it("defaults education fields to highest degree only", () => {
    const highest = pickHighestEducation(PROFILE.education);
    expect(highest?.school).toBe("香港理工大学");
    expect(highest?.major).toBe("电子与信息工程");
    expect(highest?.degree).toBe("硕士");

    const fields = fillJobFormFields({ profile: PROFILE, fieldsText: FIELDS });
    const byField = Object.fromEntries(fields.map((item) => [item.field, item]));
    expect(byField["学校"]?.value).toBe("香港理工大学");
    expect(byField["专业"]?.value).toBe("电子与信息工程");
    expect(byField["毕业时间"]?.value).toBe("2026-10");
    expect(byField["学校"]?.value).not.toContain("北京科技大学");
    expect(byField["专业"]?.type).toBe("fact");
  });

  it("fills latest internship company/role without dumping duties", () => {
    const latest = pickLatestInternship(PROFILE.internships);
    expect(latest?.company).toBe("亿次网联（杭州）科技有限公司");
    const fields = fillJobFormFields({ profile: PROFILE, fieldsText: FIELDS });
    const byField = Object.fromEntries(fields.map((item) => [item.field, item]));
    expect(byField["最近一段实习"]?.value).toBe(
      "亿次网联（杭州）科技有限公司｜产品实习生｜2026-08 ~ 至今",
    );
    expect(byField["公司"]?.value).toBe("亿次网联（杭州）科技有限公司");
    expect(byField["岗位"]?.value).toBe("产品实习生");
    expect(byField["最近一段实习"]?.value).not.toContain("CER");
  });

  it("keeps project experience compact and AI-first when no JD", () => {
    const compact = formatCompactProjects(PROFILE, { limit: 3 });
    expect(compact.split("\n").length).toBeLessThanOrEqual(3);
    expect(compact).toMatch(/国信智会|国信密盒|办公 Agent|I-Park/);
    expect(compact.split("\n").length).toBeGreaterThanOrEqual(2);

    const fields = fillJobFormFields({ profile: PROFILE, fieldsText: FIELDS });
    const projects = fields.find((item) => item.field === "项目经历")?.value ?? "";
    expect(projects).not.toContain("对标 6 家");
    expect(projects.split("\n").length).toBeLessThanOrEqual(3);
  });

  it("marks generated fields and avoids 贵公司 without JD", () => {
    const fields = fillJobFormFields({ profile: PROFILE, fieldsText: FIELDS });
    const why = fields.find((item) => item.field === "为什么申请这个岗位");
    const intro = fields.find((item) => item.field === "自我介绍");
    expect(why?.type).toBe("generated");
    expect(intro?.type).toBe("generated");
    expect(why?.value).not.toContain("贵公司");
    expect(why?.value).not.toContain("这个岗位");
    expect(why?.value).toContain("通用申请理由");
    expect(buildGenericApplicationReason(PROFILE)).not.toContain("贵公司");
  });

  it("strips markdown escapes for plain copy text", () => {
    expect(toPlainText("**姓名**")).toBe("姓名");
    expect(toPlainText("2025\\~2026")).toBe("2025~2026");
    expect(toPlainText("Dr\\. Smith")).toBe("Dr. Smith");
    expect(toPlainText("普通文本")).toBe("普通文本");
  });

  it("uses missing placeholder instead of inventing facts", () => {
    const fields = fillJobFormFields({
      profile: { ...PROFILE, name: "", phone: "" },
      fieldsText: "姓名：\n电话：\n",
    });
    expect(fields.find((item) => item.field === "姓名")?.value).toBe(FILL_MISSING);
    expect(fields.find((item) => item.field === "电话")?.value).toBe(FILL_MISSING);
  });
});
