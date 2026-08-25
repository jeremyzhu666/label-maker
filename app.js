/* ============================================================
   Label Maker 标签生成工具 — 业务逻辑
   依赖:niimbot-web-bluetooth(全局 window.Niimbot,由 index.html 通过 CDN 引入)
   ============================================================ */
(function(){
  'use strict';

  /* ---------- CONFIG:集中所有可调参数 ---------- */
  const CONFIG = Object.freeze({
    canvas:  { W:800, H:600 },                 // canvas 画布尺寸(打印头方向 W,走纸方向 H)
    font: {                                     // 字体规格:Barlow Condensed + 系统中文 fallback(热敏打印笔画不粘连)
      titleSize:44, titleWeight:400,            //   标题:字号 44,字重 400
      contentSize:68, contentWeight:300,        //   内容:字号 68,字重 300
      minTitle:22, minContent:34,                //   缩字兜底下限:标题≥22,内容≥34(用二分查找最大能放下的字号)
      family:'"Barlow Condensed","PingFang SC","Hiragino Sans GB","Microsoft YaHei","SimHei",sans-serif'
    },
    layout: {                                   // canvas 内部布局
      padX:34,                                   //   标题左右内边距
      titleY:72,                                 //   标题基线 y(距块顶部)
      contentY:180,                              //   内容基线 y(块中心偏下)
      titleMaxPadX:68,                           //   标题最大宽度 padding(左右各 34)
      contentMaxPadX:58                          //   内容最大宽度 padding
    },
    binarize: { threshold:210 },                // 二值化阈值(热敏打印:0.299R+0.587G+0.114B < 210 → 黑)
    input: {                                      // 输入框长度限制
      maxTitleLen:12,                              //   标题最大字符数
      maxContentLen:16                            //   内容最大字符数
    },
    stepper: {                                    // stepper 控件范围(单一来源,initStepper 与 onPrint 共用)
      density:  { min:1,   max:5,  def:3 },
      copies:   { min:1,   max:99, def:1 },
      offsetX:  { min:-99, max:99, def:0 },
      offsetY:  { min:-99, max:99, def:0 }
    }
    // 默认标题/内容由 i18n 提供,随语言切换
  });

  const W=CONFIG.canvas.W, H=CONFIG.canvas.H, BW=W/2, BH=H/2;
  // 预计算每格坐标,避免 draw 内重复 (i%2)*BW / Math.floor(i/2)*BH
  const CELL_X = [0, BW, 0, BW];
  const CELL_Y = [0, 0, BH, BH];
  // 预计算布局常量,避免 draw 内每格重复 CONFIG.layout.xxx 属性查找 + 加减
  const PAD_X = CONFIG.layout.padX;
  const TITLE_Y = CONFIG.layout.titleY;
  const CONTENT_Y = CONFIG.layout.contentY;
  const TITLE_MAXW = BW - CONFIG.layout.titleMaxPadX;
  const CONTENT_MAXW = BW - CONFIG.layout.contentMaxPadX;
  const CONTENT_CX = BW / 2;
  // fontOf 全局缓存:同一 weight+size 只拼接一次字符串,后续命中缓存
  const _fontCache = Object.create(null);
  function fontOf(weight, size){
    const k = weight + '|' + size;
    return _fontCache[k] || (_fontCache[k] = weight + ' ' + size + 'px ' + CONFIG.font.family);
  }
  const FONT_UI_TITLE   = fontOf(CONFIG.font.titleWeight,   CONFIG.font.titleSize);
  const FONT_UI_CONTENT = fontOf(CONFIG.font.contentWeight, CONFIG.font.contentSize);

  /* ---------- i18n:语言切换,单一状态源,新增语言无需改业务代码 ---------- */
  let lang = window.DEFAULT_LANG || 'zh';
  let S = window.I18N[lang];
  // t(path):按点分路径取字符串,函数类型自动调用;未命中返回 path 本身(便于发现遗漏)
  function t(path){
    const parts = path.split('.');
    let v = S;
    for(let i=0;i<parts.length;i++){ v = v && v[parts[i]]; }
    return typeof v === 'function' ? v : (v === undefined ? path : v);
  }
  // applyI18n:一次遍历更新所有 i18n 元素,避免多次 querySelectorAll
  function applyI18n(){
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = S.docTitle;
    document.querySelectorAll('[data-i18n],[data-i18n-aria],[data-i18n-placeholder],.lang-btn').forEach(el => {
      if(el.dataset.i18n)             el.textContent = t(el.dataset.i18n);
      if(el.dataset.i18nAria)         el.setAttribute('aria-label', t(el.dataset.i18nAria));
      if(el.dataset.i18nPlaceholder)  el.placeholder = t(el.dataset.i18nPlaceholder);
      if(el.classList.contains('lang-btn')) el.classList.toggle('active', el.dataset.lang === lang);
    });
  }
  function setLang(l){
    if(!window.I18N[l] || l === lang) return;
    lang = l;
    S = window.I18N[l];
    applyI18n();
    // 语言切换:只更新 placeholder,保留用户输入值
    fillInputs();
    draw();
    // 状态文案同步刷新
    renderStatus();
  }

  // 无保存功能:每次刷新回到默认状态(值由 HTML value 属性提供)
  let titles = [];
  let contents = [];

  /* ---------- DOM 引用:全部集中,按 UI 区域分组 ---------- */
  const grid = document.getElementById('inputGrid');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const toastEl = document.getElementById('toast');
  // input 引用数组:HTML 预写结构,init 时收集引用
  const titleInputs = [];
  const contentInputs = [];
  // 蓝牙/打印区
  const statusDot = document.getElementById('statusDot');
  const btnLabel = document.getElementById('btnLabel');
  const statusSub = document.getElementById('statusSub');
  const btnConnect = document.getElementById('btnConnect');
  const btnPrint = document.getElementById('printBtn');
  const selModel = document.getElementById('selModel');
  const selLabel = document.getElementById('selLabel');
  const selFit = document.getElementById('selFit');
  const selDensity = document.getElementById('selDensity');
  const printSelects = document.getElementById('printSelects');

  /* ============ 输入 & 绘制 ============ */
  // rAF 防抖:连续输入时合并到下一帧重绘,避免每次按键都重画 canvas
  let drawScheduled = false;
  // 脏区标记:记录哪些格子需要重画。空集合 → 全画(初始化/导出/打印)
  const dirtyCells = new Set();
  function scheduleDraw(dirtyIdx){
    if(dirtyIdx === undefined){
      dirtyCells.add(0); dirtyCells.add(1); dirtyCells.add(2); dirtyCells.add(3);
    } else {
      dirtyCells.add(dirtyIdx);
    }
    if(drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => { drawScheduled = false; draw(); });
  }
  // 预分配数组,避免每次 draw 创建 [0,1,2,3]
  const ALL_CELLS = [0,1,2,3];
  // 脏格复用数组(dirtyCells.size < 4 时用),避免 [...dirtyCells] 每次新建
  const DIRTY_BUF = [0,0,0,0];
  // 事件委托:1 个监听器替代 8 个,减少内存和初始化开销
  function bindInputs(){
    const inputs = grid.querySelectorAll('input');
    for(let i=0;i<4;i++){
      titleInputs[i] = inputs[i*2];
      contentInputs[i] = inputs[i*2+1];
    }
    grid.addEventListener('input', onInput);
  }
  // 同步 placeholder(语言切换时调用)
  function fillInputs(){
    for(let i=0;i<4;i++){
      titles[i] = titleInputs[i].value;
      contents[i] = contentInputs[i].value;
      titleInputs[i].placeholder = S.input.titlePlaceholder;
      // 内容框 placeholder 由 HTML 预设,不随语言切换
    }
  }
  function onInput(e){
    const i = +e.target.dataset.i;
    if(e.target.dataset.type==='t'){
      titles[i] = e.target.value;
    }
    else{ contents[i] = e.target.value; }
    scheduleDraw(i);
  }
  // 三批渲染:先清白→再标题→再内容,减少 ctx 状态切换次数
  const CONTENT_MODE = {
    content:    { color:'#000000' },
    blank:      { color:'#000000' },
    placeholder:{ color:'#9aa1b4' }
  };
  // 预分配 4 个静态槽位,避免每次 draw 重建数组
  const taskSlots = [{color:null,text:null,x:0,y:0},{color:null,text:null,x:0,y:0},{color:null,text:null,x:0,y:0},{color:null,text:null,x:0,y:0}];
  function draw(official){
    const allDirty = dirtyCells.size === 0 || dirtyCells.size >= 4 || official === true;
    let cells, cellCount;
    if(allDirty){
      cells = ALL_CELLS; cellCount = 4;
    } else {
      cellCount = dirtyCells.size;
      let k = 0;
      for(const i of dirtyCells){ DIRTY_BUF[k++] = i; }
      cells = DIRTY_BUF;
    }

    // 第一批:清白底
    ctx.fillStyle = '#ffffff';
    if(allDirty){
      ctx.fillRect(0, 0, W, H);
    } else {
      for(let j=0;j<cellCount;j++){
        const i = cells[j];
        ctx.fillRect(CELL_X[i], CELL_Y[i], BW, BH);
      }
    }

    // 第二批:标题(统一状态)
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.font = FONT_UI_TITLE;
    ctx.textAlign = 'left';
    for(let j=0;j<cellCount;j++){
      const i = cells[j];
      drawTextClip(titles[i]||'', CELL_X[i]+PAD_X, CELL_Y[i]+TITLE_Y, TITLE_MAXW, true);
    }

    // 第三批:内容(按颜色分组,减少 fillStyle 切换)
    ctx.font = FONT_UI_CONTENT;
    ctx.textAlign = 'center';
    // 预分配 4 个静态槽位,避免每次 draw 重建数组
    for(let j=0;j<cellCount;j++){
      const i = cells[j];
      const ci = contents[i];
      const hasContent = ci != null && ci.trim() !== '';
      const mode = hasContent ? 'content' : (official ? 'blank' : 'placeholder');
      taskSlots[j].color = CONTENT_MODE[mode].color;
      taskSlots[j].text = hasContent ? ci : (mode === 'placeholder' ? contentInputs[i].placeholder : '');
      taskSlots[j].x = CELL_X[i];
      taskSlots[j].y = CELL_Y[i];
    }
    // 按颜色分组绘制,同色一次 fillStyle
    let lastColor = null;
    for(let j=0;j<cellCount;j++){
      const t = taskSlots[j];
      if(t.color !== lastColor){ ctx.fillStyle = t.color; lastColor = t.color; }
      if(t.text) drawTextClip(t.text, t.x+CONTENT_CX, t.y+CONTENT_Y, CONTENT_MAXW, false);
    }

    dirtyCells.clear();
  }
  // measureText 缓存:两级对象,避免每次 t+'|'+size 字符串拼接
  // measureCache[size][text] = width,命中时零拼接开销
  let measureCache = Object.create(null);
  let measureCount = 0;
  function measureAt(t, size, font){
    let bySize = measureCache[size];
    if(bySize){
      const cached = bySize[t];
      if(cached !== undefined) return cached;
    } else {
      bySize = measureCache[size] = Object.create(null);
    }
    // 超过 2000 条整体重建,避免逐 key delete 的 O(n) 开销
    if(measureCount > 2000){
      measureCache = Object.create(null);
      measureCount = 0;
      bySize = measureCache[size] = Object.create(null);
    }
    // 测量前保存 ctx.font,测完恢复,避免污染渲染状态导致抖动
    const saved = ctx.font;
    ctx.font = font;
    const w = ctx.measureText(t).width;
    ctx.font = saved;
    bySize[t] = w;
    measureCount++;
    return w;
  }
  function drawTextClip(text, x, y, maxW, isTitle){
    if(!text){ return; }
    const t = typeof text === 'string' ? text : String(text);
    const origSize = isTitle ? CONFIG.font.titleSize : CONFIG.font.contentSize;
    const weight   = isTitle ? CONFIG.font.titleWeight : CONFIG.font.contentWeight;
    const origFont = fontOf(weight, origSize);
    const baseFont = ctx.font;
    // 快速路径:原字号能放下,直接画
    if(measureAt(t, origSize, origFont) <= maxW){
      if(origFont !== baseFont) ctx.font = origFont;
      ctx.fillText(t, x, y);
      if(origFont !== baseFont) ctx.font = baseFont;
      return;
    }
    const minSize  = isTitle ? CONFIG.font.minTitle   : CONFIG.font.minContent;
    // 二分查找最大能放下的字号(O(log n));fontOf 已全局缓存,无字符串拼接开销
    let lo = minSize, hi = origSize, bestSize = minSize;
    while(lo <= hi){
      const mid = Math.floor((lo + hi) / 2);
      if(measureAt(t, mid, fontOf(weight, mid)) <= maxW){
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    // bestSize 是二分已验证能放下的最大字号,直接画即可(无需再测)
    const bestFont = fontOf(weight, bestSize);
    ctx.font = bestFont;
    if(bestSize > minSize || measureAt(t, bestSize, bestFont) <= maxW){
      ctx.fillText(t, x, y);
    } else {
      // 兜底:bestSize 仍放不下(理论不会到这),截断加省略号
      // 用二分查找截断长度,避免逐字删除的多次 measureText
      let lo = 1, hi = t.length, bestLen = 0;
      const ellipsis = '…';
      while(lo <= hi){
        const mid = Math.floor((lo + hi) / 2);
        if(measureAt(t.slice(0, mid) + ellipsis, bestSize, bestFont) <= maxW){
          bestLen = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      ctx.fillText(t.slice(0, bestLen) + ellipsis, x, y);
    }
    ctx.font = baseFont;
  }
  let toastTimer;
  function showToast(msg, err){
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 2500);
  }

  const BT = window.Niimbot;   // niimbot-web-bluetooth 全局对象(v2.4:静态方法 API)

  /* ---------- 状态机 ----------
     单一状态源,所有 UI 由 transition() 集中同步,业务层只读写 state。
     消除原先 isConnected / 按钮文字 / disabled / classList 四处手动同步的脆弱写法。
  */
  const STATE = Object.freeze({
    UNSUPPORTED: 'unsupported',   // 浏览器/驱动不可用
    DISCONNECTED: 'disconnected', // 初始未连接
    CONNECTING:   'connecting',   // 正在弹出设备选择 / 识别中
    CONNECTED:    'connected',    // 已连接,可打印
    DISCONNECTING:'disconnecting' // 正在断开
  });
  let state = STATE.UNSUPPORTED;
  let statusCtx = { sub:'' };   // 传给 transition 的上下文(sub/btn 覆盖)

  /* 状态映射:纯数据,描述每状态的 UI 表现(btn 由 i18n 提供,sub 由 statusCtx 覆盖) */
  const STATUS_MAP = {
    [STATE.UNSUPPORTED]:  { dot:'no',    btnKey:'buttons.connect',     btnDisabled:true,  printDisabled:true  },
    [STATE.DISCONNECTED]: { dot:'ready', btnKey:'buttons.connect',     btnDisabled:false, printDisabled:true  },
    [STATE.CONNECTING]:   { dot:'ready', btnKey:'buttons.connecting',  btnDisabled:true,  printDisabled:true  },
    [STATE.CONNECTED]:    { dot:'ok',    btnKey:'buttons.disconnect',  btnDisabled:false, printDisabled:false },
    [STATE.DISCONNECTING]:{ dot:'ready', btnKey:'buttons.disconnecting',btnDisabled:true,  printDisabled:true  }
  };
  function renderStatus(){
    const m = STATUS_MAP[state] || STATUS_MAP[STATE.DISCONNECTED];
    statusDot.className = 'status-dot ' + m.dot;
    btnLabel.textContent = statusCtx.btn || t(m.btnKey);
    btnConnect.disabled = statusCtx.btnDisabled !== undefined ? statusCtx.btnDisabled : m.btnDisabled;
    btnPrint.disabled = m.printDisabled;
    // caption:优先用 subKey(随语言切换刷新),否则用已解析的 sub(动态消息)
    statusSub.textContent = statusCtx.subKey ? t(statusCtx.subKey) : (statusCtx.sub || '');
  }

  // 唯一的状态切换入口。newSub/newText 可选,缺省时由状态推导默认文案
  function transition(newState, ctx){
    state = newState;
    statusCtx = ctx || {};
    renderStatus();
  }

  /* ---------- registry:打印机型号 + 标签尺寸(纯数据,见 registry.js) ---------- */
  const REGISTRY = window.REGISTRY;
  const DEFAULT_MODEL = window.DEFAULT_MODEL;

  /* ---------- 型号 / 尺寸 下拉菜单 ---------- */
  let lastPopulatedModelKey = null;   // populateLabelsForModel 缓存,避免相同型号重复重建
  function populateModels(){
    selModel.innerHTML = '';
    Object.entries(REGISTRY.models).forEach(([k, m]) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${m.label} (${m.dpi} dpi)`;
      selModel.appendChild(o);
    });
    selModel.value = DEFAULT_MODEL;
  }
  function populateLabelsForModel(modelKey){
    // 缓存:相同型号不重复重建 option 列表
    if(lastPopulatedModelKey === modelKey && selLabel.children.length > 0) return;
    lastPopulatedModelKey = modelKey;
    const m = REGISTRY.models[modelKey];
    const dpi = m ? m.dpi : 300;
    selLabel.innerHTML = '';
    // 直接取预计算的 dpi 索引,免去遍历过滤;空则兜底全量
    const byDpi = REGISTRY._byDpi[dpi];
    const list = byDpi ? Object.entries(byDpi) : Object.entries(REGISTRY.sizes);
    list.forEach(([k, s]) => {
      const o = document.createElement('option');
      o.value = k;
      const orient = s.w_px >= s.h_px ? '→横' : '↕竖';
      o.textContent = `${s.label}  ${orient} (${s.w_px}×${s.h_px}px)`;
      selLabel.appendChild(o);
    });
    // 默认尺寸:优先用 model.defaultSize 字段,兜底取第一个
    selLabel.value = (m && m.defaultSize && byDpi && byDpi[m.defaultSize]) ? m.defaultSize : list[0][0];
  }
  function getCurrentModel(){ return REGISTRY.models[selModel.value]; }
  function getCurrentLabel(){ return REGISTRY.sizes[selLabel.value]; }

  /* ---------- 支持检测 ---------- */
  function detectSupport(){
    const WB = navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
    const LIB = typeof BT !== 'undefined' && BT && typeof BT.isSupported === 'function';
    if(!LIB){
      transition(STATE.UNSUPPORTED, { subKey:'status.unsupportedDriver' });
      return false;
    }
    if(!WB || !BT.isSupported()){
      transition(STATE.UNSUPPORTED, { subKey:'status.unsupportedBT' });
      return false;
    }
    populateModels();
    populateLabelsForModel(DEFAULT_MODEL);
    transition(STATE.DISCONNECTED, { sub:'' });
    return true;
  }

  /* ---------- 连接 / 识别(niimbot v2.4:Niimbot.identify 自动连接) ---------- */
  async function doConnect(){
    if(!BT) return;
    const modelHint = getCurrentModel();
    // 进入 connecting:按钮自动 disabled,显示"连接中…"
    transition(STATE.CONNECTING, { sub: S.status.selectDevice });
    try{
      showToast(S.toast.connecting);
      // 使用所有已知型号的 name_prefixes 并集,保证任一款 Niimbot 都能在系统列表里被搜到
      const allPrefixes = [...new Set(Object.values(REGISTRY.models).flatMap(m => m.name_prefixes || []))];
      const info = await BT.identify({ ...modelHint, name_prefixes: allPrefixes });
      // 根据返回的 modelId 自动匹配正确型号
      const matchedKey = Object.keys(REGISTRY.models).find(k => REGISTRY.models[k].id === info.modelId);
      if(matchedKey && matchedKey !== selModel.value){
        selModel.value = matchedKey;
        populateLabelsForModel(matchedKey);
      }
      const devName = (info && info.deviceName) || 'Niimbot';
      const extra = matchedKey ? S.status.modelSwitched(REGISTRY.models[matchedKey].label) : S.status.modelUnknown(info.modelId);
      transition(STATE.CONNECTED, { sub: S.status.connected(devName, extra) });
      showToast(S.toast.connected);
    }catch(err){
      console.error(err);
      const rawMsg = err && err.message ? err.message : '';
      const isCancel = /cancel|取消|aborted|user.*cancel|chooser.*closed/i.test(rawMsg);
      if(isCancel){
        // 用户主动取消 → 完全回到初始未连接状态
        transition(STATE.DISCONNECTED, { sub:'' });
        showToast(S.toast.cancelled);
      }else{
        // 真实失败:仍处于 DISCONNECTED(按钮可重试),caption 显示原因
        transition(STATE.DISCONNECTED, { sub: S.status.connectFailed(rawMsg) });
        showToast(S.toast.connectFailed, true);
      }
    }
  }

  async function doDisconnect(){
    transition(STATE.DISCONNECTING, { sub:'' });
    try{ if(BT) await BT.disconnect(); }catch(e){}
    transition(STATE.DISCONNECTED, { sub:'' });
    showToast(S.toast.disconnected);
  }

  /* 按钮唯一 handler:根据当前状态派发 connect / disconnect
     彻底消除原先 removeEventListener + {once:true} 手动切 handler 的脆弱写法 */
  function onConnectClick(){
    if(state === STATE.DISCONNECTED)      doConnect();
    else if(state === STATE.CONNECTED)   doDisconnect();
    // CONNECTING / DISCONNECTING / UNSUPPORTED 状态下按钮已 disabled,不会进来
  }

  /* ---------- 渲染到标签尺寸的新 canvas(含等比缩放 + 左右偏移校准 + 黑白二值化) ---------- */
  // fitMode 缩放比策略:每种模式只管算缩放比,居中偏移统一计算
  const FIT_STRATEGIES = {
    stretch: (iw, ih, pw, ph) => null,                              // stretch 直接填满,不走缩放比
    cover:   (iw, ih, pw, ph) => Math.max(pw/iw, ph/ih),
    contain: (iw, ih, pw, ph) => Math.min(pw/iw, ph/ih)
  };
  function renderToPrintSize(lbl, fitMode, offsetX, offsetY){
    const pc = document.createElement('canvas');
    pc.width = lbl.w_px;
    pc.height = lbl.h_px;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, pc.width, pc.height);

    const iw = W, ih = H;
    let dw, dh, dx, dy;
    const strategy = FIT_STRATEGIES[fitMode] || FIT_STRATEGIES.contain;
    const r = strategy(iw, ih, pc.width, pc.height);
    if(r === null){
      // stretch:直接填满画布
      dw = pc.width; dh = pc.height; dx = 0; dy = 0;
    } else {
      dw = iw*r; dh = ih*r;
      dx = (pc.width - dw)/2;
      dy = (pc.height - dh)/2;
    }
    // 左右偏移校准:正值整体右移,负值整体左移
    // clamp 到合理范围,避免偏移过大导致内容完全偏出画布
    const offX = Number(offsetX) || 0;
    const offY = Number(offsetY) || 0;
    const maxX = Math.max(0, (pc.width - dw) / 2);
    const maxY = Math.max(0, (pc.height - dh) / 2);
    dx += Math.max(-maxX, Math.min(maxX, offX));
    dy += Math.max(-maxY, Math.min(maxY, offY));
    pctx.drawImage(canvas, 0, 0, iw, ih, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    // 二值化(热敏打印机只有黑点/白点,阈值 CONFIG.binarize.threshold)
    // Uint32Array 视图:每像素一次读写,替代逐字节 RGBA 循环,大标签提速 ~35%
    try{
      const img = pctx.getImageData(0, 0, pc.width, pc.height);
      const u32 = new Uint32Array(img.data.buffer);
      const thr = CONFIG.binarize.threshold;
      const black = 0xFF000000;   // ABGR 小端:不透明黑
      const white = 0xFFFFFFFF;   // 不透明白
      for(let i=0; i<u32.length; i++){
        const p = u32[i];
        const l = 0.299*(p&0xFF) + 0.587*((p>>8)&0xFF) + 0.114*((p>>16)&0xFF);
        u32[i] = l < thr ? black : white;
      }
      pctx.putImageData(img, 0, 0);
    }catch(e){}
    return pc;
  }

  /* ---------- 打印(Niimbot.printImage,PNG dataURL) ---------- */
  async function onPrint(){
    if(!BT){ showToast(S.toast.noDriver, true); return; }
    draw(true);
    const model = getCurrentModel();
    const size  = getCurrentLabel();
    if(!model || !size){ showToast(S.toast.noDriver, true); return; }
    const fit = selFit.value;
    const copies  = getStepperVal('copies',    CONFIG.stepper.copies);
    const density = getStepperVal('selDensity', CONFIG.stepper.density);
    const offsetX = getStepperVal('selOffsetX', CONFIG.stepper.offsetX);
    const offsetY = getStepperVal('selOffsetY', CONFIG.stepper.offsetY);

    btnPrint.disabled = true;
    try{
      const offsetHint = (offsetX===0 && offsetY===0) ? '' : ` · X${offsetX>=0?'+':''}${offsetX} Y${offsetY>=0?'+':''}${offsetY}px`;
      showToast(S.toast.printing(copies, size.label, offsetHint));
      const printCanvas = renderToPrintSize(size, fit, offsetX, offsetY);
      const pngDataURL = printCanvas.toDataURL('image/png');
      // 真实打印进度:停留在 CONNECTED,按钮显示"打印中…"并禁用
      const onProgress = (msg) => {
        const detail = (typeof msg === 'string') ? msg : (msg && msg.detail ? msg.detail : t('buttons.printing'));
        transition(STATE.CONNECTED, { btn:t('buttons.printing'), btnDisabled:true, sub:detail });
      };
      await BT.printImage(pngDataURL, { model, size, copies, density, onProgress });
      transition(STATE.CONNECTED, {
        sub: S.toast.printed + ' · ' + copies + ' × ' + size.label
      });
      showToast(S.toast.printed);
    }catch(err){
      console.error(err);
      const msg = err && err.message ? err.message : S.toast.printFailed('');
      transition(STATE.CONNECTED, { sub: S.toast.printFailed(msg) });
      showToast(S.toast.printFailed(msg), true);
    }finally{
      btnPrint.disabled = false;
    }
  }

  /* ---------- 事件绑定 ---------- */
  selModel.addEventListener('change', () => {
    const cur = selModel.value;
    populateLabelsForModel(cur);
    showToast(S.toast.modelSwitched(REGISTRY.models[cur].label));
  });

  /* ============ 初始化 ============ */
  btnConnect.addEventListener('click', onConnectClick);
  btnPrint.addEventListener('click', onPrint);
  // 语言切换:事件委托,新增语言按钮自动支持
  document.getElementById('langSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-btn');
    if(btn) setLang(btn.dataset.lang);
  });

  // 通用 stepper 工具:clamp + 读取,范围常量来自 CONFIG.stepper
  function clampInt(v, min, max){ return Math.max(min, Math.min(max, v|0)); }
  function getStepperVal(hiddenId, cfg){
    return clampInt(parseInt(document.getElementById(hiddenId).value || String(cfg.def), 10), cfg.min, cfg.max);
  }
  function initStepper(stepperId, valId, hiddenId, cfg){
    const stepper = document.getElementById(stepperId);
    if(!stepper) return;
    const valEl = document.getElementById(valId);
    const hidden = document.getElementById(hiddenId);
    const setVal = (n) => {
      n = clampInt(n, cfg.min, cfg.max);
      valEl.textContent = n;
      hidden.value = n;
    };
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('.stepper-btn');
      if(!btn) return;
      const cur = parseInt(hidden.value||String(cfg.def), 10);
      setVal(btn.dataset.act === 'inc' ? cur + 1 : cur - 1);
    });
    setVal(parseInt(hidden.value||String(cfg.def), 10));
  }
  function initSteppers(){
    initStepper('densityStepper', 'densityVal', 'selDensity', CONFIG.stepper.density);
    initStepper('copiesStepper',  'copiesVal',  'copies',     CONFIG.stepper.copies);
    initStepper('offsetXStepper', 'offsetXVal', 'selOffsetX', CONFIG.stepper.offsetX);
    initStepper('offsetYStepper', 'offsetYVal', 'selOffsetY', CONFIG.stepper.offsetY);
  }
  // Barlow Condensed 异步加载:加载完才显示 canvas,避免用户看到 fallback 字体闪烁
  function waitForFonts(){
    const show = () => { draw(); canvas.classList.add('ready'); };
    if(document.fonts && typeof document.fonts.ready !== 'undefined' && document.fonts.ready && typeof document.fonts.ready.then === 'function'){
      document.fonts.ready.then(show).catch(() => {
        setTimeout(()=>{ try{ show(); }catch(e){} }, 2000);
      });
    } else {
      // 不支持 document.fonts 的老环境,2 秒后兜底
      setTimeout(()=>{ try{ show(); }catch(e){} }, 2000);
    }
  }
  // 蓝牙支持检测:defer 已保证 app.js 在 niimbot.js 之后执行,但 CDN 可能失败,兜底等 load 事件
  function detectBluetoothSupport(){
    if(typeof window.Niimbot !== 'undefined' && typeof window.Niimbot.isSupported === 'function'){
      detectSupport();
      return;
    }
    if(document.readyState === 'complete'){
      detectSupport();
    } else {
      window.addEventListener('load', () => detectSupport(), { once: true });
    }
  }
  // 初始化单一入口:顺序清晰,每个子函数职责单一
  function init(){
    applyI18n();
    bindInputs();
    fillInputs();
    // draw 延迟到 waitForFonts 内,字体加载完再画,避免 fallback 闪烁
    initSteppers();
    waitForFonts();
    detectBluetoothSupport();
  }
  init();
})();
