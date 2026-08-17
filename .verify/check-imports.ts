/**
 * 快速冒烟验证（不启动服务器）：
 * 1) import 两个插件模块 —— 验证 @deepseek-ai/* 的模块解析与 TS 语法；
 * 2) 用假 ctx 调用 apply —— 验证 Config schema 与 defineTool 能跑通。
 * 运行方式（在 deepseek-harness 仓库根目录）：
 *   node --import tsx/esm /Users/tanhuaze/code/dsh-test/.verify/check-imports.ts
 */
import { apply as helloApply, Config as helloConfig, name as helloName } from '../my-plugin/src/hello.ts'
import { apply as greetApply, Config as greetConfig, name as greetName } from '../my-plugin/src/greet.ts'

// --- hello-plugin ---
console.log('hello plugin name =', helloName)
// schemastery Schema 可直接调用：校验 + 填充默认值。
const hello = helloConfig({})
console.log('hello config with defaults =', JSON.stringify(hello))
helloApply({} as never, hello)

// --- greet-tool ---
let registered: { name: string } | undefined
const fakeCtx = {
  tools: {
    register(def: { name: string }) {
      registered = def
      return () => {}
    },
  },
}
// greet 插件带 Config（控制"你好"自我介绍的返回值），apply 需传入配置。
greetApply(fakeCtx as never, greetConfig({}))
console.log('greet plugin name =', greetName)
console.log('greet config with defaults =', JSON.stringify(greetConfig({})))
if (registered?.name !== 'greet') {
  console.error('FAIL: greet tool was not registered')
  process.exit(1)
}
console.log('OK: both plugins import and apply() successfully')
