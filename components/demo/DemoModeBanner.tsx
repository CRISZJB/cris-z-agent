import { isPublicDemoMode } from "@/lib/demo/mode";

export function DemoModeBanner() {
  if (!isPublicDemoMode()) {
    return null;
  }
  return (
    <div className="demo-mode-banner" role="status">
      <span>公开演示模式 · 支持临时文件上传 · 会话资料不会长期保存</span>
      <span className="demo-mode-banner-sep" aria-hidden="true">
        ·
      </span>
      <span className="demo-mode-banner-note">本地版本支持完整读写功能</span>
    </div>
  );
}
