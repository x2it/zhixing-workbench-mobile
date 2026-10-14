// 生产环境默认端口 5000（平台约定）；开发环境由 dev 脚本注入 PORT=9091
process.env.PORT = process.env.PORT || '5000';

import('./server/dist/index.js').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
