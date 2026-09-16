import { validateContent } from "../lib/knowledge/validate";

const report = validateContent();

for (const warning of report.warnings) {
  console.warn(`警告：${warning}`);
}

if (!report.ok) {
  console.error("内容校验失败：");
  for (const error of report.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("内容校验通过。");
