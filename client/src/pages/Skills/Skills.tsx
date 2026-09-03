// 技能中心：技能台账 + 调度台
// 定位说明：网页没有写本地磁盘的权限，装不进 ~/.workbuddy/skills。
// 所以本页负责「看得清、找得到、用得上」——导入解析、检索启停、生成调用指令、导出标准技能包，
// 真正的真机安装由「下载技能包」+ 解压到技能目录完成（页面内给路径与验证方法）。

import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Search, Plus, Package, FileText, Clipboard, ClipboardCheck, Download, Trash2,
  Edit3, Copy, Target, X, Upload, Info, Code2,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import Modal from '../../components/Modal';
import { downloadBlob } from '../../utils/zipLite';
import { POSITIONS, type Position } from '../../utils/growthStore';
import {
  getEntries, addEntry, updateEntry, removeEntry, duplicateEntry, markUsed,
  importFromZip, importFromMd, importFromText, parseSkillMd, extractTriggers,
  exportSkillZip, exportPromptMd, buildInvokeText, migrateReprocessSkills,
  type SkillEntry, type SkillKind,
} from '../../utils/skillHub';

type ToastMsg = { type: 'success' | 'error' | 'info'; message: string } | null;
type InstallTab = 'zip' | 'md' | 'paste';

const KIND_META: Record<SkillKind, { label: string; cls: string }> = {
  skill: { label: '技能', cls: 'bg-blue-500/20 text-blue-300' },
  prompt: { label: '提示词', cls: 'bg-emerald-500/20 text-emerald-300' },
};
const SOURCE_META: Record<string, string> = {
  imported: '导入',
  custom: '自建',
};
const SKILLS_DIR = 'C:\\Users\\Administrator\\.workbuddy\\skills';

