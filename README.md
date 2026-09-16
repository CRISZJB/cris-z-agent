# Cris.Z Agent

一个面向日常、工作、学习与求职场景的个人 AI Agent。

基于 DeepSeek Tool Calling、本地知识库与 Evidence 机制构建的个人 AI Agent，可在通用问答、个人资料事实问答与基于资料生成之间自主切换。

- 本地导入个人文件
- 按知识空间组织
- Agent 自主决定是否检索
- 个人事实必须有 Evidence
- 通用问题可以直接回答
- 基于资料可总结、改写和生成

## Public Demo

在线公开演示使用匿名示例数据（`demo/`），文件上传与 Job Profile 持久化写入关闭。

本地运行（默认不开启 `PUBLIC_DEMO_MODE`）仍支持完整上传、删除与 Job Profile 维护。

开启方式：在部署环境设置 `PUBLIC_DEMO_MODE=true`。

## Screenshots

仓库可后续放入真实截图（当前不附带伪造图）：

- Chat → `docs/screenshots/chat.png`
- Knowledge Base → `docs/screenshots/knowledge.png`
- Job Assistant → `docs/screenshots/job-assistant.png`
- Sources → `docs/screenshots/sources.png`
- Retrieval Experiment → `docs/screenshots/retrieval-experiment.png`

---

## Why I Built It

通用大模型有三个常见问题：

- 不知道我的个人资料
- 容易编造经历
- 很难区分「资料事实」和「模型生成」

因此设计：

**Personal Knowledge + Tool Calling + Evidence + Fact Guard**

目标：让 AI 在真实个人场景里做到——可用、可验证、知道自己的信息边界。

---

## Product Capabilities

| 能力 | 说明 |
|---|---|
| General Knowledge | 普通问题直接回答，不强制 RAG |
| Grounded Fact | 个人事实必须基于 Evidence |
| Grounded Generation | 基于真实资料总结、改写、生成 |
| Knowledge Space | 工作 / 求职 / 学习 / 个人 / 临时资料 |
| File Import | TXT / MD / PDF / DOCX |
| Job Assistant | 求职字段填写、JD 分析、Job Profile |
| Sources | 回答显示可验证来源 |
| Hallucination Guard | 防止编造个人经历 |

---

## Architecture

```
User
  ↓
Cris.Z Agent
  ↓
DeepSeek Tool Calling
  ├─ Direct Answer
  ├─ search_knowledge
  ├─ read_document
  ├─ list_documents
  └─ structured Job Profile
  ↓
Evidence Validation
  ↓
Answer + Sources
```

**This is not a fixed RAG pipeline.**

RAG 是 Agent 可以调用的工具，不是每个问题都强制经过 RAG。

通用问题可以直接回答；涉及个人资料时，再决定是否检索、读文档、引用 Evidence。

---

## Three Answer Modes

### Grounded Fact

例子：「我的学校是什么？」

规则：必须有 Evidence。没有证据就不能当事实写进答案。

### General Knowledge

例子：「什么是 RAG？」

规则：可以直接使用模型通用知识，不强制先检索本地资料。

### Grounded Generation

例子：「根据我的简历写一段自我介绍。」

规则：事实来自资料，表达可以重新组织和生成。

---

## Hallucination Protection

### Case 1：没有证据 ≠ 事实不存在

用户问：「你有没有在 Google 工作过？」

知识库没有相关记录。

错误做法：「没有。」

正确做法：「当前资料中没有足够证据确认或否认。」

解释：**absence of evidence ≠ evidence of absence**。缺少记录不能直接否定经历。

### Case 2：拒绝顺着错误前提编造

用户问：「介绍一下你负责 TikTok 推荐算法的项目。」

如果资料里没有这段经历，Agent 不应顺着错误前提补故事，而应说明没有证据支持该结论。

个人 Agent 的价值，不只是「会回答」，而是**知道边界**。

---

## Retrieval Experiment

早期在作品集阶段做过 BM25 / Vector / Hybrid 对比（N=12）：

| Retrieval | Top1 | Top3 | Top5 |
|---|---:|---:|---:|
| BM25 | 58% | 67% | 83% |
| Vector | 50% | 50% | 58% |
| Hybrid | 50% | 67% | 83% |

最初假设：Vector / Hybrid 可能改善语义检索。

实际结果：BM25 的 Top1 更高；Hybrid 在 Top3/Top5 与 BM25 持平，没有稳定收益。

最终决定：

- 默认：`RETRIEVAL_MODE=bm25`
- Vector / Hybrid 保留为实验能力

