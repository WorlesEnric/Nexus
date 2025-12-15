**Nexus Implementation Specification**

**Nexus Implementation Specification**



Nexus是一个AI辅助的原型创作系统，我们的愿景是所有创意都可以得到最快速的表达，而不会受困于工具泥潭。这是一个现实问题，从网页原型，游戏原型，乃至商业项目的完整项目说明书，我们注意到当前表达一个创意所需的前置工作高得令人望而却步，创意的形成通常是一个明确的逻辑包装在模糊的原型设想中，为了使其他人理解该创意，我们通常需要制作一个原型系统来阐述，然而当前市场的工具生态围绕创作完整产品构建（例如figma，react-native，unity等），学习这些工具的成本超过了大多数人的预算，即便是一个好的创意，在表达创意时遇到的困难也足以使人心灰意冷。生成式AI带来了一点转机，然而普遍的全栈式AI代码生成平台/工具（如cursor，claude code，antigravity等）并不鼓励用户表达创意，完善创意，乃至重构创意，它们工作在实现层，用户通常有一次表达机会，即使用工具之前，此后工具虽然提供了中间步骤的确认选项和文档说明，然而除了全栈工程师之外大部分用户很难阅读它的制品，即使是全栈工程师，在IDE的鼓励下，也常常倾向于选择等一切完成后再审阅，于是创作步骤被表述为了一个refine循环：

创意表达 -> 完整代码生成 -> 查看最终制品 -> 提出修改建议 -> AI assistant refine the product -> 查看最终制品

在实践中我们体验到这个流程的诸多问题，包括但不限于随着修改轮数的增加工程中出现了大量无法维护的补丁，创意表达完全依赖于撰写一个详尽的prompt文档，创意的完整性被流程打破等等。市场上的AI产品常常宣传一种错误的理念，例如一句话生成一个app，一句话生成一部小说，一幅图生成一个视频等等，实际上当用户希望制作一个app/小说/视频时，他的需求非但是一句话/一张图所不能表达的，甚至表达这个需求的工作量可以逼近完整工程的工作量，一个好的创作过程应当从创意中诱导出工程，而非用工程来约束创意。

我们提出Nexus用于解决这一问题，Nexus包含一个图形化工作界面 GraphStudio，一个AI上下文管理内核NexusOS，以及NexusReactor用于高效定义页面样式与逻辑。

GraphStudio是Nexus的用户界面，其基本页面如上图所示，用户在多个工作面板（panel）上表达/优化/迭代创意，上图页面中打开了6个面板，分别是flowchart editor，AI assistant，file browser，source notes，dashboard，以及code editor。注意到所有的panel在Nexus中是同构的，即我们不鼓励用户仍然通过代码编辑的形式实现创意，虽然他可以这样做，但用创意流程图，文档以及对应的ToDo List来表达创意显然更加精准有效。Nexus的核心在于panel是可自制的，我们提供了一些预置的panel用于处理大部分工作，然而用户可以使用现有的panel来设计制作满足其特定需求的panel，例如游戏设计师可以定制一个用于可视化设计游戏叙事的panel，类似于传统游戏编辑器中的叙事节点图，或者在现有panel的功能上进一步定制，实际上Nexus中的所有panel都是由NexusReactor定义的模版，并托管到用户的runtime container中运行。Panels的幂等性还表现在AI context management中，每个panel都向NexusOS开放一组I/O接口用于AI获取context并编辑页面，NexusOS统一向所有panel提供AI服务，于是用户创建的流程图，文档，以及代码等多个模态的数据都处于同一个AI context中，故而编辑任何一个panel，AI会帮你变更其他panel的相关内容。下文分4个部分阐述Nexus的设计，分别是GraphStudio，NexusOS，NexusReactor，以及Integration。



\## GraphStudio



 GraphStudio作为用户使用的主页面，我们需要提供一切网站都需要的能力，例如用户管理，鉴权，订阅管理等。考虑到Nexus通过panel提供服务，我们可以将主页面的服务同样包装为panel提供，具体来说，我们维护GS panel以及Nexus panel，GS panel即GraphStudio暴露的panel，从而将用户账户管理，查看所有可用panel等平台服务提供给用户，为了阐述GraphStudio的核心能力，我们分别介绍User Management，MarketPlace，以及Panels。



\### User Management



