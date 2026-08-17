/**
 * 调试驱动：在最小 Cordis 组合里验证 greet 工具。
 *
 * `inject: ['tools']` 保证 apply 执行时 ctx.tools 已就绪（真实依赖注入）。
 * 这里走的是与生产完全相同的 `ctx.tools.execute()` 管线：
 * 参数校验 → tools/pre-execute → 工具体 → tools/post-execute → 结果物化。
 *
 * 用法：在 my-plugin/debug 目录下
 *   node --import tsx /Users/tanhuaze/code/deepseek-harness/vendor/cordis/bin.js
 */
import { CallId } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'debug-driver'
export const inject = ['tools']

export async function apply(ctx: Context) {
  // 1) 查看当前注册的工具
  const schemas = ctx.tools.schemas()
  console.log('[driver] registered tools:', schemas.map(s => s.name).join(', '))

  // 1.5) 模型视角：每次请求发给模型的工具描述（模型靠它决定何时调用）
  console.log('[driver] --- 模型看到的工具描述（schemas）---')
  for (const s of schemas) {
    console.log(JSON.stringify(s, null, 2))
  }
  console.log('[driver] --- 模型看到的工具描述（end）---')

  // 2) 走完整管线调用一次（正常参数）
  const ok = await ctx.tools.execute({
    callId: CallId('debug-1'),
    name: 'greet',
    arguments: { name: 'Ada' },
    signal: new AbortController().signal,
  })
  console.log('[driver] ok.isError      =', ok.isError)
  if (!ok.isError) {
    console.log('[driver] ok.value        =', JSON.stringify(ok.value))
    console.log('[driver] ok.content      =', JSON.stringify(ok.content))
  }

  // 3) 用默认值参数再调一次
  const def = await ctx.tools.execute({
    callId: CallId('debug-2'),
    name: 'greet',
    arguments: { name: 'Bob', punctuation: '?' },
    signal: new AbortController().signal,
  })
  console.log('[driver] default-args    =', def.isError ? 'error' : JSON.stringify((def as { value: unknown }).value))

  // 3.5) "你好"场景：用户只说"你好"，模型应调用 greet 并设置 introduce=true
  const hi = await ctx.tools.execute({
    callId: CallId('debug-2b'),
    name: 'greet',
    arguments: { name: '你', introduce: true },
    signal: new AbortController().signal,
  })
  console.log('[driver] hello-case      =', hi.isError ? 'error' : JSON.stringify((hi as { value: unknown }).value))

  // 4) 无效参数：缺必填的 name —— 应被 defineTool 的参数校验拒绝
  const bad = await ctx.tools.execute({
    callId: CallId('debug-3'),
    name: 'greet',
    arguments: {},
    signal: new AbortController().signal,
  })
  console.log('[driver] invalid-args    =', bad.isError ? `rejected: ${bad.error.message}` : 'UNEXPECTED SUCCESS')

  // 5) 不存在的工具 —— 应报 UNKNOWN_TOOL
  const ghost = await ctx.tools.execute({
    callId: CallId('debug-4'),
    name: 'does-not-exist',
    arguments: {},
    signal: new AbortController().signal,
  })
  console.log('[driver] unknown-tool    =', ghost.isError ? `rejected: ${ghost.error.message}` : 'UNEXPECTED SUCCESS')

  console.log('[driver] done.')
  process.exit(0)
}
