import { isPublicDemoMode } from "@/lib/demo/mode";

export function DemoModeBanner() {
  if (!isPublicDemoMode()) {
    return null;
  }
  return (
    <div className="demo-mode-banner" role="status">
      公开演示模式 · 使用匿名示例数据 · 上传与持久化写入已关闭
    </div>
  );
}
