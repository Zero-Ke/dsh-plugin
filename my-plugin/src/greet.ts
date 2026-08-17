/**
 * greet-tool — 注册一个模型可调用的工具（tool）。
 *
 * 工具插件通过 `inject: ['tools']` 声明依赖：Cordis 会等 `ctx.tools`
 * 注册表就绪后才调用 `apply`。
 *
 * `defineTool` 的要点：
 * - `parameters` 是"属性 schema"：每项为 { type, required?, description?, default?, enum? }，
 *   会编译成 JSON Schema，并在 `execute` 前校验/推导出类型安全的 `args`；
 * - `output.schema` 声明规范化返回值的 schema；`output.render` 把规范值
 *   转成模型可见的内容块（ContentBlock）；
 * - `execute(args, exec)` 返回符合 `output.schema` 的规范值。
 *
 * 插件的 `Config`（Schemastery 校验 + 默认值）：控制"你好"时自我介绍的内容，
 * 可以在 cordis.yml 里覆盖，无需改代码。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export interface Config {
  /** "你好"时自我介绍的主体文案（以 DSH 身份口吻，不要以"插件"自称）。 */
  introText: string
  /** 创建者署名，例如 "谭华泽"；留空则不显示创建者。 */
  creator: string
}

export const Config: Schema<Config> = Schema.object({
  introText: Schema.string().default('我是 DSH（DeepSeek Harness），一个基于 DeepSeek 的智能编程助手，可以帮你编写、调试代码，分析项目并执行各种自动化任务'),
  creator: Schema.string().default('谭华泽'),
})

export function apply(ctx: Context, config: Config) {
  console.log('[greet-tool] apply: registering greet tool...')

  ctx.tools.register(defineTool({
    name: 'greet',
    // description 是模型唯一的决策依据：写清楚"什么时候调用、参数从哪提取"，
    // 模型才会在用户说"和 Ada 打个招呼"这类自然语言时调用本工具。
    description:
      '向指定的人打一个友好的招呼，返回一句问候语。'
      + '当用户表达"问候 / 打招呼 / 欢迎 / 向某人问好"时调用本工具，例如"和 Ada 打个招呼"、"say hi to Bob"；'
      + '当用户只是说"你好 / 嗨 / hello"（没有明确的问候对象）时也调用本工具，此时 name 填"你"，并设置 introduce=true 以附带 DSH 的自我介绍；'
      + '如果用户没有打招呼意图（例如在询问功能、提问问题），不要调用。',
    parameters: {
      introduce: {
        type: 'boolean',
        default: false,
        description: '是否附带 DSH 的自我介绍。当用户说"你好"、"自我介绍"或想了解你是什么时，设为 true。',
      },
      punctuation: {
        type: 'string',
        default: '!',
        description: '问候语末尾的标点符号，默认感叹号（!）。',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      console.log(`[greet-tool] execute called: name=${JSON.stringify(args.name)} introduce=${JSON.stringify(args.introduce ?? false)} punctuation=${JSON.stringify(args.punctuation ?? '!')}`)
      const greeting = `Hello, ${args.name}${args.punctuation ?? '!'}`
      // introduce=true（"你好"场景）：以 DSH 身份自我介绍，内容由插件 Config 控制。
      const message = args.introduce
        ? `${greeting}\n\n${config.introText}${config.creator ? `，由 ${config.creator} 创建。` : '。'}`
        : greeting
      console.log(`[greet-tool] execute returning: ${JSON.stringify(message)}`)
      return message
    },
  }))

  console.log('[greet-tool] greet tool registered.')
}
