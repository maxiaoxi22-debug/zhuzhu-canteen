import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js 局域网开发配置", () => {
  it("允许当前家庭局域网地址加载交互资源", () => {
    expect(nextConfig.allowedDevOrigins).toContain("192.168.1.185");
  });
});