用户管理包含用户账户管理和用户在平台中的鉴权策略，用户账户管理即用户的注册/登陆/订阅/资源管理等过程，鉴权则将用户对所有共享资源的权限进行划分。其中注册/登陆仍然是常规实现，我们同样将其封装在panel中，说到底GraphStudio需要在全流程用户体验上向用户传达“Handle everything with panels”的理念。重点看一下订阅，GraphStudio中的用户体验依赖于多维度的资源编排，包含LLM tokens，container service，以及cloud storage service。故而GraphStudio的订阅和传统AI IDE的订阅不同，更像是云服务提供商的订阅机制，即通过选择一系列资源配额来动态计算订阅，所以这里我们讨论Subscription Panel的设计：



\#### Subscription Panel

Subscription Panel应该考虑如下几个维度：



| 维度                            | 说明                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| Token Budget                    | 由于NexusOS会路由不同的模型承载推理需求，故而我们使用统一Nexus token的方式计算用量 |
| Max Panels (inside a workspace) | 由于每个Panel实际上对应于一个active container，这里控制每个用户的container并发数 |
| Cloud Storage                   | 控制用户所有workspace的存储容量                              |

Hint: 以上维度为初步设计，subscription panel可以按需增删



\#### Resource Management

用户的Resource定义为用户在Nexus中所拥有的资源以及其类型，Nexus提供如下的资源：

| 资源           | 说明                                                         |
| -------------- | ------------------------------------------------------------ |
| Workspace      | 用户管理一个项目中的多个panel的单位，只要用户的storage没有耗尽，用户就可以新建workspace，只要用户的working panels数没有耗尽，用户就可以在workspace中添加panel。workspace可以被分享，分享的workspace将创建完全相同的container group，但是会创建一个新的branch。 |
| Panel Template | Nexus用panel template的形式管理所有用户创建（非运行时）的panel，用户可以将panel发布到marketplace，panel有三种类型：”Nexus”, “Free”, “Paid”，其中”Nexus” panel为Nexus官方发布的永久免费panel，用户可以在workspace创建后在marketplace中选择panel并添加 |
| Extensions     | Nexus允许用户开发部署在私有环境上的Extension从而拓展customized panel的边界，例如使用自有的LLM service，或连接本地的数据服务，例如在可视化数据图表时可将panel的数据源定义为一个extension，extensions在template中内嵌，但是需要一个单独的注册表 |
| Token Budget   | Token budget即一个关联在用户ID上的token用量统计与token预算   |



\### Marketplace



Market中发布Nexus创建的和用户创建的Panel和Extension，Market和其他插件市场的构建类似，不过多赘述。



\### Panels



Panels是GraphStudio的核心，这里简要概述Panels的构建和运行逻辑，具体的构建逻辑见NexusReactor，运行逻辑见Integration。Panels是一个独立的Web Page，构建时用户通过声明NXML来构建panel的功能组合，以及（可选的）大致的布局逻辑，随后NXML将被解析为DomTree并由NexusLayoutEngine将其优化为一个具体的RenderTree随后被Hydrated为ReactDom，NXML中还定义了页面中每个组件应有的状态，状态随后被自动构造为MCP bridge以及StateObject，MCP bridge提供panel的原生AI能力，StateObject提供对panel内部操作的版本化追踪。构建完成后我们获得了Panel的代码库，我们需要部署Panel以提供线上服务，为实现这一点，我们实际上为每个用户按照Max Panels配额启动一个小型的container group，container group按照常规云服务编排框架编排，不再赘述。

除了Panel的自身逻辑以外，每个Panel的状态都通过StateObject追踪，我们为每个panel嵌入一个简单的git版本管理子页面，Nexus不支持多人在线协作，但支持通过Panel Git协作，即分享workspace给其他人，我们通过为同一个workspace创建不同分支来存储状态。



\## NexusOS



NexusOS是Nexus处理从大量用户处不同panel传来的AI inference请求的核心。一方面AI服务是Nexus的核心特性，它需要保障来自大量用户的并发LLM请求的响应速度与服务质量，另一方面LLM API bill预计是Nexus最大的成本项，我们必须尝试在保证服务质量的情况下尽可能缩减成本，为了实现这一点，我们在NexusOS中实现了任务的多阶段拆分与流水线成本优化，可以预计一个LLM推理任务的规划与任务dispatch需要最高智能水平，而任务的执行则可以交给更廉价的小型LLM。

