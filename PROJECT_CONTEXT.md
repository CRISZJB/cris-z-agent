# PROJECT_CONTEXT.md

本文件是给下一位 Cursor Agent 的项目交接文档。

**本文件只记录项目状态，实际代码是最终事实来源。如文档和代码冲突，以代码为准。**

---

# 产品定位（当前）

产品名称：**Cris.Z Agent**

定位：面向个人日常、工作、学习和求职的个人 AI Agent（Personal AI Agent）。

GitHub / README 可描述为：日常应用 Agent / Personal AI Agent。

**不要**再把当前产品定位写成：

- Portfolio Agent
- 作品集智能体
- AI Portfolio Agent

仓库内仍可能保留旧作品集 Markdown（`content/`）与兼容工具（`get_profile` / `get_project` / `list_projects`），它们只是 **job 空间兼容数据源**，不是产品主标题。

用户可见品牌统一为：**Cris.Z Agent**。

---

# 核心架构

```
用户
  → Cris.Z Agent（/agent 等）
  → DeepSeek Tool Calling Agent（runAgent）
  → 根据问题自主判断：
       - 直接使用通用知识回答
       - 搜索个人知识库
       - 基于个人资料生成
  → Knowledge / Document Tools
       （search_knowledge / list_documents / read_document /
         list_knowledge_spaces / get_profile / get_project / list_projects）
  → Evidence + Citation 校验
  → Final Answer + Sources
```

**RAG / Retrieval 只是 Agent 可调用的能力，不是固定 Pipeline。**  
不要改成「每个问题强制先检索再生成」。

DeepSeek 通过原生 `fetch` 调用 OpenAI 兼容 Chat Completions + tools（`lib/agent/deepseek.ts`）。  
`DEEPSEEK_TIMEOUT_MS = 60000`（`lib/agent/config.ts`）。  
`MAX_AGENT_ITERATIONS = 5`。

---

# 三种回答模式

实现位置：`lib/agent/prompts.ts` + `lib/agent/fact-guard.ts`。

## A. Grounded Fact

涉及用户个人事实、文件内容、工作经历、教育、项目、数据等：

- 必须基于 Knowledge Base / Evidence
- 没有证据：明确说资料中没有 / 无法确认或否认
- 不能用模型常识补齐个人事实
- Fact Guard 会拦截无证据履历类断言与不当否定开头

## B. General Knowledge

例如：「什么是 RAG？」

- 允许 DeepSeek 直接回答
- 不强制 `search_knowledge`
- 用户未要求「根据我的资料」时不要无意义搜库

## C. Grounded Generation

例如：「根据我的资料帮我写自我介绍。」

- 先检索真实资料作为事实基础
- 允许总结、改写、推理、生成新表达
- 整段生成文案不必逐字存在于知识库
- 其中个人事实 claim 必须有 Evidence
- 回答可区分：【基于你的资料】/【AI 生成建议】

Fact Guard **只约束个人事实 claim**，不阻止改写、总结、brainstorm、文案生成、方案建议、通用知识回答。

---

# 已完成能力

| 能力 | 说明 |
|---|---|
| DeepSeek API | 服务端密钥；`.env.local` |
| Tool Calling | tools + tool_calls + role:tool |
| Agent Loop | `lib/agent/agent.ts`，最多 5 轮 |
| Knowledge Space | work / job / study / personal / temporary |
| 本地文件上传 | `/knowledge` + `POST /api/documents` |
| TXT / MD / PDF / DOCX | `lib/documents/parser.ts`（pdf-parse、mammoth） |
| Document parsing / chunking | `lib/documents/`；Evidence 形如 `doc-xxxx:chunk-001` |
| Evidence / Citation | 解析 `<evidence>`；只接受本轮工具返回的 id |
| BM25 / Vector / Hybrid | `lib/knowledge/`；**默认 BM25** |
| Retrieval Eval | `npm run eval:retrieval` + `evals/retrieval.json` |
| Sources UI | 文件名 · 知识空间 · 章节/片段；Debug 默认隐藏 |
| public / demo 隔离 | 正常聊天默认 public audience |
| Grounded Fact / General / Generation | Prompt + 收窄后的 Fact Guard |
| 求职助手 | `/job-assistant`：档案、字段填写、JD 分析 |
| Job Profile | `.data/profile/job-profile.json` |
| Google / TikTok 幻觉保护 | 无证据不编造任职/项目 |
| 项目上下文追问 | `lib/agent/project-context.ts` |

主要页面：

- `/` 首页入口
- `/agent` 聊天（知识范围 + 开发开关）
- `/knowledge` 导入
- `/job-assistant` 求职助手
- `/settings` 设置概况

---

# Knowledge Space

| id | 名称 |
|---|---|
| `work` | 工作 |
| `job` | 求职 |
| `study` | 学习 |
| `personal` | 个人 |
| `temporary` | 临时资料 |

旧 `content/` Markdown（profile / experience / project-1 等）兼容映射到 **job**。

## Audience（日常聊天）

即使 `npm run dev`：

