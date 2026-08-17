# DeepSeek Harness 插件开发教程：从零实现一个自定义插件

> 本教程带你从零实现一个可运行的 Harness 自定义插件：一个加载时打印问候语的 `hello-plugin`，一个给模型注册 `greet` 工具的 `greet-tool`，最后把它打包成可安装的组合包（bundle）。
>
> 配套的完整可运行示例已经放在本目录下：
>
> ```
> dsh-test/
> ├── my-plugin/          # 通过 --patch 直接加载的本地插件
> │   ├── package.json
> │   ├── cordis.yml      # --patch overlay
> │   ├── debug/          # 最小 Cordis 组合（单独调试，见 §7）
> │   │   ├── cordis.yml
> │   │   └── driver.ts
> │   └── src/
> │       ├── hello.ts    # 插件 1：函数形式 + 配置
> │       └── greet.ts    # 插件 2：工具注册（defineTool）
> ├── hello-bundle/       # 进阶：打包成组合包（bundle）
> │   ├── package.json
> │   ├── index.js
> │   └── cordis.patch.yml
> ├── node_modules/       # 指向 Harness 的 @deepseek-ai/* 符号链接（见 §3）
> └── TUTORIAL.md         # 本教程
> ```

## 目录

1. [前置准备](#1-前置准备)
2. [插件是什么](#2-插件是什么)
3. [第一个插件：hello-plugin（函数形式 + 配置）](#3-第一个插件hello-plugin函数形式--配置)
4. [让插件能被加载：--patch overlay](#4-让插件能被加载--patch-overlay)
5. [给模型注册一个工具：greet-tool](#5-给模型注册一个工具greet-tool)
6. [生命周期、依赖与三种形态](#6-生命周期依赖与三种形态)
7. [单独调试插件（不启动 Web 应用）](#7-单独调试插件不启动-web-应用)
8. [进阶：打包成组合包（bundle）并安装到 profile](#8-进阶打包成组合包bundle并安装到-profile)
9. [常见问题（FAQ）](#9-常见问题faq)
10. [官方参考文档](#10-官方参考文档)

---

## 1. 前置准备

本教程假设你已经有一个**从源码运行**的 DeepSeek Harness 仓库检出，并且能启动 Web UI。本机路径为 `/Users/tanhuaze/code/deepseek-harness`，下文简称"仓库根目录"。

要求：

- Node.js `^22.19.0 || >=24.0.0`，pnpm `11.x`（与仓库 `package.json` 的 engines 一致）；
- 仓库已 `pnpm install`，且构建产物存在（各包的 `lib/` 目录，`pnpm run build` 生成）；
- 能正常执行 `pnpm dsh web`。

> 验证：在仓库根目录执行 `node --version` 与 `pnpm dsh web --dump-config`，能看到组合后的配置树即表示环境可用。

---

## 2. 插件是什么

DeepSeek Harness 的核心理念是**一切皆插件**（微内核架构）。核心只有极少数抽象服务（`ctx.tools`、`ctx.llm`、`ctx.agents`……）和一个循环插件，所有产品功能——工具、LLM 适配器、文件访问、Web UI、agent 循环本身——都是挂载在共享 `ctx` 上的插件。

**一个插件就是一个导出 `apply` 函数的 TypeScript 模块**。框架加载时调用 `apply(ctx, config)`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'        // 可选：诊断用的显示名

export function apply(ctx: Context) {
  // 通过 ctx 注册能力：事件监听、工具、定时器……
}
```

插件通过 `ctx` 注册的一切都是 **effect（效果）**：插件卸载时框架自动清理，不需要手动 `removeListener` 或 `clearInterval`。

`ctx` 上的服务是具名的能力。插件要使用某个服务（如 `tools`），就在模块上声明 `inject`，Cordis 会保证依赖服务就绪后才调用 `apply`——加载顺序由依赖决定，与 `cordis.yml` 里的书写顺序无关。

---

## 3. 第一个插件：hello-plugin（函数形式 + 配置）

创建项目目录：

```sh
mkdir -p my-plugin/src
```

### 3.1 插件本体

`my-plugin/src/hello.ts`：

```ts
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
// 并填充未提供字段的默认值。
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello, world!'),
  loud: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  const message = config.loud ? config.greeting.toUpperCase() : config.greeting
  console.log(`[hello-plugin] ${message}`)
}
```

要点：

- **`import type`** 只是类型导入，编译后被擦除，不产生运行时依赖；
- **`Config` 必须同时导出类型和同名 Schema 常量**（Schemastery）。插件加载时 Cordis 用它校验 `cordis.yml` 里的 `config`，并填充默认值。不要导出普通对象作为 `Config`——它不满足 Cordis 要求的 Standard Schema 接口；
- Harness 的约定是**可调参数都要做成配置字段**：检验标准是"能否在 `cordis.yml` 中改变这个值而无需改代码"。

### 3.2 一个最小项目声明

`my-plugin/package.json`（`--patch` 加载不强制要求，但让编辑器/pnpm 更友好）：

```json
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

---

## 4. 让插件能被加载：--patch overlay

### 4.1 编写 overlay

`my-plugin/cordis.yml`：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/my-plugin/src/hello.ts'
```

- `insert` 向组合树中**插入**新行；按 `id` 覆盖已有行则直接写 `- id: <行id>`；
- **`name` 必须是绝对路径**：patch 只贡献配置，不会改变 loader 解析模块路径时使用的 profile 目录；
- 配置放在行内 `config:` 下（取消注释即可生效）：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/my-plugin/src/hello.ts'
      config:
        greeting: 'Hi there'
        loud: true
```

### 4.2 让 `@deepseek-ai/*` 可以被解析（关键一步）

插件的运行时导入（本示例里的 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`）由 Node 从**插件文件所在位置**向上逐级查找 `node_modules` 解析。

官方教程把 `scratch-plugin` 放在**仓库根目录内**，这样查找会命中仓库的 `node_modules`。如果插件放在仓库之外（比如本示例的 `dsh-test/`），就需要手动搭一座桥——在项目根建一个 `node_modules/@deepseek-ai/` 目录，用符号链接指向仓库里的包：

```sh
mkdir -p node_modules/@deepseek-ai
ln -s /Users/tanhuaze/code/deepseek-harness/vendor/cordis                node_modules/@deepseek-ai/cordis
ln -s /Users/tanhuaze/code/deepseek-harness/vendor/schemastery          node_modules/@deepseek-ai/schemastery
ln -s /Users/tanhuaze/code/deepseek-harness/packages/core/tools         node_modules/@deepseek-ai/dsh-tools
```

Node 默认对符号链接解析 `realpath`，所以 `dsh-tools` 的传递依赖会从它真实所在位置（`packages/core/tools/node_modules/`）正常解析。需要哪个包就链接哪个；`dsh-tools` 引入后，最常用的是 `cordis`、`schemastery`、`dsh-tools` 三个。

### 4.3 启动并观察

在仓库根目录执行：

```sh
pnpm dsh web --patch /Users/tanhuaze/code/dsh-test/my-plugin/cordis.yml
```

打开 `http://127.0.0.1:3080`。启动期间终端会打印：

```
[hello-plugin] Hello, world!
```

配置变更会触发插件**热替换**（HMR）：框架卸载旧实例、加载新实例，旧实例的注册全部自动清理。注意 HMR 只监听 profile 层与 home 层的 `cordis.patch.yml`；对 `--patch` overlay 的修改需要重启生效。

> 若 3080 已被占用，可在 overlay 里加一行钉住端口：
>
> ```yaml
> - id: webserver
>   config:
>     host: 127.0.0.1
>     port: 3081
> ```

**不想启动服务器？可以只做模块级冒烟验证**（本示例附带了脚本 `.verify/check-imports.ts`，用假 `ctx` 调用两个插件的 `apply`，验证模块解析、Config schema 默认值与 `defineTool` 注册）：

```sh
node --import tsx/esm /absolute/path/to/dsh-test/.verify/check-imports.ts
# 关键输出：
# [hello-plugin] Hello, world!
# registered tool = greet
# OK: both plugins import and apply() successfully
```

---

## 5. 给模型注册一个工具：greet-tool

工具（tool）是模型可以直接调用并拿到结果的能力。工具插件在 `ctx.tools` 上注册，用 `@deepseek-ai/dsh-tools` 的 `defineTool` 定义。

`my-plugin/src/greet.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

// 插件的 Config：控制"你好"时自我介绍的返回值，可在 cordis.yml 里覆盖。
export interface Config {
  /** "你好"时自我介绍的主体文案（以 DSH 身份口吻）。 */
  introText: string
  /** 创建者署名，例如 "谭华泽"；留空则不显示创建者。 */
  creator: string
}

export const Config: Schema<Config> = Schema.object({
  introText: Schema.string().default('我是 DSH（DeepSeek Harness），一个基于 DeepSeek 的智能编程助手，可以帮你编写、调试代码，分析项目并执行各种自动化任务'),
  creator: Schema.string().default('谭华泽'),
})

export function apply(ctx: Context, config: Config) {
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
      name: {
        type: 'string',
        required: true,
        description: '要问候的人名，从用户的话中提取（"和 Ada 打个招呼" → "Ada"）；用户未指定对象（如只说"你好"）时填"你"。',
      },
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
      const greeting = `Hello, ${args.name}${args.punctuation ?? '!'}`
      // introduce=true（"你好"场景）：以 DSH 身份自我介绍，内容由插件 Config 控制。
      return args.introduce
        ? `${greeting}\n\n${config.introText}${config.creator ? `，由 ${config.creator} 创建。` : '。'}`
        : greeting
    },
  }))
}
```

`defineTool` 各字段：

| 字段 | 作用 |
|---|---|
| `name` / `description` | 发送给模型的工具名与说明（名称必须全局唯一，`run_code` 等保留名不可用）。**`description` 是模型决定"何时调用"的唯一依据**，务必写清楚触发场景与参数来源 |
| `parameters` | "属性 schema"：每项 `{ type, required?, description?, default?, enum? }`，编译成 JSON Schema，并在 `execute` 前校验、推导出类型安全的 `args` |
| `output.schema` | 规范化返回值的 JSON Schema，对每次成功执行的结果强制校验 |
| `output.render` | 把规范值 `value` 转成模型可见的内容块 `ContentBlock[]`（如 `{ type: 'text', text }`） |
| `execute(args, exec)` | 工具体，返回符合 `output.schema` 的规范值；`exec` 携带调用方、取消信号等 |

把 greet-tool 也加入 overlay：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/my-plugin/src/hello.ts'
    - id: greet-tool
      name: '/absolute/path/to/my-plugin/src/greet.ts'
```

重启后，在 Web UI 中输入（中英文都行）：

> 和 Ada 打个招呼
> Use the greet tool to greet Ada.

模型会调用 `greet`，并收到 `Hello, Ada!` 的工具结果。

再输入：

> 你好

模型会调用 `greet` 并设置 `introduce=true`（name 填"你"），返回问候语 + 以 DSH 身份自我介绍（文案由插件 `Config` 的 `introText` / `creator` 控制，可在 `cordis.yml` 里自定义，例如"由 谭华泽 创建"）。最小组合（§7）里模拟的就是这个场景，可以直接看到返回内容。

**模型是怎么"听懂"自然语言的？** 每次请求时，框架把注册的工具经 `ctx.tools.schemas()` 投影成 `{ name, description, parameters }` 三元组，随系统提示词一起发给模型（§7 的最小组合会打印出模型看到的原始描述）。模型读描述、对照用户的话，自行决定调不调用、参数填什么——全程不需要你写任何"意图识别"代码。想让模型更愿意调用，就优化 `description`：写清触发词、写清参数从哪提取、必要时用 `enum` 限定取值。

---

## 6. 生命周期、依赖与三种形态

### 6.1 手动清理资源：ctx.effect()

通过 `ctx` 注册的一切会自动清理。自己管理的资源（网络连接、原生定时器……）用 `ctx.effect()` 告诉框架怎么清理：

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => console.log('heartbeat'), 5000)
    return () => clearInterval(timer)   // 插件卸载时执行
  })
}
```

### 6.2 三种形态

**函数形式**（最常见，本教程的写法）：

```ts
export const name = 'my-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(/* ... */)
}
```

**对象形式**：

```ts
export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

**类形式**（插件要**向其他插件提供服务**时使用——`super(ctx, 'myService')` 把实例注册为 `ctx.myService`）：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
  }
}
```

### 6.3 inject 与 PENDING

`inject: ['tools']` 声明硬依赖。如果声明的服务没有任何插件提供，插件会一直停在 **PENDING** 状态——不报错、不打印。排查"插件什么都没打印"时，检查其 fiber 状态（PENDING 是合法状态，提供方可能稍后挂载）。

---

## 7. 单独调试插件（不启动 Web 应用）

`--patch` 加载要重启整个 Web 应用才能看到效果。想快速迭代或复现某个调用，有三种"单独调试"方式，按隔离程度递增。

### 7.1 单元级：假 ctx 直接调用（最快）

插件模块本身只是导出 `apply` 的函数，可以用**假 ctx** 直接调用，完全不启动框架。本示例的 `.verify/check-imports.ts` 就是这么做冒烟验证的。想测工具逻辑，把注册到的定义捕获下来直接调 `execute`：

```ts
// debug-unit.ts —— 放在 dsh-test 根目录
import { apply as greetApply } from './my-plugin/src/greet.ts'

let def: { execute(args: unknown, exec: unknown): Promise<unknown> } | undefined
greetApply({ tools: { register(d: typeof def) { def = d; return () => {} } } } as never)

const value = await def!.execute({ name: 'Ada', punctuation: '?' }, {} as never)
console.log('value =', value)   // Hello, Ada?
```

优点：毫秒级、无任何依赖、可随意跑参数组合；缺点：不经过 `inject`、事件管线、schema 校验（`defineTool` 自带校验仍在）。

### 7.2 组合级：最小 Cordis 组合（推荐）

用 vendored Cordis 的启动器挂一个**最小插件树**：真实依赖注入 + 完整工具执行管线，但没有 Web 应用、没有模型、没有 API key。示例在 `my-plugin/debug/`：

```
my-plugin/debug/
├── cordis.yml    # 最小组合：invariants ← system-prompt ← tools ← greet.ts / driver.ts
└── driver.ts     # 调试驱动：列出工具、走 ctx.tools.execute() 完整管线
```

`driver.ts` 里 `inject: ['tools']` 保证真实依赖就绪；`ctx.tools.execute()` 是生产同款管线入口（参数校验 → `tools/pre-execute` → 工具体 → `tools/post-execute` → 结果物化），可以验证正常调用、默认值、缺参拒绝、未知工具等场景。

**前置：补几个符号链接**（§4.2 的三个只够 `--patch` 加载；最小组合还需要 Loader、Include 和 tools 的依赖链。**链接名必须与包名完全一致**——例如 `@deepseek-ai/dsh-invariants` 对应目录名 `dsh-invariants`，写成 `invariants` 会报 `ERR_MODULE_NOT_FOUND`）：

```sh
cd node_modules/@deepseek-ai
ln -s <repo>/packages/runtime-diagnostics/invariants dsh-invariants
ln -s <repo>/packages/core/system-prompt            dsh-system-prompt
ln -s <repo>/packages/llm/llm                       dsh-llm
ln -s <repo>/vendor/loader                          cordis-plugin-loader
ln -s <repo>/vendor/include                         cordis-plugin-include
# 再加 tsx（--import 从 CWD 解析包）
ln -s <repo>/node_modules/tsx ../tsx
```

运行：

```sh
cd my-plugin/debug
node --import tsx <repo>/vendor/cordis/bin.js
```

预期输出（含 greet.ts 里的调试日志；`schemas` 段就是模型每次请求看到的工具描述）：

```
[greet-tool] apply: registering greet tool...
[greet-tool] greet tool registered.
[driver] registered tools: greet
[driver] --- 模型看到的工具描述（schemas）---
{
  "name": "greet",
  "description": "向指定的人打一个友好的招呼，返回一句问候语。当用户表达\"问候 / 打招呼 ...\"时调用本工具；...",
  "parameters": { "type": "object", "properties": { "name": { "type": "string", ... } }, "required": ["name"] }
}
[driver] --- 模型看到的工具描述（end）---
[greet-tool] execute called: name="Ada" punctuation="!"
[greet-tool] execute returning: "Hello, Ada!"
[driver] ok.value        = "Hello, Ada!"
[driver] ok.content      = [{"type":"text","text":"Hello, Ada!"}]
[driver] invalid-args    = rejected: invalid arguments: missing required property "name"
[driver] unknown-tool    = rejected: unknown tool "does-not-exist"
```

### 7.3 断点级：Node Inspector

`console.log` 不够用时，用 Node 调试器打断点。tsx 提供 source map，`.ts` 源码可以直接断点。

对最小组合（`--inspect-brk` 会等调试器附加后再执行）：

```sh
cd my-plugin/debug
node --import tsx --inspect-brk <repo>/vendor/cordis/bin.js
# 然后 Chrome 打开 chrome://inspect → Inspect
```

对运行中的 `dsh web`（注意别用 `pnpm dsh`，pnpm 不转发 node flags）：

```sh
# 仓库根目录
node --import tsx/esm --inspect=9229 apps/cli/src/bin.ts web --patch /abs/path/my-plugin/cordis.yml
```

---

## 8. 进阶：打包成组合包（bundle）并安装到 profile

`--patch` 适合开发期；交付给其他用户使用，要打包成**组合包（bundle）**并通过 `dsh plugin` 安装进一个 **profile**。

两个概念：

- **组合包** = 附带一个配置层的 npm 包。manifest 在 `dsh.bundle` 键下，回答"这个包贡献什么？"——一个插入/覆盖插件行的 patch 文件；
- **profile** = `$DSH_HOME/profiles/<name>` 下的一个可启动组合目录，manifest 在 `dsh.profile` 键下，回答"由哪些组合包按什么顺序组成？"。

### 8.1 组合包的文件结构

```
hello-bundle/
├── package.json         # 声明 dsh.bundle
├── index.js             # 插件模块（被 patch 行按包名引用）
└── cordis.patch.yml     # 安装后自动激活的配置层
```

`hello-bundle/package.json`：

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`hello-bundle/index.js`：

```js
export const name = 'hello-bundle'

export function apply() {
  console.log('[hello-plugin] plugin loaded from bundle!')
}
```

`hello-bundle/cordis.patch.yml`——插件行按**包名**（而非绝对路径）引用，Node 的模块解析会找到已安装的代码：

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

### 8.2 安装进 profile

```sh
# 在 deepseek-harness 仓库根目录
pnpm dsh plugin --profile demo add /absolute/path/to/hello-bundle
```

首次使用会初始化 `demo` profile（`@deepseek-ai/dsh-base` 作为第一个组合包），pnpm 链接该目录，`dsh` 把 `dsh-hello-plugin` 追加进 `dsh.profile.bundles`。先验证层、再启动：

```sh
pnpm dsh --profile demo --dump-config   # 应看到 "# == dsh-hello-plugin" 层
pnpm dsh --profile demo
```

`pnpm dsh plugin --profile demo remove dsh-hello-plugin` 同时移除依赖与对应层。

### 8.3 生效配置的层顺序

在空根之上按顺序组合，后应用的层按行胜出（patch **整行替换**目标行的 `config`，不做键级深合并）：

1. profile `dsh.profile.bundles` 所列组合包的 patch，按列表顺序；
2. profile 自己的 `cordis.patch.yml`；
3. home 级 `$DSH_HOME/cordis.patch.yml`（机器本地偏好）；
4. 每个 `--patch` overlay，按 argv 顺序。

推论：你的 patch 可以按 `id` 覆盖前面各层的行，但必须**重述该行需要的每一个键**；用户也可以在自己的 profile 层覆盖你的行，所以尽量给出用户大概率会保留的默认值。

### 8.4 分发形态

- **发布到 npm**：`pnpm publish` 时构建好 `lib/`，用户 `dsh plugin add your-package` 直接安装预构建代码；
- **tarball**：`pnpm pack` 后 `dsh plugin add ./your-package-0.1.0.tgz`；
- **从 git 安装**：`dsh plugin add github:you/hello-plugin`——但 git 安装拉的是**源码**，没有任何环节运行 `build`，所以作者必须提供自包含的 `prepare` 脚本（如 tsdown 直接转译 `src/`），且用户需在 profile 的 `pnpm-workspace.yaml` 里显式授权构建（`allowBuilds`）。**这项授权等于允许该包代码在安装时于你的机器上执行**，只对源码可信的包授权，并锁定 commit。

---

## 9. 常见问题（FAQ）

**Q: 插件什么都没打印？**
先看是不是停在 PENDING：`inject` 声明的服务没人提供（如只 `inject: ['tools']` 却没加载 tools 提供方）。PENDING 是合法状态，不报错。

**Q: `Cannot find package '@deepseek-ai/dsh-tools'`？**
运行时导入的 `@deepseek-ai/*` 从插件文件所在位置向上查找。插件在仓库外时，按 §4.2 建 `node_modules/@deepseek-ai/` 符号链接；或干脆把插件目录放进仓库根目录。

**Q: 符号链接建了还是 `ERR_MODULE_NOT_FOUND`？**
链接名必须与**包名完全一致**：`@deepseek-ai/dsh-invariants` 对应目录名 `dsh-invariants`（不是 `invariants`）。Node 按目录名找包，目录名与包名不一致就找不到。用 `NODE_DEBUG=module node 你的脚本` 可以打印 Node 实际查找的路径列表，一眼看出问题。

**Q: 端口冲突 / 我想用别的端口？**
3080 是默认。在 overlay 里按 `id: webserver` 覆盖端口（见 §4.3）。

**Q: 改了 config 没生效？**
先确认改的是"行内 `config:`"。另外 patch 是**整行替换**：覆盖一行时必须重述它需要的全部键。

**Q: 启动时报 `EPERM ... /Users/<你>/.dsh/...`？**
CLI 每次启动会"修复/规范化" profile 文件（写 `$DSH_HOME`）。开发期想完全隔离，可以把 `DSH_HOME` 指向项目内目录：

```sh
DSH_HOME=/absolute/path/to/dsh-test/.dsh-home pnpm dsh web --patch ...
```

**Q: 工具没出现在模型可用的列表里？**
`ctx.tools.register` 的注册是 effect：确认插件真的处于 ACTIVE（不是 PENDING），并确认没有同名工具冲突（`run_code` 等保留名不可用）。

---

## 10. 官方参考文档

- [第一个插件（官方教程）](../../deepseek-harness/docs/user/develop/basic/index.zh.md)
- [开发一个工具](../../deepseek-harness/docs/user/develop/basic/tool.zh.md)
- [插件配置](../../deepseek-harness/docs/user/develop/basic/config.zh.md)
- [打包与安装插件](../../deepseek-harness/docs/user/develop/basic/publish.zh.md)
- [Cordis 框架教程](../../deepseek-harness/docs/cordis-tutorial/index.zh.md)
- [实操手册：扩展插件形态](../../deepseek-harness/docs/cookbook/extension-cookbook.zh.md)
- [添加工具 cookbook](../../deepseek-harness/docs/cookbook/adding-a-tool.zh.md)
- [CLI 行为参考](../../deepseek-harness/apps/cli/reference/README.zh.md)
- [工具目录（tool catalog）](../../deepseek-harness/docs/tool-catalog.zh.md)