没有因为 Hybrid 更「AI」就强行使用。检索方式用评测证明价值，而不是用概念叙事决定。

复现：

```bash
npm run eval:retrieval
```

---

## Prompt / Agent Behavior Iteration

真实案例：Grounded Generation（约 500 字）曾出现：

- 调用约 7 个工具
- 最后一轮 DeepSeek 超时 60s

诊断后发现：不是 Retrieval 慢，也不是单个 Tool 慢，而是**冗余工具调用 + 最终生成上下文变大**。

改法：约束 Agent 使用 minimum set of tools；压缩工具结果中送入模型的片段长度。

优化后（本地重复测试）：

- 约 150 字生成：约 6–12 秒
- 约 500 字生成：约 11–14 秒
- 重复测试无 timeout

没有把 timeout 从 60 秒粗暴改成 120 秒来「掩盖」问题。

---

## Resume / Job Profile Reliability

真实问题：PDF 文本抽取后，**公司 → 岗位 → 项目**关系可能被打乱。内容仍是真的，但归属可能错配。

因此加入：

- resume-aware chunking
- `affiliation_unknown`（无法可靠绑定公司时明确标出）
- structured Job Profile（人工维护的求职事实权威源）

事实优先级：

```
Structured Job Profile
  >
人工确认资料
  >
上传原始简历
  >
legacy
```

Agent 不允许根据文本位置、chunk 顺序或相邻片段，自行猜测「项目属于哪家公司」。

---

## Job Assistant

`/job-assistant` 当前支持：

- 结构化 Job Profile
- JSON 导入（预览 → diff → 确认后保存）
- 公司—岗位—项目绑定
- 求职字段自动填写
- 每字段单独复制
- JD 匹配分析
- 缺失事实显示：`[需要人工补充]`
- 生成字段标记：`AI 生成建议`

不包含浏览器自动填表或自动投递。

---

## Privacy

本地保存：

- 上传原始文件
- Job Profile
- 文档 metadata
- Retrieval index

会发送给 DeepSeek：

- 当前对话
- 与当前问题相关的检索片段

因此：**不是完全本地推理**。

`DEEPSEEK_API_KEY` 只在服务端使用，不应提交到 Git。

---

## Tech Stack

- Next.js
- TypeScript
- DeepSeek Chat Completions / Tool Calling
- Local BM25
- `@huggingface/transformers`（实验 Vector）
- ONNX Runtime
- pdf-parse
- mammoth
- Vitest

---

## Evaluation

当前自动化测试：

```bash
npm test
```

最新状态：**19 files / 104 tests**。

另外保留：

- Retrieval Eval（`npm run eval:retrieval`）
- Hallucination cases（Fact Guard 相关测试）
- Grounded Generation 行为约束（Prompt / 最少工具）
- Performance diagnostics（`npm run diagnose:timeout` 等）
- Resume affiliation / Job Profile 导入与填写测试

---

## Local Run

```bash
npm install
```

复制环境变量：

```powershell
Copy-Item .env.example .env.local
```

配置：

```
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
RETRIEVAL_MODE=bm25
```

可选公开演示：

```
PUBLIC_DEMO_MODE=true
```

启动：

```bash
npm run dev
```

访问：

- `/agent` — 聊天
- `/knowledge` — 知识库
- `/job-assistant` — 求职助手
- `/settings` — 设置

---

## Privacy-Safe Repository

以下**不提交** Git：

- `.env.local`
- `.data/`
- 真实上传文件
- 真实 Job Profile
- manual evaluation output

GitHub 只保留：

- 代码
- 匿名 fixture
- 文档
- 测试
- 评测脚本

---

## Current Limitations

- PDF 页级定位有限
- Vector / Hybrid 当前没有证明优于 BM25
- Retrieval Eval 样本量仍小（N=12）
- 没有长期记忆
- 没有 MCP
- 没有多模态
- 没有浏览器自动投递
- 依赖 DeepSeek API
- 尚未进行正式用户规模验证

---

## What I Learned / Product Decisions

1. **RAG 不应该是每个问题的强制路径。** Agent 应能直接回答通用问题。
2. **Evidence 用来约束事实，不应该锁死生成能力。** 总结、改写、申请理由仍可生成，但需标明边界。
3. **没有证据不等于事实不存在。** 不能把「资料里没有」说成「一定没做过」。
4. **Retrieval 技术必须用评测证明价值。** 不因为 Hybrid 更「先进」就默认启用。
5. **工具越多不等于答案越可靠。** 冗余工具调用会拖垮最终生成。
6. **个人 Agent 的知识边界比「功能数量」更重要。** 知道什么时候不该编，比多一个入口更关键。