const Skills: React.FC = () => {
  const [entries, setEntries] = useState<SkillEntry[]>(() => getEntries());
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | SkillKind>('all');
  const [posFilter, setPosFilter] = useState<'all' | Position>('all');
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [toast, setToast] = useState<ToastMsg>(null);

  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<InstallTab>('zip');
  const [pasteText, setPasteText] = useState('');
  const [installing, setInstalling] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [invoked, setInvoked] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', desc: '', content: '', triggers: '' });

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  };

  // 首次进入：把二创工坊既有的提示词技能迁进统一台账
  useEffect(() => {
    const n = migrateReprocessSkills();
    if (n > 0) {
      setEntries(getEntries());
      showToast('info', `已从二创工坊并入 ${n} 个提示词技能，两处共用同一份数据`);
    }
  }, []);

  const refresh = () => setEntries(getEntries());

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (posFilter !== 'all' && !e.positions.includes(posFilter)) return false;
      if (onlyEnabled && !e.enabled) return false;
      if (!kw) return true;
      return [e.name, e.desc, e.content, e.triggers.join(' ')].join(' ').toLowerCase().includes(kw);
    });
  }, [entries, q, kindFilter, posFilter, onlyEnabled]);

  const detail = detailId ? entries.find((e) => e.id === detailId) || null : null;

  // ===== 安装 =====
  const runImport = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setInstalling(true);
    try {
      const r = await fn();
      if (r.ok) {
        refresh();
        setInstallOpen(false);
        setPasteText('');
        showToast('success', r.message);
      } else {
        showToast('error', r.message);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleZip = (f: File) => runImport(() => importFromZip(f));
  const handleMd = (f: File) => runImport(() => importFromMd(f));
  const handlePaste = () =>
    runImport(async () => {
      const parsed = parseSkillMd(pasteText);
      return importFromText(pasteText, parsed.name || '粘贴的技能');
    });

  // ===== 使用 =====
  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', okMsg);
    } catch {
      showToast('error', '复制失败，请手动选中复制');
    }
  };

  const doInvoke = () => {
    if (!detail) return;
    const text = buildInvokeText(detail, taskInput);
    setInvoked(text);
    markUsed(detail.id);
    refresh();
  };

  const doExport = () => {
    if (!detail) return;
    if (detail.kind === 'skill') {
      downloadBlob(exportSkillZip(detail), `${detail.name}.zip`);
      showToast('success', '技能包已下载');
    } else {
      downloadBlob(exportPromptMd(detail), `${detail.name}.md`);
      showToast('success', '提示词已导出为 md');
    }
  };

  const togglePos = (p: Position) => {
    if (!detail) return;
    const next = detail.positions.includes(p) ? detail.positions.filter((x) => x !== p) : [...detail.positions, p];
    updateEntry(detail.id, { positions: next });
    refresh();
  };

  const toggleEnabled = (e: SkillEntry) => {
    updateEntry(e.id, { enabled: !e.enabled });
    refresh();
  };

  const openEdit = (e?: SkillEntry) => {
    if (e) {
      setEditForm({ id: e.id, name: e.name, desc: e.desc, content: e.content, triggers: e.triggers.join('、') });
    } else {
      setEditForm({ id: '', name: '', desc: '', content: '', triggers: '' });
    }
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editForm.name.trim()) {
      showToast('error', '名称不能为空');
      return;
    }
    const triggers = editForm.triggers.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
    if (editForm.id) {
      updateEntry(editForm.id, {
        name: editForm.name.trim(),
        desc: editForm.desc.trim(),
        content: editForm.content,
        triggers: triggers.length ? triggers : extractTriggers(editForm.desc),
      });
      showToast('success', '已保存');
    } else {
      addEntry({
        name: editForm.name.trim(),
        desc: editForm.desc.trim(),
        kind: editForm.content.trim().startsWith('---') ? 'skill' : 'prompt',
        source: 'custom',
        triggers: triggers.length ? triggers : extractTriggers(editForm.desc),
        positions: [],
        enabled: true,
        content: editForm.content,
        attachments: [],
      });
      showToast('success', '已创建');
    }
    setEditOpen(false);
    refresh();
  };

  const stat = {
    total: entries.length,
    skill: entries.filter((e) => e.kind === 'skill').length,
    prompt: entries.filter((e) => e.kind === 'prompt').length,
    on: entries.filter((e) => e.enabled).length,
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-20 right-6 z-50">
          <div className={`px-4 py-2.5 rounded-lg shadow-2xl text-sm border ${
            toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            : toast.type === 'error' ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
            : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
          }`}>{toast.message}</div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-400" /> 技能中心
          </h2>
          <p className="text-xs text-white/50 mt-1">
            共 {stat.total} 条（技能 {stat.skill} · 提示词 {stat.prompt} · 启用 {stat.on}）· 与二创工坊共用同一份数据
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openEdit()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:text-white"
          >
            <Plus className="w-3.5 h-3.5" /> 新建
          </button>
          <button
            onClick={() => setInstallOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium"
          >
            <Package className="w-3.5 h-3.5" /> 安装技能
          </button>
        </div>
      </div>

      {/* 能力说明 */}
      <GlassCard hoverable={false}>
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs text-white/70">
              <span className="text-cyan-300">导入</span>＝解析进本页台账，可查看/检索/抄写调用指令；
              <span className="text-cyan-300">下载技能包</span>＝导出标准 zip，解压到
              <code className="mx-1 px-1 py-0.5 rounded bg-black/30 text-[10px]">{SKILLS_DIR}</code>
              后 AI 才能直接调用。网页无权写你的磁盘，这一步得手动，路径和验证方法在详情里。
            </p>
          </div>
        </div>
      </GlassCard>

      {/* 筛选 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜名称 / 触发词 / 正文"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30"
          />
        </div>
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
          {([['all', '全部'], ['skill', '技能'], ['prompt', '提示词']] as ['all' | SkillKind, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1 rounded-md text-[11px] ${kindFilter === k ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value as 'all' | Position)}
          className="h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
        >
          <option value="all">全部岗位</option>
          {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <button
          onClick={() => setOnlyEnabled((v) => !v)}
          className={`h-9 px-3 rounded-lg text-xs border ${
            onlyEnabled ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/50'
          }`}
        >
          仅看已启用
        </button>
      </div>

      {/* 卡片墙 */}
      {filtered.length === 0 ? (
        <GlassCard hoverable={false}>
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/40">{entries.length === 0 ? '还没有技能，点右上角「安装技能」把 zip 或 md 丢进来' : '没有符合条件的技能'}</p>
            <p className="text-xs text-white/30 mt-1">支持 zip 技能包 / 单个 md / 直接粘贴正文三种装法</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <GlassCard key={e.id} hoverable={false} className={e.enabled ? '' : 'opacity-60'}>
              <div className="flex items-start gap-2 mb-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${KIND_META[e.kind].cls}`}>{KIND_META[e.kind].label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{SOURCE_META[e.source]}</span>
                {e.platform && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">{e.platform === 'douyin' ? '抖音' : '小红书'}</span>}
                <button
                  onClick={() => toggleEnabled(e)}
                  className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                    e.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'
                  }`}
                >
                  {e.enabled ? '已启用' : '停用'}
                </button>
              </div>
              <h4
                onClick={() => { setDetailId(e.id); setInvoked(''); setTaskInput(''); setCopied(false); }}
                className="text-white font-medium text-sm mb-1 cursor-pointer hover:text-purple-300 truncate"
              >
                {e.name}
              </h4>
              <p className="text-white/40 text-xs mb-3 line-clamp-2 min-h-[32px]">{e.desc || '（无简介）'}</p>
              {e.positions.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {e.positions.map((p) => (
                    <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">
                      {POSITIONS.find((x) => x.key === p)?.label || p}
                    </span>
                  ))}
                </div>
              )}
              {e.triggers.length > 0 && (
                <p className="text-[10px] text-white/25 mb-2 truncate">{e.triggers.slice(0, 4).join(' · ')}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[10px] text-white/40">
                  {e.useCount > 0 ? `用过 ${e.useCount} 次` : '未使用'}{e.attachments.length ? ` · ${e.attachments.length} 附件` : ''}
                </span>
                <button
                  onClick={() => { setDetailId(e.id); setInvoked(''); setTaskInput(''); setCopied(false); }}
                  className="text-[11px] text-purple-400 hover:text-purple-300"
                >
                  详情
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* 安装弹窗 */}
      <Modal open={installOpen} onClose={() => setInstallOpen(false)} title="安装技能" maxWidth="max-w-lg">
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10 mb-3 w-fit">
          {([['zip', 'zip 技能包'], ['md', '单个 md'], ['paste', '粘贴正文']] as [InstallTab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setInstallTab(k)}
              className={`px-3 py-1 rounded-md text-[11px] ${installTab === k ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {installTab === 'zip' && (
          <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-white/15 hover:border-purple-500/40 cursor-pointer">
            <Upload className="w-5 h-5 text-white/40" />
            <span className="text-sm text-white/60">点击选择技能包 zip</span>
            <span className="text-[10px] text-white/30">包里必须含 SKILL.md，其余文件作为附件一并收进台账</span>
            <input
              type="file" accept=".zip" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleZip(f); }}
            />
          </label>
        )}

        {installTab === 'md' && (
          <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-white/15 hover:border-purple-500/40 cursor-pointer">
            <FileText className="w-5 h-5 text-white/40" />
            <span className="text-sm text-white/60">点击选择 .md 文件</span>
            <span className="text-[10px] text-white/30">会自动读 frontmatter 里的 name 与 description</span>
            <input
              type="file" accept=".md,.markdown" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleMd(f); }}
            />
          </label>
        )}

        {installTab === 'paste' && (
          <div className="space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder={'直接把 SKILL.md 全文粘进来，例如：\n---\nname: my-skill\ndescription: 一句话说明这个技能干什么、什么时候用\n---\n\n# 正文\n...'}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-mono resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handlePaste}
                disabled={installing || !pasteText.trim()}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium disabled:opacity-50"
              >
                {installing ? '解析中...' : '解析并导入'}
              </button>
            </div>
          </div>
        )}

        {installing && <p className="text-[11px] text-purple-300 mt-2">正在解析，稍等...</p>}
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? detail.name : ''}
        maxWidth="max-w-3xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${KIND_META[detail.kind].cls}`}>{KIND_META[detail.kind].label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">{SOURCE_META[detail.source]}</span>
              <button
                onClick={() => toggleEnabled(detail)}
                className={`text-[10px] px-2 py-0.5 rounded-full ${detail.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'}`}
              >
                {detail.enabled ? '已启用' : '已停用'}
              </button>
              {detail.triggers.length > 0 && (
                <span className="text-[10px] text-white/30">{detail.triggers.slice(0, 5).join(' · ')}</span>
              )}
              <div className="ml-auto flex gap-1.5">
                <button onClick={() => openEdit(detail)} className="p-1.5 rounded bg-white/5 text-white/50 hover:text-white" title="编辑">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { const d = duplicateEntry(detail.id); refresh(); if (d) showToast('success', `已复制为「${d.name}」，可随意改`); }}
                  className="p-1.5 rounded bg-white/5 text-white/50 hover:text-white" title="复制一份"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (window.confirm(`删除「${detail.name}」？`)) { removeEntry(detail.id); setDetailId(null); refresh(); } }}
                  className="p-1.5 rounded bg-white/5 text-rose-300/50 hover:text-rose-300" title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 左：正文 */}
              <div className="space-y-2">
                <p className="text-[10px] text-white/40">{detail.kind === 'skill' ? 'SKILL.md 正文' : '提示词内容'}</p>
                <pre className="text-[11px] text-white/65 leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-black/20 border border-white/5 max-h-72 overflow-y-auto scrollbar-thin">
                  {detail.content || '（空）'}
                </pre>
                {detail.attachments.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/40 mb-1">附件（{detail.attachments.length}）</p>
                    <div className="space-y-0.5 max-h-24 overflow-y-auto scrollbar-thin">
                      {detail.attachments.map((a, i) => (
                        <p key={i} className="text-[10px] text-white/45 truncate">
                          {a.name} · {Math.round(a.size / 1024)}KB{a.content ? '' : ' · 仅记名'}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 右：怎么用 */}
              <div className="space-y-3">
                <p className="text-[10px] text-white/40">怎么用</p>

                {/* 方式一 */}
                <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                  <p className="text-xs text-cyan-300 mb-2 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/25 flex items-center justify-center text-[9px]">1</span>
                    生成调用指令
                  </p>
                  <textarea
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    rows={2}
                    placeholder="这次要做什么？例：给「三升四暑假规划」做张封面"
                    className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white resize-none mb-2"
                  />
                  <button onClick={doInvoke} className="w-full py-1.5 rounded bg-cyan-500/20 text-cyan-200 text-[11px] hover:bg-cyan-500/30">
                    生成指令
                  </button>
                  {invoked && (
                    <div className="mt-2">
                      <pre className="text-[10px] text-white/60 leading-relaxed whitespace-pre-wrap p-2 rounded bg-black/25 border border-white/5 max-h-32 overflow-y-auto scrollbar-thin">
                        {invoked}
                      </pre>
                      <button
                        onClick={() => copyText(invoked, '指令已复制，粘到对话里即可')}
                        className="mt-1.5 w-full py-1.5 rounded bg-white/5 text-white/60 text-[11px] hover:text-white flex items-center justify-center gap-1"
                      >
                        <Clipboard className="w-3 h-3" /> 复制
                      </button>
                    </div>
                  )}
                </div>

                {/* 方式二 */}
                <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <p className="text-xs text-purple-300 mb-1.5 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-purple-500/25 flex items-center justify-center text-[9px]">2</span>
                    {detail.kind === 'skill' ? '下载技能包（真机安装）' : '导出提示词'}
                  </p>
                  <p className="text-[10px] text-white/45 mb-2">
                    {detail.kind === 'skill'
                      ? '导出标准 zip，解压到下面的目录后 AI 就能直接调用。'
                      : '提示词类型不需要真机安装，导出 md 或直接在上面复制即可。'}
                  </p>
                  {detail.kind === 'skill' && (
                    <p className="text-[10px] text-white/40 mb-2 p-1.5 rounded bg-black/25 font-mono break-all">{SKILLS_DIR}</p>
                  )}
                  <button
                    onClick={doExport}
                    className="w-full py-1.5 rounded bg-purple-500/20 text-purple-200 text-[11px] hover:bg-purple-500/30 flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3" /> {detail.kind === 'skill' ? '下载 zip' : '导出 md'}
                  </button>
                </div>

                {/* 方式三 */}
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-xs text-emerald-300 mb-2 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/25 flex items-center justify-center text-[9px]">3</span>
                    挂到岗位
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {POSITIONS.map((p) => {
                      const on = detail.positions.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          onClick={() => togglePos(p.key)}
                          className={`px-2 py-1 rounded-lg text-[10px] border ${
                            on ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-white/35 mt-2">挂上去后，该岗位的成员进工作台会看到这个技能的快捷入口。</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 新建 / 编辑弹窗 */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editForm.id ? '编辑' : '新建技能'} maxWidth="max-w-xl">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">名称</label>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="例：gbro-cover-design"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">一句话简介</label>
            <input
              value={editForm.desc}
              onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
              placeholder="例：公众号/小红书封面设计，输出可直接用的生图提示词"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">触发词（顿号或空格分隔）</label>
            <input
              value={editForm.triggers}
              onChange={(e) => setEditForm({ ...editForm, triggers: e.target.value })}
              placeholder="封面设计 提示词生成 公众号封面"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">正文（SKILL.md 全文或提示词内容）</label>
            <textarea
              value={editForm.content}
              onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
              rows={10}
              placeholder={'以 --- 开头的 frontmatter 会被识别为「技能」，否则记为「提示词」'}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-mono resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 text-white/70 text-sm">取消</button>
            <button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium">保存</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Skills;