另一方面我们使用Nexus Object Graph (NOG) 来在语义层面降低token成本。NOG 是任何项目（即workspace中编辑的项目）的“运行时语义真理（Runtime Semantic Truth）”。Nexus上的任务编排与执行涉及跨panel语义理解，例如在文档panel中同步flowchart panel的内容，每个panel内部任务都需要阅读其他panel的内容，我们提出NOG来用一套knowledge graph来维护所有panel上的状态的语义实体。具体来说，NOG是一个包含实体（Entity）、逻辑（Logic）和视图（View）关系的图谱。当用户请求同步时，NexusOS 不是在两个 Panel 之间直接传话，而是通过 NOG 进行语义转换。Nexus采用Explicit Sync Workflow (显式同步流):

- Manual Trigger: Nexus 不进行自动的跨 Panel 同步。当用户在 Panel A（如 Flowchart）完成修改并点击“Sync”时，NexusOS 更新 NOG 的状态。
- AI Proposal: 随后，NexusOS 根据 NOG 的变更，计算对 Panel B（如 Code Editor）的影响，并生成一个 **Patch (补丁)**。
- Review: 这个 Patch 不会自动应用，而是进入 **"Pending Review"** 状态。用户确认后，Patch 被应用，Panel B 刷新显示。



\## NexusReactor



NexusReactor定义了如下规范：



\### NXML



NXML (Nexus Extensible Markup Language)是一种严格的语义化标记语言。与描述页面外观（div、class）的 HTML 不同，NXML 描述的是页面语义。它有三个相互隔离的命名空间，分别是Data, Logic，View。Data域中定义了页面中的所有数据，View域中通过将数据绑定到组件定义了数据的展示方式，最后Logic域中定义了数据与AI的交互，即工具列表。



如下是一个server monitor的NXML定义，

<NexusPanel id="server-monitor" title="Cluster Health">

   

  <Data>

​    <State name="cpu_load" type="number" default="0" />

​    <State name="status" type="string" default="idle" />

​    <State name="logs" type="list" default="[]" />

  </Data>



  <Logic>

​    <Tool name="restart_node" description="Restarts the target node">

​      <Arg name="force" type="boolean" />

​      <Handler>

​        $state.status = "rebooting";

​        $emit('toast', 'Restart sequence initiated');

​      </Handler>

​    </Tool>

​     

​    <Tool name="filter_logs" description="Filters the log view">

​      <Arg name="level" type="string" />

​      <Handler>

​        $view.setFilter('logs', level);

​      </Handler>

​    </Tool>

  </Logic>



  <View>

​    <Layout strategy="auto">

​      <Metric label="CPU" value="{$state.cpu_load}%" trend="{$state.cpu_load > 80 ? 'down' : 'up'}" />

​      <StatusBadge label="System Status" value="{$state.status}" />

​       

​      <Action label="Emergency Restart" trigger="restart_node" variant="danger" />

​       

​      <LogStream data="{$state.logs}" height="200" />

​    </Layout>

  </View>

</NexusPanel>



这是一个声明的页面，该页面将被解析为Javascript对象树，然后由LayoutEngine进行布局优化



\### LayoutEngine



NXML一般由LLM编写，虽然也可能有专业用户可以手动编写，但是无论如何要保证NXML是一个功能正常的panel，我们需要对布局进行检查与优化，确保panel保持专业的外观。这是一个交互式过程，预置的panel（SVG editor）足以在布局确定前向用户展示布局草图。



\### MCP Bridge



MCP bridge主要处理panel和NexusOS的交互，首先panel注册并启动后将会在用户状态中挂载Logic域中声明的tools (user_id:workspace_id:panel_id:tool_name)，当NexusOS的LLM请求要求调用此工具时，MCP bridge将拦截来自NexusOS的请求并执行Handler标签中的代码。



\### Hydrator



Hydrator将优化后的js对象树转换为React组件：



const ComponentRegistry = {

  'Layout': NexusUI.AutoLayout,

  'Metric': NexusUI.StatCard,

  'Action': NexusUI.Button,

  // ...

};



function NXMLRenderer({ node, stateProxy }) {

  const Component = ComponentRegistry[node.type];

   

  // 1. Resolve Bindings: "{$state.status}" -> "active"

  const resolvedProps = resolveBindings(node.props, stateProxy);

   

  // 2. Resolve Triggers: "restart_node" -> Function

  if (resolvedProps.trigger) {

​    resolvedProps.onClick = () => executeTool(resolvedProps.trigger);

  }



  return (

​    <Component {...resolvedProps}>

​      {node.children.map(child => (

​        <NXMLRenderer node={child} stateProxy={stateProxy} />

​      ))}

​    </Component>

  );

}

