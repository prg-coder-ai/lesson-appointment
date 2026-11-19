/**
 * 运营台可搜索选择器（2026-11-19）
 *
 * 背景：应急建课/加学员/发通知三处原来都是「手抄 32 位 userId」的输入框。
 *   - userId 是系统生成的短码，人记不住，抄错一位就变成「建了课但教师进不去」
 *     （ClassroomAccessGuard 按 teacherId 本人判定）或「加了人但对方不是这个名字」；
 *   - 学生还要用逗号/换行分隔多个 id，格式要求又多一层。
 * 现在改成从候选列表里点选，输入框只用来过滤。
 *
 * <p>为什么不用第三方下拉库：运营台是零构建的静态页（只引了 axios 与自己写的
 * utility_request），引入 select2/choices.js 要多带一份 js+css、还要跟项目风格对齐；
 * 这里用到的能力只有「过滤 + 单选/多选 + 键盘操作」，自写不到 200 行。
 *
 * 约定：**只有从列表里点中的项才算值**。输入框里的文字不参与提交——否则「输入了但没选」
 * 会静默提交一个不存在的 userId，正好回到手抄时代的问题。选值后输入框会清空（过滤词不是值）。
 *
 * 用法：
 *   var picker = window.ClassroomPicker.create(document.getElementById('xxx-pick'), {
 *     multiple: true,
 *     placeholder: '搜索姓名或账号',
 *     fetch: function (keyword) { return Promise.resolve([{value:'u1', label:'张三', sub:'138****'}]); },
 *     onChange: function (items) { ... }
 *   });
 *   picker.getValue()      // 单选：'u1' | ''
 *   picker.getValues()     // 多选：['u1','u2']
 *   picker.getItems()      // [{value,label}]
 *   picker.setValue(v, l)  // 列表行「发通知」回填用
 *   picker.clear()
 */
