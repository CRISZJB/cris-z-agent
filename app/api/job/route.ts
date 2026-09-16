import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJobProfile, writeJobProfile, listDocumentChunks } from "@/lib/documents";
import {
  detectProfileResumeConflicts,
  diffJobProfiles,
  isJobProfileEmpty,
  normalizeJobProfile,
  parseJobProfileImport,
} from "@/lib/documents/job-profile";
import {
  fieldsToPlainAnswer,
  fillJobFormFields,
  isGeneratedField,
  parseRequestedFields,
  toPlainText,
} from "@/lib/job/fill-assist";
import { runAgent } from "@/lib/agent/agent";
import { runWithChatKnowledgeContext } from "@/lib/knowledge/visibility";
import {
  allowAgentDebug,
  DemoModeWriteError,
  demoForbiddenJson,
  isPublicDemoMode,
} from "@/lib/demo/mode";
import { withDemoSessionContext } from "@/lib/demo/request";

export const runtime = "nodejs";
export const maxDuration = 60;

function conflictHintsForProfile(profile = readJobProfile()) {
  return detectProfileResumeConflicts(profile, listDocumentChunks("job"));
}

function parseGeneratedJson(answer: string): Record<string, string> {
  const plain = toPlainText(answer);
  const fenced = plain.match(/\{[\s\S]*\}/);
  const raw = fenced?.[0] ?? plain;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = toPlainText(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  return withDemoSessionContext(request, () => {
    const profile = readJobProfile();
    return NextResponse.json({
      profile,
      empty: isJobProfileEmpty(profile),
      conflict_hints: conflictHintsForProfile(profile),
      public_demo_mode: isPublicDemoMode(),
      ephemeral_demo: isPublicDemoMode(),
    });
  });
}

export async function PUT(request: NextRequest) {
  return withDemoSessionContext(request, async () => {
    if (isPublicDemoMode()) {
      return demoForbiddenJson("公开演示模式不允许保存或修改 Job Profile。");
    }
    try {
      const json = await request.json();
      const body = json as { profile?: unknown };
      const payload = body.profile ?? json;
      const next = writeJobProfile(normalizeJobProfile(payload));
      return NextResponse.json({
        profile: next,
        conflict_hints: conflictHintsForProfile(next),
      });
    } catch (error) {
      if (error instanceof DemoModeWriteError) {
        return demoForbiddenJson(error.message);
      }
      throw error;
    }
  });
}

const AssistSchema = z.object({
  mode: z.enum(["fill", "jd", "import_preview", "import_commit"]),
  fields_text: z.string().optional(),
  jd_text: z.string().optional(),
  import_json: z.unknown().optional(),
  confirm_overwrite: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  return withDemoSessionContext(request, async () => {
  try {
    const json = await request.json();
    const parsed = AssistSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "请求无效。" }, { status: 400 });
    }

    if (parsed.data.mode === "import_preview") {
      if (isPublicDemoMode()) {
        return demoForbiddenJson("公开演示模式不允许导入 Job Profile。");
      }
      const imported = parseJobProfileImport(parsed.data.import_json);
      const current = readJobProfile();
      return NextResponse.json({
        preview: imported.profile,
        warnings: imported.warnings,
        current_empty: isJobProfileEmpty(current),
        requires_confirm: !isJobProfileEmpty(current),
        diffs: diffJobProfiles(current, imported.profile),
        conflict_hints: conflictHintsForProfile(imported.profile),
      });
    }

    if (parsed.data.mode === "import_commit") {
      if (isPublicDemoMode()) {
        return demoForbiddenJson("公开演示模式不允许导入 Job Profile。");
      }
      const imported = parseJobProfileImport(parsed.data.import_json);
      if (imported.warnings.some((warning) => /解析失败|必须是 JSON/.test(warning))) {
        return NextResponse.json({ error: imported.warnings.join(" ") }, { status: 400 });
      }
      const current = readJobProfile();
      if (!isJobProfileEmpty(current) && !parsed.data.confirm_overwrite) {
        return NextResponse.json(
          {
            error: "当前已有求职档案，不会自动覆盖。请确认差异后再导入。",
            requires_confirm: true,
            diffs: diffJobProfiles(current, imported.profile),
            preview: imported.profile,
          },
          { status: 409 },
        );
      }
      const next = writeJobProfile(imported.profile);
      return NextResponse.json({
        profile: next,
        conflict_hints: conflictHintsForProfile(next),
      });
    }

    const profile = readJobProfile();
    if (parsed.data.mode === "fill") {
      const fieldsText = parsed.data.fields_text ?? "";
      const jdText = parsed.data.jd_text ?? "";
      const requested = parseRequestedFields(fieldsText);
      const generatedNames = requested.filter(isGeneratedField);
      let generatedValues: Record<string, string> = {};

      if (generatedNames.length > 0) {
        const hasJd = Boolean(jdText.trim());
        const prompt = `你是求职填写助手。请只为下列「生成型」字段写纯文本草稿，输出一个 JSON 对象，key 为字段名，value 为纯文本（不要 Markdown，不要 **、\\~、\\. 转义）。

生成型字段：
${generatedNames.map((name) => `- ${name}`).join("\n")}

结构化求职档案（事实来源，勿编造档案没有的经历）：
${JSON.stringify(profile, null, 2)}

${
  hasJd
    ? `已提供 JD，请结合 JD 写针对性内容：\n${jdText}`
    : `未提供具体 JD：
- 「为什么申请」类字段请写「AI 产品经理通用申请理由」
- 禁止写「贵公司」「这个岗位」
- 不要假装已有具体雇主信息`
}

只输出 JSON 对象，不要输出其他说明。`;

        try {
          const result = await runWithChatKnowledgeContext(
            { audience: "public", includeLegacy: false },
            () =>
              runAgent([{ role: "user", content: prompt }], {
                knowledgeScope: "job",
                debug: allowAgentDebug(true),
              }),
          );
          generatedValues = parseGeneratedJson(result.answer ?? "");
        } catch {
          generatedValues = {};
        }
      }

      const fields = fillJobFormFields({
        profile,
        fieldsText,
        jdText,
        generatedValues,
      });

      return NextResponse.json({
        fields,
        answer: fieldsToPlainAnswer(fields),
        sources: [],
      });
    }

    const prompt = `请分析以下 JD，并结合 job 知识空间真实资料输出：

1. 岗位核心要求
2. 硬性条件
3. 加分项
4. 我的资料中可匹配的 Evidence（必须有证据；优先 Job Profile 结构化归属）
5. 我的资料中目前没有证据的部分（明确说没有证据，不要编造能力）
6. 可选：自我介绍 / 岗位匹配说明 / 申请理由【生成建议】

结构化求职档案摘要（空字段忽略）：
${JSON.stringify(profile, null, 2)}

JD：
${parsed.data.jd_text ?? ""}

规则：JD 要求不能自动变成我的能力。没有证据就写「当前资料没有证据支持」。输出使用纯文本，不要 Markdown 转义。`;

    const result = await runWithChatKnowledgeContext(
      { audience: "public", includeLegacy: false },
      () =>
        runAgent([{ role: "user", content: prompt }], {
          knowledgeScope: "job",
          debug: allowAgentDebug(true),
        }),
    );
    return NextResponse.json({
      ...result,
      answer: toPlainText(result.answer ?? ""),
    });
  } catch (error) {
    if (error instanceof DemoModeWriteError) {
      return demoForbiddenJson(error.message);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "求职助手失败。" },
      { status: 500 },
    );
  }
  });
}
