/**
 * hello-plugin — 最简单的插件形态（函数形式）。
 *
 * 插件是一个导出 `apply` 函数的 TypeScript 模块：
 * 框架加载时调用 `apply(ctx, config)`，我们通过 `ctx` 注册能力。
 * 同时导出 `name`（诊断用元数据）和 `Config`（Schemastery 校验 + 默认值）。
 *
 * 运行时只 import 了 `@deepseek-ai/schemastery`（校验配置用）；
 * `@deepseek-ai/cordis` 只是类型导入，编译后被擦除。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'hello-plugin'

export interface Config {
  /** 要打印的问候语。 */
  greeting: string
  /** 是否把问候语转成大写。 */
  loud: boolean
}

// 与接口同名的 Schema 常量：Cordis 在加载时用它校验 cordis.yml 里的 config，
// 并填充未提供的字段默认值。不要导出普通对象作为 Config。
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello, world!'),
  loud: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  const message = config.loud ? config.greeting.toUpperCase() : config.greeting
  console.log(`[hello-plugin] ${message}`)
}
