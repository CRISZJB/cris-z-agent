"use client";

import { useEffect, useRef, useState } from "react";
import type {
  JobEducationEntry,
  JobInternshipEntry,
  JobProfile,
  JobProfileDiff,
  JobProjectEntry,
} from "@/lib/documents";
import type { Source } from "@/lib/agent/types";
import { SourcesList } from "@/components/agent/SourceCard";
import { EMPTY_JOB_PROFILE } from "@/lib/documents/types";
import type { FillFieldResult } from "@/lib/job/fill-assist";

type ImportPreview = {
  preview: JobProfile;
  warnings: string[];
  current_empty: boolean;
  requires_confirm: boolean;
  diffs: JobProfileDiff[];
  conflict_hints: string[];
};

function emptyEducation(): JobEducationEntry {
  return { school: "", degree: "", major: "", date_range: "" };
}

function emptyProject(): JobProjectEntry {
  return {
    project_name: "",
    company: "",
    institution: "",
    role: "",
    responsibilities: "",
    results: "",
  };
}

function emptyInternship(): JobInternshipEntry {
  return { company: "", role: "", date_range: "", projects: [] };
}

export function JobAssistantPanel({ publicDemoMode = false }: { publicDemoMode?: boolean }) {
  const [profile, setProfile] = useState<JobProfile>({ ...EMPTY_JOB_PROFILE });
  const [fieldsText, setFieldsText] = useState(
    "姓名：\n学校：\n专业：\n毕业时间：\n最近一段实习：\n公司：\n岗位：\n项目经历：\n自我介绍：\n为什么申请这个岗位：\n",
  );
  const [jdText, setJdText] = useState("");
  const [answer, setAnswer] = useState("");
  const [fillFields, setFillFields] = useState<FillFieldResult[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [conflictHints, setConflictHints] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImportJson, setPendingImportJson] = useState<unknown>(null);
  const [demoMode, setDemoMode] = useState(publicDemoMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const profileWriteDisabled = demoMode || busy;

  useEffect(() => {
    void fetch("/api/job")
      .then((response) => response.json())
      .then(
        (payload: {
          profile?: JobProfile;
          conflict_hints?: string[];
          public_demo_mode?: boolean;
        }) => {
          if (payload.profile) {
            setProfile({
              ...EMPTY_JOB_PROFILE,
              ...payload.profile,
              skills: { ...EMPTY_JOB_PROFILE.skills, ...payload.profile.skills },
              academic: {
                papers: payload.profile.academic?.papers ?? [],
                patents: payload.profile.academic?.patents ?? [],
              },
            });
          }
          setConflictHints(payload.conflict_hints ?? []);
          if (typeof payload.public_demo_mode === "boolean") {
            setDemoMode(payload.public_demo_mode);
          }
        },
      );
  }, []);

  async function saveProfile() {
    if (demoMode) {
      setStatus("公开演示模式不允许保存 Job Profile。");
      return;
    }
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/job", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    const payload = (await response.json()) as {
      profile?: JobProfile;
      conflict_hints?: string[];
      error?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setStatus(payload.error || "保存失败。");
      return;
    }
    if (payload.profile) {
      setProfile(payload.profile);
    }
    setConflictHints(payload.conflict_hints ?? []);
    setStatus("求职档案已保存（本地）。");
  }

  async function onPickImportFile(file: File | null) {
    if (demoMode) {
      setStatus("公开演示模式不允许导入 Job Profile。");
      return;
    }
    if (!file) {
      return;
    }
    setBusy(true);
    setStatus("");
    setImportPreview(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      setPendingImportJson(json);
      const response = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "import_preview", import_json: json }),
      });
      const payload = (await response.json()) as ImportPreview & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "预览失败");
      }
      setImportPreview(payload);
      setStatus("已生成导入预览，请确认后再写入。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入预览失败");
      setPendingImportJson(null);
    } finally {
      setBusy(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  async function commitImport(confirmOverwrite: boolean) {
    if (!pendingImportJson) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import_commit",
          import_json: pendingImportJson,
          confirm_overwrite: confirmOverwrite,
        }),
      });
      const payload = (await response.json()) as {
        profile?: JobProfile;
        conflict_hints?: string[];
        error?: string;
        requires_confirm?: boolean;
      };
      if (response.status === 409) {
        setStatus(payload.error || "需要确认覆盖。");
        setBusy(false);
        return;
      }
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "导入失败");
      }
      setProfile(payload.profile);
      setConflictHints(payload.conflict_hints ?? []);
      setImportPreview(null);
      setPendingImportJson(null);
      setStatus("Job Profile 已导入并保存到本地。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`已复制：${label}`);
    } catch {
      setCopyStatus("复制失败，请手动选择文本。");
    }
  }

  async function run(mode: "fill" | "jd") {
    setBusy(true);
    setStatus("");
    setAnswer("");
    setFillFields([]);
    setSources([]);
    setCopyStatus("");
    try {
      const response = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          fields_text: fieldsText,
          jd_text: jdText,
        }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        fields?: FillFieldResult[];
        sources?: Source[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "请求失败");
      }
      setFillFields(payload.fields ?? []);
      setAnswer(payload.answer ?? "");
      setSources(payload.sources ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="job-assistant">
      <section className="job-profile-editor">
        <h2>求职档案（结构化权威源）</h2>
        <p>
          本地维护的求职事实。空字段保持为空，不会自动补造。导入 JSON 需预览确认；已有档案不会自动覆盖。
        </p>

        {conflictHints.length > 0 ? (
          <div className="job-conflict-banner" role="status">
            <p>结构化档案与原始资料存在差异，请人工确认。</p>
            <ul>
              {conflictHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="job-import-row">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void onPickImportFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={profileWriteDisabled}
            title={demoMode ? "公开演示模式不允许导入 Job Profile" : undefined}
            onClick={() => fileRef.current?.click()}
          >
            导入 Job Profile
          </button>
          <button
            type="button"
            disabled={profileWriteDisabled}
            title={demoMode ? "公开演示模式不允许保存 Job Profile" : undefined}
            onClick={() => void saveProfile()}
          >
            保存档案
          </button>
        </div>
        {demoMode ? (
          <p className="privacy-note">
            公开演示模式：可浏览匿名档案并使用「根据资料填写」，但不可保存或导入。
          </p>
        ) : null}

        {importPreview ? (
          <div className="job-import-preview">
            <h3>导入预览</h3>
            {importPreview.warnings.length > 0 ? (
              <ul className="job-import-warnings">
                {importPreview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {importPreview.conflict_hints.length > 0 ? (
              <p className="job-conflict-banner">
                结构化档案与原始资料存在差异，请人工确认。
              </p>
            ) : null}
            {!importPreview.current_empty ? (
              <div className="job-diff-list">
                <p>当前已有档案，导入将覆盖以下差异字段（需确认）：</p>
                <ul>
                  {importPreview.diffs.slice(0, 40).map((diff) => (
                    <li key={diff.path}>
                      <code>{diff.path}</code>
                      <span className="job-diff-before">{diff.before || "（空）"}</span>
                      →
                      <span className="job-diff-after">{diff.after || "（空）"}</span>
                    </li>
                  ))}
                </ul>
                {importPreview.diffs.length > 40 ? (
                  <p>…共 {importPreview.diffs.length} 处差异</p>
                ) : null}
              </div>
            ) : (
              <p>当前档案为空，确认后将写入预览内容。</p>
            )}
            <pre className="job-preview-json">
              {JSON.stringify(importPreview.preview, null, 2)}
            </pre>
            <div className="job-import-row">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void commitImport(Boolean(importPreview.requires_confirm))
                }
              >
                {importPreview.requires_confirm ? "确认覆盖并导入" : "确认导入"}
              </button>
              <button
                type="button"
                className="job-secondary-btn"
                disabled={busy}
                onClick={() => {
                  setImportPreview(null);
                  setPendingImportJson(null);
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        <h3>基本信息</h3>
        <div className="profile-grid">
          {(
            [
              ["name", "姓名"],
              ["english_name", "英文名"],
              ["email", "邮箱"],
              ["phone", "电话"],
              ["location", "地点"],
              ["target_roles", "目标岗位"],
              ["github", "GitHub"],
              ["portfolio", "作品集"],
            ] as Array<[keyof JobProfile, string]>
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                rows={1}
                value={typeof profile[key] === "string" ? (profile[key] as string) : ""}
                onChange={(event) =>
                  setProfile({ ...profile, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </div>

        <h3>教育</h3>
        {profile.education.map((entry, index) => (
          <div className="job-entry-card" key={`edu-${index}`}>
            <div className="profile-grid">
              {(
                [
                  ["school", "学校"],
                  ["degree", "学历"],
                  ["major", "专业"],
                  ["date_range", "时间"],
                ] as Array<[keyof JobEducationEntry, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={1}
                    value={entry[key]}
                    onChange={(event) => {
                      const education = [...profile.education];
                      education[index] = { ...entry, [key]: event.target.value };
                      setProfile({ ...profile, education });
                    }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="job-secondary-btn"
              onClick={() =>
                setProfile({
                  ...profile,
                  education: profile.education.filter((_, i) => i !== index),
                })
              }
            >
              删除教育
            </button>
          </div>
        ))}
        <button
          type="button"
          className="job-secondary-btn"
          onClick={() =>
            setProfile({ ...profile, education: [...profile.education, emptyEducation()] })
          }
        >
          添加教育
        </button>

        <h3>实习（含项目归属）</h3>
        {profile.internships.map((intern, index) => (
          <div className="job-entry-card" key={`intern-${index}`}>
            <div className="profile-grid">
              {(
                [
                  ["company", "公司"],
                  ["role", "岗位"],
                  ["date_range", "时间"],
                ] as Array<[keyof JobInternshipEntry, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={1}
                    value={typeof intern[key] === "string" ? (intern[key] as string) : ""}
                    onChange={(event) => {
                      const internships = [...profile.internships];
                      internships[index] = { ...intern, [key]: event.target.value };
                      setProfile({ ...profile, internships });
                    }}
                  />
                </label>
              ))}
            </div>
            <h4>下属项目</h4>
            {intern.projects.map((project, projectIndex) => (
              <div className="job-nested-project" key={`p-${index}-${projectIndex}`}>
                <div className="profile-grid">
                  {(
                    [
                      ["project_name", "项目名称"],
                      ["company", "公司"],
                      ["institution", "机构"],
                      ["role", "角色"],
                      ["responsibilities", "职责"],
                      ["results", "结果（可空）"],
                    ] as Array<[keyof JobProjectEntry, string]>
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        rows={key === "responsibilities" || key === "results" ? 3 : 1}
                        value={project[key]}
                        onChange={(event) => {
                          const internships = [...profile.internships];
                          const projects = [...intern.projects];
                          projects[projectIndex] = {
                            ...project,
                            [key]: event.target.value,
                          };
                          internships[index] = { ...intern, projects };
                          setProfile({ ...profile, internships });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="job-secondary-btn"
                  onClick={() => {
                    const internships = [...profile.internships];
                    internships[index] = {
                      ...intern,
                      projects: intern.projects.filter((_, i) => i !== projectIndex),
                    };
                    setProfile({ ...profile, internships });
                  }}
                >
                  删除项目
                </button>
              </div>
            ))}
            <div className="job-import-row">
              <button
                type="button"
                className="job-secondary-btn"
                onClick={() => {
                  const internships = [...profile.internships];
                  internships[index] = {
                    ...intern,
                    projects: [
                      ...intern.projects,
                      { ...emptyProject(), company: intern.company, role: intern.role },
                    ],
                  };
                  setProfile({ ...profile, internships });
                }}
              >
                添加下属项目
              </button>
              <button
                type="button"
                className="job-secondary-btn"
                onClick={() =>
                  setProfile({
                    ...profile,
                    internships: profile.internships.filter((_, i) => i !== index),
                  })
                }
              >
                删除实习
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="job-secondary-btn"
          onClick={() =>
            setProfile({
              ...profile,
              internships: [...profile.internships, emptyInternship()],
            })
          }
        >
          添加实习
        </button>

        <h3>独立项目</h3>
        {profile.projects.map((project, index) => (
          <div className="job-entry-card" key={`solo-${index}`}>
            <div className="profile-grid">
              {(
                [
                  ["project_name", "项目名称"],
                  ["company", "公司"],
                  ["institution", "机构"],
                  ["role", "角色"],
                  ["responsibilities", "职责"],
                  ["results", "结果（可空）"],
                ] as Array<[keyof JobProjectEntry, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={key === "responsibilities" || key === "results" ? 3 : 1}
                    value={project[key]}
                    onChange={(event) => {
                      const projects = [...profile.projects];
                      projects[index] = { ...project, [key]: event.target.value };
                      setProfile({ ...profile, projects });
                    }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="job-secondary-btn"
              onClick={() =>
                setProfile({
                  ...profile,
                  projects: profile.projects.filter((_, i) => i !== index),
                })
              }
            >
              删除项目
            </button>
          </div>
        ))}
        <button
          type="button"
          className="job-secondary-btn"
          onClick={() =>
            setProfile({ ...profile, projects: [...profile.projects, emptyProject()] })
          }
        >
          添加独立项目
        </button>

        <h3>技能</h3>
        <div className="profile-grid">
          {(
            [
              ["product", "产品"],
              ["data", "数据"],
              ["ai", "AI"],
            ] as Array<["product" | "data" | "ai", string]>
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                rows={2}
                value={profile.skills[key]}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    skills: { ...profile.skills, [key]: event.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>

        <h3>学术成果</h3>
        <label>
          论文（每行一条）
          <textarea
            rows={3}
            value={profile.academic.papers.join("\n")}
            onChange={(event) =>
              setProfile({
                ...profile,
                academic: {
                  ...profile.academic,
                  papers: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </label>
        <label>
          专利（每行一条）
          <textarea
            rows={3}
            value={profile.academic.patents.join("\n")}
            onChange={(event) =>
              setProfile({
                ...profile,
                academic: {
                  ...profile.academic,
                  patents: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </label>
      </section>

      <div className="job-columns">
        <section>
          <h2>招聘字段 / 问题</h2>
          <textarea
            className="job-textarea"
            value={fieldsText}
            onChange={(event) => setFieldsText(event.target.value)}
            rows={16}
          />
          <button type="button" disabled={busy} onClick={() => void run("fill")}>
            {busy ? "生成中…" : "根据资料填写"}
          </button>
        </section>
        <section>
          <h2>JD 解析</h2>
          <textarea
            className="job-textarea"
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
            rows={16}
            placeholder="粘贴岗位描述…"
          />
          <button type="button" disabled={busy || !jdText.trim()} onClick={() => void run("jd")}>
            {busy ? "分析中…" : "分析 JD 并匹配资料"}
          </button>
        </section>
      </div>

      {status ? <p className="status-note">{status}</p> : null}
      {copyStatus ? <p className="status-note">{copyStatus}</p> : null}

      {fillFields.length > 0 ? (
        <section className="job-answer">
          <div className="job-answer-header">
            <h2>填写结果</h2>
            <button
              type="button"
              className="job-secondary-btn"
              onClick={() =>
                void copyText(
                  "全部字段",
                  fillFields.map((item) => `${item.field}：\n${item.value}`).join("\n\n"),
                )
              }
            >
              复制全部
            </button>
          </div>
          <div className="job-fill-cards">
            {fillFields.map((item) => (
              <article className="job-fill-card" key={item.field}>
                <div className="job-fill-card-head">
                  <div className="job-fill-card-title">
                    <h3>{item.field}</h3>
                    {item.type === "generated" ? (
                      <span className="job-ai-tag">AI 生成建议</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="job-secondary-btn"
                    onClick={() => void copyText(item.field, item.value)}
                  >
                    复制
                  </button>
                </div>
                <pre className="job-fill-value">{item.value}</pre>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!fillFields.length && answer ? (
        <section className="job-answer">
          <h2>结果</h2>
          <div className="answer-body">{answer}</div>
          {sources.length > 0 ? (
            <div className="sources">
              <SourcesList sources={sources} />
            </div>
          ) : null}
        </section>
      ) : null}

      {fillFields.length > 0 && sources.length > 0 ? (
        <div className="sources">
          <SourcesList sources={sources} />
        </div>
      ) : null}
    </div>
  );
}
