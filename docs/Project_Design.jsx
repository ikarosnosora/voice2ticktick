import { useState } from "react";

const COLORS = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surfaceHover: "#1a1a26",
  border: "#2a2a3a",
  borderActive: "#4a4a6a",
  text: "#e8e8f0",
  textMuted: "#8888a0",
  textDim: "#55556a",
  accent: "#6c5ce7",
  accentGlow: "rgba(108,92,231,0.15)",
  green: "#00b894",
  greenGlow: "rgba(0,184,148,0.12)",
  orange: "#fdcb6e",
  orangeGlow: "rgba(253,203,110,0.12)",
  blue: "#74b9ff",
  blueGlow: "rgba(116,185,255,0.12)",
  pink: "#fd79a8",
  pinkGlow: "rgba(253,121,168,0.12)",
};

const PhaseLabel = ({ number, title, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        color: COLORS.bg,
        flexShrink: 0,
      }}
    >
      {number}
    </div>
    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: "0.02em" }}>
      {title}
    </span>
  </div>
);

const Box = ({ icon, label, sublabel, color, glow, children, wide, style }) => (
  <div
    style={{
      background: COLORS.surface,
      border: `1px solid ${color}33`,
      borderRadius: 12,
      padding: "16px 18px",
      position: "relative",
      overflow: "hidden",
      width: wide ? "100%" : "auto",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.6,
      }}
    />
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: children ? 10 : 0 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{sublabel}</div>
        )}
      </div>
    </div>
    {children}
  </div>
);

const DataFlow = ({ from, to, color }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "6px 0",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        background: `${color}11`,
        borderRadius: 20,
        border: `1px solid ${color}22`,
      }}
    >
      <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace" }}>{from}</span>
      <span style={{ color, fontSize: 14 }}>→</span>
      <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace" }}>{to}</span>
    </div>
  </div>
);

const CodeBlock = ({ code, color }) => (
  <div
    style={{
      background: "#08080e",
      borderRadius: 8,
      padding: "10px 12px",
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontSize: 11,
      lineHeight: 1.6,
      color: COLORS.textMuted,
      border: `1px solid ${color}15`,
      overflowX: "auto",
      whiteSpace: "pre",
    }}
  >
    {code}
  </div>
);