![mermaid-diagram-2025-12-13-211951.png](blob:file:///3b8ca589-6587-458a-8197-137b7669e169)





\## Integration 



Nexus的部署与集成是比较复杂的，具体来说，Nexus的后端服务包含四部分内容，Container Service，NexusOS，Data Service，以及Nexus Server。

Container Service 是 Nexus 的动力核心。为了解决传统 Docker 容器在“一用户多 Panel”场景下的资源浪费问题，同时保持对标准容器调度 API 的兼容性，我们采用了 **"Workspace-as-a-Pod, Panel-as-a-Thread"** 的分层调度架构。

1.1 Workspace Isolation (Physical Layer)

**Kubernetes Pod**: 每个用户的活跃 Workspace 对应底层基础设施中的一个 **Pod**。这是资源计费、网络隔离（Network Namespace）和持久化存储挂载（PV Mount）的物理边界。

**Architecture**: Pod 内部署了支持 **Runwasi** (Containerd Shim) 的容器运行时环境。这使得我们可以在 Pod 内启动轻量级的 WebAssembly 进程，同时对上层保持标准的 Docker 接口。

1.2 Panel Orchestration (Logical Layer)

**Docker Compatible API**: 对 NexusOS 的调度器而言，启动一个 Panel 依然是调用标准的 docker run 接口。无需修改调度逻辑，我们只需指定 Runtime Class（如 io.containerd.wasmedge.v1）。

**WasmEdge Runtime**: 在底层，Panel启动一个受沙箱保护的 **WasmEdge 线程**。利用 Wasm 的 Capability-based Security 模型，Panel 代码默认无法访问网络或文件系统，必须通过 NXML 显式声明并获得授权。



Data Service相对而言更复杂一些，数据服务需求如下：

| 组件              | 技术选型                | 功能说明                                                     |
| ----------------- | ----------------------- | ------------------------------------------------------------ |
| Persistence Layer | Git (Embedded)          | "Single Source of Truth"。   用户的 Workspace 本质上是一个 Git 仓库。NXML 定义、源代码、资源引用均在此版本化。   AI 协作流: 当 AI 修改 Panel 时，操作在 Shadow Branch 上进行，形成一个 Pull Request 或 Patch。用户在界面上点击“Accept”本质上是执行 git merge。这确保了用户对项目的绝对控制权。 |
| Runtime State     | NOG Manager (In-Memory) | 运行在 Workspace Pod 内的内存服务。维护项目的语义图谱 (NOG)。它负责计算 Panel 间的语义差异（Diff），是连接 Git 静态文件与 Panel 动态视图的中间层。 |
| Session State     | Redis / KV Store        | 存储 Panel 的临时状态（如滚动条位置、未保存的草稿输入、UI 布局偏好）。这些数据不需要进入 Git 历史，但需在会话间保持。 |
| Knowledge Base    | Vector Database         | 存储项目文档、代码片段和 NOG 子图的向量索引。用于 RAG（检索增强生成），使 NexusOS 能理解项目的长期记忆和上下文。 |



```merma
graph TD
    User[用户] -->|HTTPS| Server[Nexus Server]
    
    subgraph "Infrastructure (K8s Cluster)"
        Server -->|Docker API| PodAgent
        
        subgraph "User Workspace Pod"
            direction TB
            PodAgent[Container Agent / Shim]
            NOG[NOG Manager In-Memory]
            
            subgraph "Wasm Runtime (Panel Instances)"
                P1[Panel: Flowchart]
                P2[Panel: Code Editor]
                P3[Panel: Dashboard]
            end
            
            NOG <-->|1. Semantic Sync| P1 & P2 & P3
            PodAgent -- 2. Spawn (WasmEdge) --> P1 & P2 & P3
        end
        
        Volume[(Persistent Volume)] <--> PodAgent
    end
    
    subgraph "Data Services"
        Volume -- 3. Commit/Patch --> Git[Git Service]
        NOG -- Indexing --> VectorDB[Vector Store]
        ObjectStore[OBS/S3] -- Assets --> Volume
    end
```



\# Implementation





nexus-monorepo/

├── docs/            # [Context Hub] 存放各阶段生成的 Development Document

│  ├── 00_architecture_spec.md # 当前的规范文档

│  ├── 01_protocol_spec.md   # Phase 1 产出的 NXML/NOG 定义

│  └── 02_runtime_api.md    # Phase 2 产出的 Pod 接口定义

├── packages/          # [Shared Libs] 核心逻辑库

│  ├── nexus-protocol/     # [Phase 1] 核心类型定义 (TS Interfaces, Zod Schemas)

│  ├── nexus-reactor/     # [Phase 1] NXML Parser, Validator, Renderer (React)

│  └── mcp-bridge/       # [Phase 2] Wasm Panel 内部使用的 SDK

├── runtime/          # [Infrastructure] 运行在 K8s Pod 内部的组件

│  ├── workspace-kernel/    # [Phase 3] Go/Rust 守护进程 (NOG Manager, Git Ops)

│  ├── images/         # [Phase 2] Dockerfile (含 WasmEdge, Kernel)

│  └── k8s/          # Helm Charts

├── services/          # [Backend] 中心化后端

│  ├── nexus-server/      # [Phase 4] 平台 API (Auth, Billing, Pod Mgmt)

│  └── nexus-os/        # [Phase 5] AI 服务 (Prompt Engineering, RAG)

└── apps/            # [Frontend]

  └── graph-studio/      # [Phase 4] Next.js 主界面



**Phase 1: The Semantics**

**目标**: 定义 Nexus 的“物理定律”。不写任何后端，只实现 NXML 的解析与静态渲染。

- **输入 Context**: NXML 规范章节 + Server Monitor 示例。
- **核心任务**:
  1. packages/nexus-protocol: 定义 NXML 的 TypeScript 接口 (NexusPanel, LogicTool, ViewNode) 和 NOG 图谱结构。
  2. packages/nexus-reactor: 实现 parse(xml_string) 返回 AST，以及 validate(ast)。
  3. packages/nexus-reactor: 实现 <NXMLRenderer /> React 组件，将 AST 映射为 UI。
- **Handoff Artifact**:
  1. 01_protocol_spec.md: 包含完整的 AST JSON 结构定义。这是后续所有组件通信的通用语言。

**Phase 2: The Runtime Foundation**

**目标**: 构建“能跑 Wasm 的 Docker 环境”。

- **输入 Context**: 01_protocol_spec.md (了解需要运行什么), Integration 章节 (Docker/Runwasi)。
- **核心任务**:
  1. runtime/images: 编写 Dockerfile，集成 containerd, runwasi, git。
  2. runtime/workspace-kernel: 编写一个极简的 HTTP Server (Go/Rust)，实现 POST /spawn，调用 Docker Socket 启动 Wasm 进程。
- **Handoff Artifact**:
  1. 02_runtime_api.md: 定义 Kernel 的 HTTP 接口（如何启动 Panel，如何读写文件）。

**Phase 3: The State Engine (状态与存储)**

**目标**: Git + NOG。

- **输入 Context**: 01_protocol_spec.md (NOG 结构), 02_runtime_api.md (API 框架)。
- **核心任务**:
  1. runtime/workspace-kernel: 实现 **Git Service** (init, commit, branch)。
  2. runtime/workspace-kernel: 实现 **NOG Manager** (内存中维护 Phase 1 定义的 Graph)。
  3. 实现 **Explicit Sync**: 接收 Patch -> 更新内存 NOG -> 写入 Git。
- **Handoff Artifact (输出文档)**:
  1. 03_kernel_full_api.md: 包含状态同步 WebSocket 协议和 Git 操作接口。

**Phase 4: The Platform (GraphStudio UI)**

**目标**: 构建用户界面，连接 Phase 3 的 Kernel。

- **输入 Context**: GraphStudio 设计图, 01_protocol_spec.md (Renderer), 03_kernel_full_api.md (API)。
- **核心任务**:
  1. apps/graph-studio: 实现 Next.js 应用框架，多 Panel 布局系统。
  2. 集成 Phase 1 的 NXMLRenderer。
  3. 实现 WebSocket 客户端，与 Kernel 同步 NOG 状态。
- **Handoff Artifact (输出文档)**:
  1. 04_ui_component_tree.md: 前端组件结构与状态流。

**Phase 5: The Intelligence (NexusOS AI)**

**目标**: 接入 LLM，实现 Shadow Branch 审批流。

- **输入 Context**: 01_protocol_spec.md (语义理解), 03_kernel_full_api.md (Git 操作)。
- **核心任务**:
  1. services/nexus-os: 实现 Context Builder (NOG -> Prompt)。
  2. 实现 **Proposal Pipeline**: User Request -> AI Patch -> Shadow Branch -> UI Diff。