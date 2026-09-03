{
  "name": "yuanshu",
  "description": "DeepSeek Harness with YuanShu platform integration",
  "version": "0.1.0",
  "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app"
  ],
  "patchReload": "live",
  "plugins": {
    "@deepseek-ai/dsh-yuanshu-gateway": {
      "version": "workspace:^"
    }
  }
}
