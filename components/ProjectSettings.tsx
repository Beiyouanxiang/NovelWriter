"use client";

import type { NovelSettings } from "@/lib/novel/types";

interface ProjectSettingsProps {
  settings: NovelSettings;
  onChange: (settings: NovelSettings) => void;
  saveState: "saved" | "saving" | "idle";
  accessToken: string;
  onAccessTokenChange: (token: string) => void;
}

const FIELDS: Array<{
  key: keyof NovelSettings;
  label: string;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}> = [
  { key: "title", label: "小说名称", placeholder: "例如：长安十二时辰" },
  { key: "genre", label: "类型", placeholder: "例如：历史 / 悬疑 / 科幻…" },
  {
    key: "summary",
    label: "故事简介",
    placeholder: "用一两句话概括故事的核心冲突与主线…",
    multiline: true,
    rows: 3,
  },
  {
    key: "style",
    label: "写作风格",
    placeholder: "例如：冷峻克制、白描、口语化、多用短句…",
    multiline: true,
    rows: 3,
  },
  {
    key: "worldview",
    label: "世界观",
    placeholder: "时代背景、力量体系、社会规则、地理设定…",
    multiline: true,
    rows: 5,
  },
  {
    key: "characters",
    label: "主要人物",
    placeholder: "姓名、身份、性格、动机、人物关系…",
    multiline: true,
    rows: 6,
  },
  {
    key: "outline",
    label: "故事大纲",
    placeholder: "主线脉络、关键节点、伏笔…",
    multiline: true,
    rows: 8,
  },
  {
    key: "chapterGoal",
    label: "当前章节目标",
    placeholder: "本章要达成的剧情推进、情绪走向、信息释放…",
    multiline: true,
    rows: 4,
  },
];

export default function ProjectSettings({
  settings,
  onChange,
  saveState,
  accessToken,
  onAccessTokenChange,
}: ProjectSettingsProps) {
  function update(key: keyof NovelSettings, value: string) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#e7e2d8] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#2b2a27]">作品设定</h2>
        <span
          className={`text-xs ${
            saveState === "saving" ? "text-[#b5ad9e]" : "text-[#6b675f]"
          }`}
        >
          {saveState === "saving" ? "保存中…" : "已自动保存"}
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="field-label">{field.label}</label>
            {field.multiline ? (
              <textarea
                className="field-input resize-y"
                rows={field.rows}
                value={settings[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => update(field.key, e.target.value)}
              />
            ) : (
              <input
                className="field-input"
                value={settings[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => update(field.key, e.target.value)}
              />
            )}
          </div>
        ))}

        <div className="border-t border-[#e7e2d8] pt-4">
          <label className="field-label">服务端访问口令（可选）</label>
          <input
            className="field-input"
            type="password"
            value={accessToken}
            placeholder="若服务端配置了 NOVEL_ACCESS_TOKEN，请填入相同口令"
            onChange={(e) => onAccessTokenChange(e.target.value)}
          />
          <p className="mt-1 text-xs leading-relaxed text-[#b5ad9e]">
            口令仅保存在本地浏览器，随每次请求发送到服务端校验，不会进入代码或日志。
          </p>
        </div>
      </div>
    </div>
  );
}
