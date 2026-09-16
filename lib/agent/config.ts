export const MAX_AGENT_ITERATIONS = 5;
export const DEEPSEEK_TIMEOUT_MS = 60_000;
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.DEEPSEEK_MODEL?.trim();
  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(
    /\/$/,
    "",
  );

  if (!apiKey) {
    throw new AgentConfigError("缺少 DEEPSEEK_API_KEY。请在 .env.local 中配置服务端密钥。");
  }
  if (!model) {
    throw new AgentConfigError("缺少 DEEPSEEK_MODEL。请在 .env.local 中配置模型名称。");
  }

  return { apiKey, model, baseUrl };
}

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}