- **默认 public audience**
- 只读：`published` + 用户真实导入文档
- **demo / draft 默认不参与**正常问答
- 仅 development 显示「使用演示数据」开关；打开后才读 demo/draft（走 author）
- **生产环境永远 public**（API 忽略演示开关）

实现：`resolveChatContentAudience` + `runWithContentAudience`（`lib/knowledge/visibility.ts`），聊天 API 在 `app/api/agent/route.ts`。

单元测试 / fixture / 显式 `CONTENT_AUDIENCE=author` 仍可读 demo。

---

# 本地数据（.data，不提交 Git）

| 路径 | 用途 |
|---|---|
| `.data/uploads/` | 用户上传原始文件 |
| `.data/documents.json` | 文档元数据 + chunk 记录 |
| `.data/profile/job-profile.json` | 求职档案 |
| `.data/knowledge-index.json` | 本地向量索引（vector/hybrid 用） |
| `.data/models/` | 本地 embedding 模型缓存（Transformers.js） |

`.gitignore` 已忽略整个 `.data/`。

---

# 隐私边界

- 文件与元数据保存在本地 `.data/`
- **不是完全本地推理**：当 Agent 调用 DeepSeek 时，相关检索片段 + 当前对话会发送到 DeepSeek API
- 不要把产品宣传成「完全本地」
- 知识导入页有简洁隐私提示

---

# Retrieval 最终决策

真实 Retrieval Eval（N=12，`evals/retrieval.json`）：

| 模式 | Top1 | Top3 | Top5 |
|---|---:|---:|---:|
| BM25 | 58% | 67% | 83% |
| Vector | 50% | 50% | 58% |
| Hybrid | 50% | 67% | 83% |

**生产默认：`RETRIEVAL_MODE=bm25`**（代码默认 + `.env.example`）。

Vector / Hybrid 实现保留，供知识库扩大后重评。  
**下一位 Agent 不要擅自把默认改回 hybrid**，除非有新的 eval 证明收益。

复现：

```bash
npm run index:knowledge
npm run eval:retrieval
```

（vector/hybrid 首次可能需 `HF_ENDPOINT=https://hf-mirror.com`）

---

# 测试状态（以本机最近运行为准）

| 命令 | 状态 |
|---|---|
| `npm test` | **通过**：12 文件，**53** 测试（Vitest） |
| `npm run smoke:deepseek` | 此前已跑通（需 `.env.local`）；强制 public |
| `npm run eval:manual` | 此前已跑通；结果写入 `evals/manual-evaluation.md`（会被覆盖） |
| `npm run eval:retrieval` | 此前已跑通；结论见上表 |

辅助脚本：`scripts/smoke-answer-modes.ts`（三种回答模式实网验收）。

---

# 当前真实使用状态

已可日常路径：

上传真实文件 → 选择知识空间 → 聊天检索/生成 → 显示 Sources

已真实验证：

- 「什么是 RAG？」→ 可不调用知识库直接回答
- 「根据我的资料生成自我介绍」→ 可检索 + 生成（短请求曾成功）
- Google / TikTok → 不编造经历

---

# 当前未解决问题（重要）

用户问题示例：

> 根据我的资料，帮我写一段 150 字左右的 AI 产品经理自我介绍。

出现：

> DeepSeek 请求超时（60000ms）

**尚未修复。不要写成已解决。**

初步怀疑（未定位）：

- 单轮 DeepSeek 请求耗时
- Grounded Generation 多轮模型调用
- Tool 调用数量偏多
- 检索上下文过大
- 当前 `DEEPSEEK_TIMEOUT_MS = 60000`

下一位必须：**先测量，再修复**。  
不要单纯无限增大 timeout。详见 `CURRENT_TASK.md`。

---

# 稳定模块（勿随意重构）

除非定位到真实 bug，否则不要重构：

- Agent Loop（`lib/agent/agent.ts`）
- Evidence / Citation（`citations.ts`）
- Fact Guard（`fact-guard.ts`）— 仅在有回归 bug 时收窄/修正
- Knowledge Space / Document import
- BM25 / Vector / Hybrid 与默认 BM25 决策
- public / demo 隔离
- project context
- 三种回答策略（Prompt 原则）

不要引入：LangChain、LangGraph、多智能体、云向量库、浏览器自动投递。

---

# 技术栈（package.json 实况）

运行时：`next@16.3.5`、`react@19`、`gray-matter`、`zod`、`@huggingface/transformers`、`pdf-parse`、`mammoth`  
测试：`vitest`、`tsx`

环境变量模板：`.env.example`  
密钥：`.env.local`（勿提交）

---

# 快速命令

```powershell
npm install
Copy-Item .env.example .env.local
# 填入 DEEPSEEK_API_KEY、DEEPSEEK_MODEL；默认 RETRIEVAL_MODE=bm25

npm test
npm run dev
npm run validate-content
npm run smoke:deepseek
npm run eval:manual
npm run eval:retrieval
npm run index:knowledge
```

页面：`/` · `/agent` · `/knowledge` · `/job-assistant` · `/settings`

---

本文件只记录项目状态，实际代码是最终事实来源。如文档和代码冲突，以代码为准。
