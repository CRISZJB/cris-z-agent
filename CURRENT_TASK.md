# 当前任务

Cris.Z Agent 已进入日常试用阶段。

## 当前产品状态

Cris.Z Agent 是一个面向日常、工作、学习和求职的个人 AI Agent。

当前已经支持：

- DeepSeek Tool Calling Agent
- 通用知识问答
- 基于本地知识库的事实问答
- 基于资料的总结、改写、分析和生成
- Knowledge Space
- TXT / MD / PDF / DOCX 文件导入
- Evidence / Sources
- BM25 默认检索
- Vector / Hybrid 实验模式
- 求职助手
- JD 分析
- 个人事实幻觉保护
- public / demo 数据隔离

## 已解决：Grounded Generation 超时

之前的问题：

用户请求：

“根据我的资料，帮我写一段 150 字左右的 AI 产品经理自我介绍。”

曾出现：

DeepSeek 请求超时（60000ms）

经过性能诊断发现：

- Retrieval / Tool 执行耗时很低
- 主要瓶颈是 Grounded Generation 中工具调用冗余，以及最后一轮 DeepSeek 生成
- 500 字生成曾稳定撞到单次 60 秒 timeout

完成最小性能优化后：

- Grounded Generation 主路径以 search_knowledge 为主
- 只有必要时才 read_document
- list_knowledge_spaces / list_documents / get_profile 等冗余调用明显减少
- Evidence / Citation / Fact Guard / Agent Loop 未被破坏

当前实测：

150 字生成：
约 6–12 秒

500 字生成：
约 11–14 秒

C / D 多次重复测试：
均无 timeout

当前不需要调整：

DEEPSEEK_TIMEOUT_MS
maxDuration

## 当前决定

暂不继续进行性能微优化。

不继续为了减少几 KB context 而修改 Agent 架构。

下一阶段进入真实日常使用：

通过实际使用发现：

- 知识库问题
- 检索问题
- 生成质量问题
- 真正缺失的产品功能

再决定下一轮开发。

## 当前原则

不要主动增加：

- Streaming
- 多 Agent
- LangChain / LangGraph
- 云向量数据库
- 长期记忆
- MCP
- 浏览器自动投递
- 复杂 RAG 优化

除非真实使用场景证明有必要。

## 下一步

用户开始实际使用 Cris.Z Agent：

1. 日常通用问答
2. 上传个人 / 工作 / 学习资料
3. 基于资料总结和生成
4. 使用求职助手
5. 记录真实使用中遇到的问题

只有真实问题出现后，再进入下一阶段开发。