const Arrow = ({ direction = "down", color = COLORS.textDim, label }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: direction === "down" ? "8px 0" : "0 8px",
      gap: 4,
    }}
  >
    {label && (
      <span
        style={{
          fontSize: 10,
          color: COLORS.textMuted,
          fontFamily: "monospace",
          background: COLORS.surface,
          padding: "2px 8px",
          borderRadius: 4,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {label}
      </span>
    )}
    <svg width={direction === "down" ? 20 : 40} height={direction === "down" ? 28 : 20}>
      {direction === "down" ? (
        <>
          <line x1="10" y1="0" x2="10" y2="22" stroke={color} strokeWidth="1.5" strokeDasharray="3,3" />
          <polygon points="5,20 10,28 15,20" fill={color} />
        </>
      ) : (
        <>
          <line x1="0" y1="10" x2="34" y2="10" stroke={color} strokeWidth="1.5" strokeDasharray="3,3" />
          <polygon points="32,5 40,10 32,15" fill={color} />
        </>
      )}
    </svg>
  </div>
);

const Section = ({ children, style }) => (
  <div
    style={{
      background: `${COLORS.surface}88`,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 16,
      padding: 20,
      ...style,
    }}
  >
    {children}
  </div>
);

const tabs = [
  { id: "overview", label: "整体架构" },
  { id: "shortcut", label: "iOS Shortcut" },
  { id: "worker", label: "CF Worker" },
  { id: "data", label: "数据流" },
  { id: "setup", label: "初始化" },
];

export default function Architecture() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        minHeight: "100vh",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "32px 24px",
      }}
    >
      {/* Header */}
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLORS.accent,
              background: COLORS.accentGlow,
              padding: "4px 10px",
              borderRadius: 4,
            }}
          >
            System Architecture
          </span>
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            margin: "12px 0 6px",
            letterSpacing: "-0.02em",
            background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accent})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Voice → AI → TickTick
        </h1>
        <p style={{ fontSize: 13, color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
          Action Button 语音输入 → LLM 自然语言解析 → TickTick 自动创建任务
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 24,
            marginBottom: 28,
            padding: 4,
            background: COLORS.surface,
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                border: "none",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? COLORS.text : COLORS.textMuted,
                background: activeTab === tab.id ? COLORS.accentGlow : "transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Phase 1 */}
            <Section>
              <PhaseLabel number="1" title="输入层 — iPhone" color={COLORS.orange} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Box icon="🔘" label="Action Button" sublabel="长按触发" color={COLORS.orange} style={{ flex: 1, minWidth: 140 }} />
                <Box icon="🎙️" label="Dictate Text" sublabel="系统语音识别" color={COLORS.orange} style={{ flex: 1, minWidth: 140 }} />
                <Box icon="📤" label="HTTP POST" sublabel="Get Contents of URL" color={COLORS.orange} style={{ flex: 1, minWidth: 140 }} />
              </div>
            </Section>

            <Arrow color={COLORS.orange} label='POST {"text": "明天3点review设计"}' />

            {/* Phase 2 */}
            <Section>
              <PhaseLabel number="2" title="处理层 — Cloudflare Worker" color={COLORS.accent} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Box icon="⚡" label="Edge Function" sublabel="wrangler deploy" color={COLORS.accent} style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: COLORS.green, fontSize: 8 }}>●</span> 接收原始语音文本
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: COLORS.green, fontSize: 8 }}>●</span> 调用 Anthropic API 解析
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: COLORS.green, fontSize: 8 }}>●</span> 调用 TickTick API 创建
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: COLORS.green, fontSize: 8 }}>●</span> 返回结果给 Shortcuts
                    </div>
                  </div>
                </Box>
                <Box icon="🗄️" label="Cloudflare KV" sublabel="Token 持久化" color={COLORS.accent} style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>• access_token</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>• refresh_token</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>• project_list 缓存</div>
                  </div>
                </Box>
              </div>
            </Section>

            {/* Phase 3 - External APIs */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <Arrow color={COLORS.blue} label="LLM 解析请求" />
                <Section>
                  <PhaseLabel number="3a" title="AI 层 — Anthropic API" color={COLORS.blue} />
                  <Box icon="🧠" label="Claude Sonnet" sublabel="自然语言 → 结构化 JSON" color={COLORS.blue} wide>
                    <CodeBlock
                      color={COLORS.blue}
                      code={`输入: "明天下午3点review PBA\n      benchmark设计 重要"\n输出: {\n  title, dueDate, priority,\n  projectId, tags\n}`}
                    />
                  </Box>
                </Section>
              </div>
              <div style={{ flex: 1, minWidth: 250 }}>
                <Arrow color={COLORS.green} label="POST /open/v1/task" />
                <Section>
                  <PhaseLabel number="3b" title="存储层 — TickTick API" color={COLORS.green} />
                  <Box icon="✅" label="Open API v1" sublabel="OAuth 2.0 · REST" color={COLORS.green} wide>
                    <CodeBlock
                      color={COLORS.green}
                      code={`POST /task\nAuth: Bearer {token}\nScopes: tasks:read,\n        tasks:write`}
                    />
                  </Box>
                </Section>
              </div>
            </div>

            <Arrow color={COLORS.green} label='{"id":"xxx", "title":"Review PBA..."}' />

            {/* Phase 4 */}
            <Section>
              <PhaseLabel number="4" title="反馈层 — iPhone" color={COLORS.pink} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Box icon="📳" label="Haptic Feedback" sublabel="触觉确认" color={COLORS.pink} style={{ flex: 1, minWidth: 140 }} />
                <Box icon="🔔" label="Notification" sublabel="显示任务标题" color={COLORS.pink} style={{ flex: 1, minWidth: 140 }} />
                <Box icon="🗣️" label="Speak Text" sublabel="可选：语音播报确认" color={COLORS.pink} style={{ flex: 1, minWidth: 140 }} />
              </div>
            </Section>

            {/* Timing */}
            <div
              style={{
                marginTop: 12,
                padding: "12px 16px",
                background: `${COLORS.accent}08`,
                borderRadius: 10,
                border: `1px solid ${COLORS.accent}20`,
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                <span style={{ color: COLORS.accent, fontWeight: 600 }}>⏱ 总延迟估算</span>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  ["语音识别", "~1-3s"],
                  ["LLM 解析", "~0.5-1s"],
                  ["TickTick API", "~0.3s"],
                  ["总计", "~2-4s"],
                ].map(([label, time]) => (
                  <div key={label} style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {label}: <span style={{ color: COLORS.text, fontWeight: 600 }}>{time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* iOS Shortcut Tab */}
        {activeTab === "shortcut" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Section>
              <PhaseLabel number="⚙️" title="iOS Shortcut 完整步骤" color={COLORS.orange} />
              {[
                {
                  step: 1,
                  action: "Dictate Text",
                  config: 'Language: Auto\nStop Listening: After Pause\n→ 输出变量: "Spoken"',
                  note: "Action Button 触发后立即进入听写模式",
                },
                {
                  step: 2,
                  action: "URL",
                  config: "https://your-worker.workers.dev/api/task",
                  note: "你的 Cloudflare Worker 地址",
                },
                {
                  step: 3,
                  action: "Get Contents of URL",
                  config: 'Method: POST\nHeaders:\n  Content-Type: application/json\n  X-Auth-Key: {your-secret}\nBody (JSON):\n  { "text": Spoken }',
                  note: "把语音文字发送到后端",
                },
                {
                  step: 4,
                  action: "Get Dictionary from Input",
                  config: '从返回的 JSON 中提取:\n  success → Boolean\n  title → 任务标题\n  dueDate → 截止时间',
                  note: "解析后端返回的结果",
                },
                {
                  step: 5,
                  action: "If success = true",
                  config: 'Then:\n  → Show Notification:\n    标题: "✅ 已添加"\n    内容: {title}\nOtherwise:\n  → Show Notification:\n    标题: "❌ 失败"\n    内容: {error}',
                  note: "根据结果显示不同通知",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  style={{
                    background: COLORS.bg,
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 8,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: `${COLORS.orange}22`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: COLORS.orange,
                        flexShrink: 0,
                      }}
                    >
                      {item.step}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                      {item.action}
                    </span>
                  </div>
                  <CodeBlock color={COLORS.orange} code={item.config} />
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8, paddingLeft: 2 }}>
                    💡 {item.note}
                  </div>
                </div>
              ))}
            </Section>

            <div
              style={{
                padding: "12px 16px",
                background: `${COLORS.orange}08`,
                borderRadius: 10,
                border: `1px solid ${COLORS.orange}20`,
                fontSize: 12,
                color: COLORS.textMuted,
                lineHeight: 1.7,
              }}
            >
              <span style={{ fontWeight: 600, color: COLORS.orange }}>绑定 Action Button：</span>
              <br />
              设置 → Action Button → Shortcut → 选择此 Shortcut
            </div>
          </div>
        )}

        {/* CF Worker Tab */}
        {activeTab === "worker" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Section>
              <PhaseLabel number="⚡" title="Cloudflare Worker 内部架构" color={COLORS.accent} />

              <div
                style={{
                  background: COLORS.bg,
                  borderRadius: 10,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>
                  请求处理流程
                </div>
                {[
                  { label: "验证 X-Auth-Key", desc: "防止未授权调用", color: COLORS.pink },
                  { label: "从 KV 读取 TickTick token", desc: "若过期则用 refresh_token 续期", color: COLORS.accent },
                  { label: "从 KV 读取 project 列表缓存", desc: "若过期（>24h）则重新拉取", color: COLORS.accent },
                  { label: "调用 Anthropic API", desc: "发送 raw text + project 列表 → 结构化 JSON", color: COLORS.blue },
                  { label: "调用 TickTick API", desc: "POST /open/v1/task 创建任务", color: COLORS.green },
                  { label: "返回结果", desc: '{"success": true, "title": "...", ...}', color: COLORS.green },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: i < 5 ? 12 : 0,
                      paddingBottom: i < 5 ? 12 : 0,
                      borderBottom: i < 5 ? `1px solid ${COLORS.border}` : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: item.color,
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 500 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 10 }}>
                路由设计
              </div>
              <CodeBlock
                color={COLORS.accent}
                code={`POST /api/task      → 语音创建任务（主路由）
POST /api/projects  → 刷新 project 缓存
GET  /auth/callback → OAuth 回调（初始化用）
GET  /health        → 健康检查`}
              />

              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, margin: "16px 0 10px" }}>
                环境变量 / Secrets
              </div>
              <CodeBlock
                color={COLORS.accent}
                code={`ANTHROPIC_API_KEY   → sk-ant-...
TICKTICK_CLIENT_ID  → your-client-id
TICKTICK_SECRET     → your-client-secret
AUTH_KEY            → 自定义密钥（Shortcut 用）
KV_NAMESPACE        → TICKTICK_STORE`}
              />
            </Section>
          </div>
        )}

        {/* Data Flow Tab */}
        {activeTab === "data" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Section>
              <PhaseLabel number="📊" title="端到端数据变换" color={COLORS.blue} />

              {/* Step 1 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.orange, marginBottom: 8 }}>
                  ① 用户语音输入（原始文本）
                </div>
                <CodeBlock
                  color={COLORS.orange}
                  code={`"明天下午三点提醒我review PBA的benchmark设计\n 比较重要 放到工作的list里"`}
                />
              </div>

              <Arrow color={COLORS.textDim} label="Shortcut → Worker" />

              {/* Step 2 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, marginBottom: 8 }}>
                  ② Worker 收到的请求
                </div>
                <CodeBlock
                  color={COLORS.accent}
                  code={`POST /api/task
{
  "text": "明天下午三点提醒我review PBA的\n         benchmark设计 比较重要\n         放到工作的list里"
}`}
                />
              </div>

              <Arrow color={COLORS.textDim} label="Worker → Anthropic" />

              {/* Step 3 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.blue, marginBottom: 8 }}>
                  ③ LLM Prompt（含上下文）
                </div>
                <CodeBlock
                  color={COLORS.blue}
                  code={`System: 你是任务解析器。当前时间:\n2026-03-11T14:30:00+08:00\n\n用户的 project 列表:\n- id_001: "工作"\n- id_002: "生活"\n- id_003: "PBA"\n\n解析为 JSON: title, content,\ndueDate(ISO), priority(0/1/3/5),\nprojectId, tags[]\n\nUser: "明天下午三点提醒我review..."`}
                />
              </div>

              <Arrow color={COLORS.textDim} label="LLM 输出" />

              {/* Step 4 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.blue, marginBottom: 8 }}>
                  ④ LLM 解析结果
                </div>
                <CodeBlock
                  color={COLORS.blue}
                  code={`{
  "title": "Review PBA benchmark 设计",
  "content": "",
  "dueDate": "2026-03-12T15:00:00+0800",
  "priority": 3,
  "projectId": "id_001",
  "tags": ["review", "PBA"]
}`}
                />
              </div>

              <Arrow color={COLORS.textDim} label="Worker → TickTick" />

              {/* Step 5 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, marginBottom: 8 }}>
                  ⑤ TickTick 创建成功
                </div>
                <CodeBlock
                  color={COLORS.green}
                  code={`{
  "id": "67d0a1b2e4b0...",
  "projectId": "id_001",
  "title": "Review PBA benchmark 设计",
  "priority": 3,
  "dueDate": "2026-03-12T15:00:00+0800",
  "status": 0
}`}
                />
              </div>

              <Arrow color={COLORS.textDim} label="Worker → Shortcut" />

              {/* Step 6 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.pink, marginBottom: 8 }}>
                  ⑥ 返回给 Shortcut
                </div>
                <CodeBlock
                  color={COLORS.pink}
                  code={`{
  "success": true,
  "title": "Review PBA benchmark 设计",
  "dueDate": "2026-03-12T15:00:00+0800",
  "project": "工作",
  "priority": "中"
}`}
                />
              </div>
            </Section>
          </div>
        )}

        {/* Setup Tab */}
        {activeTab === "setup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Section>
              <PhaseLabel number="🔑" title="一次性初始化流程" color={COLORS.green} />

              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>
                OAuth 2.0 授权（只需做一次）
              </div>

              {[
                {
                  step: "A",
                  title: "注册 TickTick 开发者应用",
                  detail: "developer.ticktick.com → Manage Apps → 创建新 App\n设置 Redirect URI: https://your-worker.workers.dev/auth/callback\n获取 Client ID + Client Secret",
                },
                {
                  step: "B",
                  title: "部署 Cloudflare Worker",
                  detail: "wrangler init voice-ticktick\n配置 KV namespace + secrets\nwrangler deploy",
                },
                {
                  step: "C",
                  title: "浏览器完成 OAuth 授权",
                  detail: "访问: https://ticktick.com/oauth/authorize\n  ?scope=tasks:read+tasks:write\n  &client_id={id}\n  &redirect_uri={callback}\n  &response_type=code\n\n→ 授权后跳转到 Worker callback\n→ Worker 用 code 换 token 存入 KV",
                },
                {
                  step: "D",
                  title: "创建 iOS Shortcut 并绑定",
                  detail: "按 Shortcut 页签的步骤创建\n设置 → Action Button → Shortcut\n选择创建好的 Shortcut",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: COLORS.bg,
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 8,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: `${COLORS.green}22`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: COLORS.green,
                        flexShrink: 0,
                      }}
                    >
                      {item.step}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                      {item.title}
                    </span>
                  </div>
                  <CodeBlock color={COLORS.green} code={item.detail} />
                </div>
              ))}
            </Section>

            <Section>
              <PhaseLabel number="🔄" title="Token 自动续期机制" color={COLORS.accent} />
              <div
                style={{
                  background: COLORS.bg,
                  borderRadius: 10,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <CodeBlock
                  color={COLORS.accent}
                  code={`每次请求时检查:\n\n1. 从 KV 读 access_token + expires_at\n2. if (now > expires_at - 5min):\n     POST ticktick.com/oauth/token\n       grant_type=refresh_token\n       refresh_token={from KV}\n     → 新 token 写回 KV\n3. 用有效 token 调 TickTick API\n\n⚠️ refresh_token 本身不过期\n   只要不撤销授权就永久有效`}
                />
              </div>
            </Section>

            <div
              style={{
                padding: "14px 16px",
                background: `${COLORS.green}08`,
                borderRadius: 10,
                border: `1px solid ${COLORS.green}20`,
                fontSize: 12,
                color: COLORS.textMuted,
                lineHeight: 1.8,
              }}
            >
              <span style={{ fontWeight: 600, color: COLORS.green }}>成本估算：</span>
              <br />
              Cloudflare Workers 免费 100k req/day · KV 免费 100k reads/day
              <br />
              Anthropic API ≈ Haiku $0.001/次 · 每天 30 条任务 ≈ $0.03/天 ≈ $0.9/月
              <br />
              TickTick API 无额外费用
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
