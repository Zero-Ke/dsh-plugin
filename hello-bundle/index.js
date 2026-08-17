// 组合包（bundle）的插件入口：被 profile 里的 patch 行按包名引用。
export const name = 'hello-bundle'

export function apply() {
  console.log('[hello-plugin] plugin loaded from bundle!')
}