(function () {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * @param {HTMLElement} mount 挂载点（会被清空）
   * @param {Object} opts
   *   multiple    是否多选
   *   placeholder 输入框占位
   *   emptyText   无结果文案
   *   footer      常驻底部提示（如「共 N 人」）
   *   fetch       function(keyword) → Promise<[{value,label,sub}]>
   *   onChange    function(items) 选中集合变化
   */
  function create(mount, opts) {
    if (!mount) throw new Error('ClassroomPicker: mount 不能为空');
    opts = opts || {};
    var multiple = !!opts.multiple;
    var emptyText = opts.emptyText || '没有匹配的项';
    var fetchFn = typeof opts.fetch === 'function' ? opts.fetch : function () { return Promise.resolve([]); };

    var selected = [];      // [{value,label}]
    var options = [];       // 当前候选
    var activeIdx = -1;
    var loading = false;
    var seq = 0;            // 竞态守卫：只认最后一次请求的结果
    var debounceTimer = null;
    var opened = false;

    mount.innerHTML = ''
      + '<div class="pk">'
      + '  <div class="pk-chips"></div>'
      + '  <input class="pk-input" type="text" autocomplete="off" spellcheck="false" '
      + '         placeholder="' + esc(opts.placeholder || '输入关键字搜索') + '">'
      + '  <div class="pk-menu" style="display:none;">'
      + '    <div class="pk-list"></div>'
      + '    <div class="pk-foot"></div>'
      + '  </div>'
      + '</div>';

    var root = mount.querySelector('.pk');
    var chipsEl = mount.querySelector('.pk-chips');
    var inputEl = mount.querySelector('.pk-input');
    var menuEl = mount.querySelector('.pk-menu');
    var listEl = mount.querySelector('.pk-list');
    var footEl = mount.querySelector('.pk-foot');

    function isSelected(v) {
      for (var i = 0; i < selected.length; i++) if (selected[i].value === v) return true;
      return false;
    }

    function renderChips() {
      if (!multiple) { chipsEl.innerHTML = ''; return; }
      chipsEl.innerHTML = selected.map(function (it, i) {
        return '<span class="pk-chip" data-idx="' + i + '">' + esc(it.label)
          + '<b data-remove="' + i + '" title="移除">×</b></span>';
      }).join('');
    }

    function renderMenu() {
      if (!opened) { menuEl.style.display = 'none'; return; }
      menuEl.style.display = 'block';
      if (loading) {
        listEl.innerHTML = '<div class="pk-empty">加载中…</div>';
        footEl.textContent = '';
        return;
      }
      if (!options.length) {
        listEl.innerHTML = '<div class="pk-empty">' + esc(emptyText) + '</div>';
      } else {
        listEl.innerHTML = options.map(function (o, i) {
          var on = isSelected(o.value);
          return '<div class="pk-item' + (i === activeIdx ? ' active' : '') + (on ? ' picked' : '') + '"'
            + ' data-idx="' + i + '" data-value="' + esc(o.value) + '">'
            + '<div class="pk-main">' + esc(o.label) + (on ? ' <span class="pk-tick">✓</span>' : '') + '</div>'
            + (o.sub ? '<div class="pk-sub">' + esc(o.sub) + '</div>' : '')
            + '</div>';
        }).join('');
      }
      footEl.textContent = opts.footer || '';
      // 高亮项滚进可视区
      if (activeIdx >= 0) {
        var act = listEl.querySelector('.pk-item.active');
        if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      }
    }

    function open() {
      if (opened) return;
      opened = true;
      load(inputEl.value.trim());
    }

    function close() {
      opened = false;
      activeIdx = -1;
      menuEl.style.display = 'none';
    }

    function load(keyword) {
      var my = ++seq;
      loading = true;
      renderMenu();
      Promise.resolve(fetchFn(keyword)).then(function (rows) {
        if (my !== seq) return;              // 过期结果（用户又输了新字符）直接丢弃
        options = (rows || []).filter(function (r) { return r && r.value; });
        activeIdx = options.length ? 0 : -1;
        loading = false;
        renderMenu();
      }).catch(function () {
        if (my !== seq) return;
        options = [];
        activeIdx = -1;
        loading = false;
        renderMenu();
      });
    }

    function commit(item) {
      if (!item) return;
      if (multiple) {
        if (isSelected(item.value)) {
          removeByValue(item.value);
          return;
        }
        selected.push({ value: item.value, label: item.label });
      } else {
        selected = [{ value: item.value, label: item.label }];
        inputEl.value = item.label;          // 单选：回显选中项名字，便于肉眼确认
        close();
      }
      renderChips();
      renderMenu();
      if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
      if (multiple) inputEl.focus();
    }

    function removeByValue(v) {
      for (var i = 0; i < selected.length; i++) {
        if (selected[i].value === v) {
          selected.splice(i, 1);
          if (!multiple) inputEl.value = '';
          renderChips();
          renderMenu();
          if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
          return;
        }
      }
    }

    // ---------- 事件 ----------
    inputEl.addEventListener('focus', function () { open(); });

    inputEl.addEventListener('input', function () {
      activeIdx = 0;
      if (!opened) { opened = true; }
      clearTimeout(debounceTimer);
      var kw = inputEl.value.trim();
      // 单选时用户重新输入等于「改主意」：先把已选项清掉，避免界面上名字是 A、实际值是 B
      if (!multiple && selected.length && kw !== selected[0].label) {
        selected = [];
        renderChips();
        if (typeof opts.onChange === 'function') opts.onChange([]);
      }
      debounceTimer = setTimeout(function () { load(kw); }, 220);
    });

    inputEl.addEventListener('keydown', function (e) {
      var key = e.key || e.keyCode;
      if (key === 'ArrowDown' || key === 40) {
        e.preventDefault();
        if (!opened) { open(); return; }
        if (!options.length) return;
        activeIdx = (activeIdx + 1) % options.length;
        renderMenu();
      } else if (key === 'ArrowUp' || key === 38) {
        e.preventDefault();
        if (!options.length) return;
        activeIdx = (activeIdx - 1 + options.length) % options.length;
        renderMenu();
      } else if (key === 'Enter' || key === 13) {
        e.preventDefault();
        if (opened && activeIdx >= 0 && options[activeIdx]) commit(options[activeIdx]);
      } else if (key === 'Escape' || key === 27) {
        close();
      } else if ((key === 'Backspace' || key === 8) && multiple && !inputEl.value && selected.length) {
        // 多选时空输入退格 = 移除最后一个（与常见 tag 输入一致）
        selected.pop();
        renderChips();
        renderMenu();
        if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
      }
    });

    listEl.addEventListener('mousedown', function (e) {
      // 用 mousedown 而不是 click：click 前 input 会先 blur，部分浏览器里菜单已被关掉
      var item = e.target.closest ? e.target.closest('.pk-item') : null;
      if (!item) return;
      e.preventDefault();
      var idx = Number(item.getAttribute('data-idx'));
      var val = item.getAttribute('data-value');
      var hit = options[idx];
      if (!hit) {
        for (var i = 0; i < options.length; i++) if (options[i].value === val) hit = options[i];
      }
      commit(hit);
    });

    chipsEl.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var idx = t.getAttribute('data-remove');
      if (idx === null || idx === undefined) return;
      var it = selected[Number(idx)];
      if (it) removeByValue(it.value);
    });

    document.addEventListener('mousedown', function (e) {
      if (!opened) return;
      if (root.contains(e.target)) return;
      close();
    });

    renderChips();

    return {
      multiple: multiple,
      getValue: function () { return selected.length ? selected[0].value : ''; },
      getLabel: function () { return selected.length ? selected[0].label : ''; },
      getValues: function () { return selected.map(function (s) { return s.value; }); },
      getItems: function () { return selected.slice(); },
      setValue: function (value, label) {
        if (!value) { selected = []; inputEl.value = ''; renderChips(); return; }
        selected = [{ value: value, label: label || value }];
        if (!multiple) inputEl.value = selected[0].label;
        renderChips();
        if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
      },
      setValues: function (items) {
        selected = (items || []).filter(function (x) { return x && x.value; })
          .map(function (x) { return { value: x.value, label: x.label || x.value }; });
        renderChips();
        if (typeof opts.onChange === 'function') opts.onChange(selected.slice());
      },
      clear: function () {
        selected = [];
        inputEl.value = '';
        options = [];
        close();
        renderChips();
        if (typeof opts.onChange === 'function') opts.onChange([]);
      },
      /** 外部改了候选源（如切了租户）时强制刷新一次 */
      reload: function () { if (opened) load(inputEl.value.trim()); }
    };
  }

  window.ClassroomPicker = { create: create };
})();
