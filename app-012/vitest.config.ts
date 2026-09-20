import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // 测试全是纯逻辑；jsdom 30 依赖的 undici 8 与当前 Node 不兼容
    environment: 'node',
  },
});
