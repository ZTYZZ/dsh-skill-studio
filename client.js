window.__ModuleLoader__.load({
  id: 'dsh-skill-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;

    const API = '/skill-studio/api';
    let localeService = null;

    const ZH = {
      nav: '技能工坊',
      title: '技能工坊',
      subtitle: '浏览、安装和创作可复用的 Agent 技能。安装后会自动进入所有会话的技能目录。',
      rootLabel: '技能目录',
      refresh: '刷新',
      refreshTitle: '重新读取技能目录',
      install: '安装技能',
      create: '新建技能',
      search: '搜索技能名或描述…',
      loading: '正在读取技能…',
      loadError: '读取技能失败',
      retry: '重试',
      emptyTitle: '还没有技能',
      emptyBody: '从 GitHub 安装一个现成技能，或者让 Agent 把你的流程写成一个技能。',
      noResults: '没有匹配的技能。',
      emptyInstall: '安装现成技能',
      emptyCreate: '新建技能',
      total: '个技能',
      valid: '有效',
      invalid: '有错误',
      manual: '仅手动调用',
      noSlash: '不可用 / 调用',
      installed: '外部安装',
      files: '文件',
      view: '查看',
      delete: '删除',
      cancel: '取消',
      confirm: '确认删除',
      confirmDelete: '确认删除「{name}」？技能会移入 .trash，可手动恢复。',
      close: '关闭',
      noDescription: '没有描述',
      errors: '错误',
      warnings: '警告',
      installTitle: '安装技能',
      installSub: '从 GitHub 或本地路径导入一个已有的 SKILL.md 技能包。',
      sourceLabel: '来源',
      installHint: '支持 GitHub tree/blob 链接、owner/repo/path 简写、raw SKILL.md 链接，或绝对本地路径。',
      installPlaceholder: 'https://github.com/owner/repo/tree/main/skills/foo',
      installAction: '安装',
      installing: '正在安装…',
      installedNotice: '已安装「{name}」',
      createTitle: '新建技能',
      createSub: '写一个最小可用的技能，之后还可以继续迭代。',
      nameLabel: '名称',
      nameHint: 'kebab-case，例如 release-notes，最多 64 个字符。',
      descriptionLabel: '描述',
      descriptionHint: '一句话说明做什么、什么时候用；把触发词放在最前面。',
      bodyLabel: '指令正文',
      bodyHint: 'Markdown，写清输入、步骤和验证方式；长内容拆到 references/。',
      createAction: '创建',
      creating: '正在创建…',
      createdNotice: '已创建「{name}」',
      deletedNotice: '已删除「{name}」',
      viewTitle: '技能详情',
      pathLabel: '路径',
      whenToUse: '使用时机',
      emptyBodyLabel: '正文',
      formRequired: '请填写名称、描述和正文。',
      deleteNotice: '已删除「{name}」',
      busy: '处理中…',
    };

    const EN = {
      nav: 'Skill Studio',
      title: 'Skill Studio',
      subtitle: 'Browse, install, and author reusable agent skills. New skills enter every session catalog automatically.',
      rootLabel: 'Skills directory',
      refresh: 'Refresh',
      refreshTitle: 'Reload the skills directory',
      install: 'Install skill',
      create: 'New skill',
      search: 'Search skills…',
      loading: 'Loading skills…',
      loadError: 'Could not load skills',
      retry: 'Retry',
      emptyTitle: 'No skills yet',
      emptyBody: 'Install an existing skill from GitHub, or ask the agent to turn your workflow into one.',
      noResults: 'No matching skills.',
      emptyInstall: 'Install a skill',
      emptyCreate: 'New skill',
      total: 'skills',
      valid: 'valid',
      invalid: 'invalid',
      manual: 'manual only',
      noSlash: 'no /name',
      installed: 'installed',
      files: 'files',
      view: 'View',
      delete: 'Delete',
      cancel: 'Cancel',
      confirm: 'Delete',
      confirmDelete: 'Delete “{name}”? It moves to .trash and can be restored by hand.',
      close: 'Close',
      noDescription: 'No description',
      errors: 'Errors',
      warnings: 'Warnings',
      installTitle: 'Install a skill',
      installSub: 'Import an existing SKILL.md bundle from GitHub or a local path.',
      sourceLabel: 'Source',
      installHint: 'GitHub tree/blob URL, owner/repo/path, a raw SKILL.md URL, or an absolute local path.',
      installPlaceholder: 'https://github.com/owner/repo/tree/main/skills/foo',
      installAction: 'Install',
      installing: 'Installing…',
      installedNotice: 'Installed “{name}”',
      createTitle: 'New skill',
      createSub: 'Write the smallest useful skill; you can iterate later.',
      nameLabel: 'Name',
      nameHint: 'kebab-case, for example release-notes, at most 64 characters.',
      descriptionLabel: 'Description',
      descriptionHint: 'One line: what it does and when to use it; put trigger phrases first.',
      bodyLabel: 'Instructions',
      bodyHint: 'Markdown with inputs, steps, and validation; move long detail into references/.',
      createAction: 'Create',
      creating: 'Creating…',
      createdNotice: 'Created “{name}”',
      deletedNotice: 'Deleted “{name}”',
      viewTitle: 'Skill details',
      pathLabel: 'Path',
      whenToUse: 'When to use',
      emptyBodyLabel: 'Instructions',
      formRequired: 'Name, description, and instructions are required.',
      deleteNotice: 'Deleted “{name}”',
      busy: 'Working…',
    };

    function currentLocale() {
      try {
        return localeService?.getLocale?.().active ?? 'zh';
      } catch {
        return 'zh';
      }
    }

    function format(template, values) {
      return template.replace(/\{(\w+)\}/g, (match, key) => (values[key] === undefined ? match : String(values[key])));
    }

    async function request(query, body) {
      const url = body === undefined ? `${API}?${query}` : API;
      let response;
      try {
        response = await fetch(url, body === undefined
          ? { cache: 'no-store' }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Network request failed');
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload.data;
    }

    function Spark({ size = 17 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M12 2.6l1.7 5.3 5.3 1.7-5.3 1.7L12 16.6l-1.7-5.3L5 9.6l5.3-1.7L12 2.6Z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M18.4 14.2l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z',
          fill: 'currentColor',
          opacity: 0.65,
        }),
      );
    }

    function Badge({ children, tone = 'neutral' }) {
      return h('span', { className: `ss-badge ss-${tone}` }, children);
    }

    function Modal({ title, subtitle, onClose, closeLabel, children, footer, wide }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h(
        'div',
        {
          className: 'ss-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: wide ? 'ss-modal ss-wide' : 'ss-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h(
            'div',
            { className: 'ss-modal-head' },
            h(
              'div',
              { className: 'ss-modal-titles' },
              h('h2', { className: 'ss-modal-title' }, title),
              subtitle ? h('p', { className: 'ss-modal-sub' }, subtitle) : null,
            ),
            h('button', { className: 'ss-iconbtn ss-close', onClick: onClose, 'aria-label': closeLabel }, '×'),
          ),
          h('div', { className: 'ss-modal-body' }, children),
          footer ? h('div', { className: 'ss-modal-foot' }, footer) : null,
        ),
      );
    }

    function Field({ label, hint, children }) {
      return h(
        'label',
        { className: 'ss-field' },
        h('span', { className: 'ss-label' }, label),
        children,
        hint ? h('span', { className: 'ss-hint' }, hint) : null,
      );
    }

    function Skeleton() {
      return h(
        'div',
        { className: 'ss-list', 'aria-hidden': true },
        [0, 1, 2, 3].map((index) =>
          h(
            'div',
            { className: 'ss-row ss-skeleton-row', key: index },
            h('div', { className: 'ss-skel ss-skel-mark' }),
            h(
              'div',
              { className: 'ss-body' },
              h('div', { className: 'ss-skel ss-skel-line', style: { width: '30%' } }),
              h('div', { className: 'ss-skel ss-skel-line', style: { width: '70%' } }),
            ),
          ),
        ),
      );
    }

    function Page({ S }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [query, setQuery] = useState('');
      const [notice, setNotice] = useState(null);
      const [modal, setModal] = useState(null);
      const [busy, setBusy] = useState(false);
      const [confirming, setConfirming] = useState(null);
      const [viewing, setViewing] = useState(null);
      const [viewLoading, setViewLoading] = useState(false);
      const [installSource, setInstallSource] = useState('');
      const [form, setForm] = useState({ name: '', description: '', body: '' });
      const [formError, setFormError] = useState('');

      const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          setData(await request('action=list'));
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        load();
      }, [load]);

      const skills = data?.skills ?? [];
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return skills;
        return skills.filter(
          (skill) =>
            skill.name.toLowerCase().includes(needle) ||
            String(skill.description ?? '').toLowerCase().includes(needle),
        );
      }, [skills, query]);

      const validCount = skills.filter((skill) => skill.valid).length;
      const invalidCount = skills.length - validCount;

      const openModal = useCallback((name) => {
        setFormError('');
        setModal(name);
      }, []);

      const openView = useCallback(
        async (name) => {
          setModal('view');
          setViewing(null);
          setViewLoading(true);
          try {
            setViewing(await request(`action=read&name=${encodeURIComponent(name)}`));
          } catch (failure) {
            setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) });
            setModal(null);
          } finally {
            setViewLoading(false);
          }
        },
        [],
      );

      const install = useCallback(async () => {
        if (installSource.trim() === '' || busy) return;
        setBusy(true);
        try {
          const result = await request(undefined, { action: 'install', source: installSource.trim() });
          setNotice({ tone: 'success', text: format(S.installedNotice, { name: result.name }) });
          setModal(null);
          setInstallSource('');
          await load();
        } catch (failure) {
          setFormError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setBusy(false);
        }
      }, [installSource, busy, S, load]);

      const create = useCallback(async () => {
        if (busy) return;
        if (form.name.trim() === '' || form.description.trim() === '' || form.body.trim() === '') {
          setFormError(S.formRequired);
          return;
        }
        setBusy(true);
        try {
          const result = await request(undefined, {
            action: 'create',
            name: form.name.trim(),
            description: form.description.trim(),
            body: form.body,
          });
          setNotice({ tone: 'success', text: format(S.createdNotice, { name: result.name }) });
          setModal(null);
          setForm({ name: '', description: '', body: '' });
          await load();
        } catch (failure) {
          setFormError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setBusy(false);
        }
      }, [busy, form, S, load]);

      const remove = useCallback(
        async (name) => {
          if (busy) return;
          setBusy(true);
          try {
            await request(undefined, { action: 'delete', name, confirm: name });
            setNotice({ tone: 'success', text: format(S.deletedNotice, { name }) });
            setConfirming(null);
            await load();
          } catch (failure) {
            setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) });
          } finally {
            setBusy(false);
          }
        },
        [busy, S, load],
      );

      const header = h(
        'header',
        { className: 'ss-head' },
        h(
          'div',
          null,
          h('h1', { className: 'ss-title' }, S.title),
          h('p', { className: 'ss-sub' }, S.subtitle),
          h('p', { className: 'ss-root' }, `${S.rootLabel}: ${data?.root ?? '…'}`),
        ),
        h(
          'button',
          { className: 'ss-btn', onClick: load, disabled: loading, title: S.refreshTitle },
          S.refresh,
        ),
      );

      const stats = h(
        'div',
        { className: 'ss-stats' },
        h('span', null, `${skills.length} ${S.total}`),
        h('span', { className: 'ss-dot' }, '·'),
        h('span', null, `${validCount} ${S.valid}`),
        invalidCount > 0 ? h('span', { className: 'ss-stat-error' }, ` · ${invalidCount} ${S.invalid}`) : null,
      );

      const toolbar = h(
        'div',
        { className: 'ss-toolbar' },
        h('input', {
          className: 'ss-input ss-search',
          value: query,
          placeholder: S.search,
          onChange: (event) => setQuery(event.target.value),
          'aria-label': S.search,
        }),
        h('button', { className: 'ss-btn', onClick: () => openModal('install') }, S.install),
        h('button', { className: 'ss-btn primary', onClick: () => openModal('create') }, S.create),
      );

      const list = loading && data === null
        ? h(Skeleton)
        : error && data === null
          ? h(
              'div',
              { className: 'ss-empty' },
              h('h3', { className: 'ss-empty-title' }, S.loadError),
              h('p', { className: 'ss-empty-body' }, error),
              h('button', { className: 'ss-btn', onClick: load }, S.retry),
            )
          : filtered.length === 0
            ? h(
                'div',
                { className: 'ss-empty' },
                h('div', { className: 'ss-empty-mark' }, h(Spark, { size: 26 })),
                h('h3', { className: 'ss-empty-title' }, skills.length === 0 ? S.emptyTitle : S.noResults),
                h('p', { className: 'ss-empty-body' }, skills.length === 0 ? S.emptyBody : ''),
                skills.length === 0
                  ? h(
                      'div',
                      { className: 'ss-empty-actions' },
                      h('button', { className: 'ss-btn', onClick: () => openModal('install') }, S.emptyInstall),
                      h('button', { className: 'ss-btn primary', onClick: () => openModal('create') }, S.emptyCreate),
                    )
                  : null,
              )
            : h(
                'div',
                { className: 'ss-list' },
                filtered.map((skill) =>
                  h(
                    'div',
                    { className: 'ss-row', key: skill.name },
                    h('div', { className: 'ss-mark' }, h(Spark)),
                    h(
                      'div',
                      { className: 'ss-body' },
                      h(
                        'div',
                        { className: 'ss-name-row' },
                        h('span', { className: 'ss-name' }, skill.name),
                        skill.valid ? h(Badge, { tone: 'ok' }, S.valid) : h(Badge, { tone: 'error' }, S.invalid),
                        skill.invocation?.modelInvocable === false ? h(Badge, null, S.manual) : null,
                        skill.invocation?.userInvocable === false ? h(Badge, null, S.noSlash) : null,
                        skill.source ? h(Badge, { tone: 'info' }, S.installed) : null,
                      ),
                      h('p', { className: 'ss-desc' }, skill.description || S.noDescription),
                      skill.errors?.length > 0
                        ? h(
                            'div',
                            { className: 'ss-problem' },
                            h('strong', null, `${S.errors}: `),
                            skill.errors.join(' '),
                          )
                        : null,
                      skill.warnings?.length > 0
                        ? h(
                            'div',
                            { className: 'ss-problem ss-warn' },
                            h('strong', null, `${S.warnings}: `),
                            skill.warnings.join(' '),
                          )
                        : null,
                      h(
                        'div',
                        { className: 'ss-meta' },
                        h('span', { className: 'ss-path', title: skill.path }, skill.path),
                        skill.files?.length > 0
                          ? h('span', null, `${skill.files.length} ${S.files}`)
                          : null,
                        skill.source ? h('span', { className: 'ss-source', title: skill.source }, skill.source) : null,
                      ),
                      confirming === skill.name
                        ? h(
                            'div',
                            { className: 'ss-confirm' },
                            h('span', null, format(S.confirmDelete, { name: skill.name })),
                            h(
                              'button',
                              { className: 'ss-btn danger', disabled: busy, onClick: () => remove(skill.name) },
                              S.confirm,
                            ),
                            h('button', { className: 'ss-btn', disabled: busy, onClick: () => setConfirming(null) }, S.cancel),
                          )
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'ss-actions' },
                      h('button', { className: 'ss-btn ss-small', onClick: () => openView(skill.name) }, S.view),
                      h(
                        'button',
                        { className: 'ss-btn ss-small danger', onClick: () => setConfirming(skill.name) },
                        S.delete,
                      ),
                    ),
                  ),
                ),
              );

      const noticeEl = notice
        ? h(
            'div',
            { className: `ss-notice ss-notice-${notice.tone}` },
            h('span', null, notice.text),
            h('button', { className: 'ss-iconbtn', onClick: () => setNotice(null), 'aria-label': S.close }, '×'),
          )
        : null;

      const installFooter = h(
        React.Fragment,
        null,
        h('button', { className: 'ss-btn', onClick: () => setModal(null), disabled: busy }, S.cancel),
        h(
          'button',
          { className: 'ss-btn primary', onClick: install, disabled: busy || installSource.trim() === '' },
          busy ? S.installing : S.installAction,
        ),
      );

      const createFooter = h(
        React.Fragment,
        null,
        h('button', { className: 'ss-btn', onClick: () => setModal(null), disabled: busy }, S.cancel),
        h(
          'button',
          { className: 'ss-btn primary', onClick: create, disabled: busy },
          busy ? S.creating : S.createAction,
        ),
      );

      return h(
        'div',
        { className: 'ss-page' },
        h('style', null, CSS),
        header,
        noticeEl,
        toolbar,
        stats,
        list,
        modal === 'install'
          ? h(
              Modal,
              {
                title: S.installTitle,
                subtitle: S.installSub,
                onClose: () => (busy ? undefined : setModal(null)),
                closeLabel: S.close,
                footer: installFooter,
              },
              formError ? h('div', { className: 'ss-form-error' }, formError) : null,
              h(
                Field,
                { label: S.sourceLabel, hint: S.installHint },
                h('input', {
                  className: 'ss-input',
                  value: installSource,
                  placeholder: S.installPlaceholder,
                  onChange: (event) => setInstallSource(event.target.value),
                  autoFocus: true,
                  disabled: busy,
                  spellCheck: false,
                }),
              ),
            )
          : null,
        modal === 'create'
          ? h(
              Modal,
              {
                title: S.createTitle,
                subtitle: S.createSub,
                onClose: () => (busy ? undefined : setModal(null)),
                closeLabel: S.close,
                footer: createFooter,
              },
              formError ? h('div', { className: 'ss-form-error' }, formError) : null,
              h(
                Field,
                { label: S.nameLabel, hint: S.nameHint },
                h('input', {
                  className: 'ss-input',
                  value: form.name,
                  onChange: (event) => setForm({ ...form, name: event.target.value }),
                  autoFocus: true,
                  disabled: busy,
                  spellCheck: false,
                }),
              ),
              h(
                Field,
                { label: S.descriptionLabel, hint: S.descriptionHint },
                h('input', {
                  className: 'ss-input',
                  value: form.description,
                  onChange: (event) => setForm({ ...form, description: event.target.value }),
                  disabled: busy,
                }),
              ),
              h(
                Field,
                { label: S.bodyLabel, hint: S.bodyHint },
                h('textarea', {
                  className: 'ss-textarea',
                  value: form.body,
                  onChange: (event) => setForm({ ...form, body: event.target.value }),
                  disabled: busy,
                  rows: 9,
                }),
              ),
            )
          : null,
        modal === 'view'
          ? h(
              Modal,
              {
                title: viewing?.name ?? S.viewTitle,
                subtitle: viewing?.description ?? '',
                onClose: () => setModal(null),
                closeLabel: S.close,
                wide: true,
              },
              viewLoading || viewing === null
                ? h('p', { className: 'ss-muted' }, S.loading)
                : h(
                    'div',
                    { className: 'ss-view' },
                    h('div', { className: 'ss-view-path' }, `${S.pathLabel}: ${viewing.path}`),
                    viewing.whenToUse ? h('p', { className: 'ss-muted' }, `${S.whenToUse}: ${viewing.whenToUse}`) : null,
                    viewing.files?.length > 0
                      ? h(
                          'div',
                          { className: 'ss-chips' },
                          viewing.files.map((file) => h('code', { className: 'ss-chip', key: file }, file)),
                        )
                      : null,
                    viewing.errors?.length > 0
                      ? h('div', { className: 'ss-problem' }, viewing.errors.join(' '))
                      : null,
                    viewing.warnings?.length > 0
                      ? h('div', { className: 'ss-problem ss-warn' }, viewing.warnings.join(' '))
                      : null,
                    h('h3', { className: 'ss-view-title' }, S.emptyBodyLabel),
                    h('pre', { className: 'ss-pre' }, viewing.body || ''),
                  ),
            )
          : null,
      );
    }

    function PageWithLocale(props) {
      const [localeId, setLocaleId] = useState(currentLocale);
      useEffect(() => {
        if (localeService === null) return undefined;
        return localeService.subscribe(() => setLocaleId(currentLocale()));
      }, []);
      const S = /^zh/i.test(localeId) ? ZH : EN;
      return h(Page, { ...props, S });
    }

    const CSS = `
.ss-page { padding: 26px 30px 48px; max-width: 860px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.ss-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.ss-title { margin: 0; font-size: 21px; line-height: 1.25; font-weight: 650; letter-spacing: -0.015em; }
.ss-sub { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; max-width: 620px; }
.ss-root { margin: 8px 0 0; color: var(--dsw-alias-state-idle-primary); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ss-toolbar { display: flex; align-items: center; gap: 8px; margin: 20px 0 12px; }
.ss-search { flex: 1; min-width: 0; }
.ss-stats { display: flex; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; margin: 0 0 12px 2px; }
.ss-stat-error { color: var(--dsw-alias-state-error-primary); }
.ss-dot { opacity: .5; }
.ss-list { display: flex; flex-direction: column; gap: 8px; }
.ss-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); transition: background .12s ease, border-color .12s ease; }
.ss-row:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.ss-mark { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #4f46e5, #7c3aed); box-shadow: 0 2px 6px rgba(79,70,229,.28); }
.ss-body { flex: 1; min-width: 0; }
.ss-name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.ss-name { font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -0.01em; }
.ss-desc { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.55; }
.ss-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1; white-space: nowrap; }
.ss-badge.ss-ok { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.ss-badge.ss-error { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
.ss-badge.ss-info { color: var(--dsw-alias-brand-primary); border-color: currentColor; }
.ss-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; color: var(--dsw-alias-state-idle-primary); font-size: 11px; }
.ss-path { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ss-source { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.ss-problem { margin-top: 6px; color: var(--dsw-alias-state-error-primary); font-size: 11.5px; line-height: 1.5; }
.ss-problem.ss-warn { color: var(--dsw-alias-state-warn-primary); }
.ss-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.ss-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; transition: background .12s ease, border-color .12s ease, opacity .12s ease; }
.ss-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.ss-btn:focus-visible, .ss-iconbtn:focus-visible, .ss-input:focus-visible, .ss-textarea:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ss-btn:disabled { opacity: .45; cursor: default; }
.ss-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.ss-btn.primary:hover:not(:disabled) { filter: brightness(1.07); background: var(--dsw-alias-brand-primary); }
.ss-btn.danger { color: var(--dsw-alias-state-error-primary); }
.ss-btn.danger:hover:not(:disabled) { border-color: var(--dsw-alias-state-error-primary); }
.ss-btn.ss-small { height: 27px; padding: 0 9px; font-size: 11.5px; }
.ss-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
.ss-iconbtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.ss-close { font-size: 20px; }
.ss-input, .ss-textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
.ss-textarea { min-height: 150px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.6; }
.ss-empty { border: 1px dashed var(--dsw-alias-border-l2); border-radius: 16px; padding: 46px 24px; text-align: center; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent); }
.ss-empty-mark { width: 46px; height: 46px; margin: 0 auto 14px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #4f46e5, #7c3aed); }
.ss-empty-title { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.ss-empty-body { margin: 0 auto; max-width: 420px; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
.ss-empty-actions { display: flex; justify-content: center; gap: 8px; margin-top: 18px; }
.ss-notice { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin: 14px 0 0; padding: 9px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ss-notice-success { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.ss-notice-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.ss-form-error { margin-bottom: 12px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); font-size: 11.5px; line-height: 1.5; }
.ss-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8, 10, 18, .52); }
.ss-modal { width: min(600px, 100%); max-height: 86vh; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 24px 70px rgba(0,0,0,.35); overflow: hidden; }
.ss-modal.ss-wide { width: min(760px, 100%); }
.ss-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ss-modal-titles { min-width: 0; }
.ss-modal-title { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.ss-modal-sub { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.55; }
.ss-modal-body { padding: 16px 20px; overflow: auto; }
.ss-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ss-field { display: block; margin-bottom: 14px; }
.ss-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; }
.ss-hint { display: block; margin-top: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
.ss-view-path { margin-bottom: 8px; color: var(--dsw-alias-label-secondary); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ss-view-title { margin: 16px 0 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.ss-pre { margin: 0; padding: 14px; border-radius: 10px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); white-space: pre-wrap; word-break: break-word; font: 11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }
.ss-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.ss-chip { padding: 2px 7px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); font: 10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.ss-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ss-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.5; }
.ss-skeleton-row { opacity: .65; }
.ss-skel { border-radius: 6px; background: var(--dsw-alias-bg-layer-2); }
.ss-skel-mark { width: 32px; height: 32px; border-radius: 9px; flex: 0 0 auto; }
.ss-skel-line { height: 10px; margin-bottom: 8px; }
.ss-skel-line:last-child { margin-bottom: 0; }
`;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeService = ctx.locale;
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'skill-studio',
              order: 16,
              label: () => (/^zh/i.test(currentLocale()) ? '技能工坊' : 'Skill Studio'),
            },
            PageWithLocale,
          ),
        );
      },
    };
  },
});
