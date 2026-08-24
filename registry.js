/* ============================================================
   Label Maker — 打印机型号与标签尺寸配置
   纯数据文件:加型号/尺寸只改这里,不用碰 app.js 业务逻辑
   数据来源:niimbot-web-bluetooth@2.4.0 registry.json
   ============================================================ */
window.REGISTRY = {
  models: {
    b1pro: { key:'b1pro', label:'B1 Pro',       id:4097, dpi:300, protocol:'v4', task:'v4',   density:3, label_type:1, speed:1, name_prefixes:['B1'] },
    b2pro: { key:'b2pro', label:'B2 Pro',       id:6912, dpi:300, protocol:'v4', task:'v4',   density:3, label_type:1, speed:1, name_prefixes:['B2'] },
    b1:    { key:'b1',    label:'B1 (203 dpi)', id:4096, dpi:203, protocol:'v4', task:'b1',   density:3, label_type:1, speed:1, name_prefixes:['B1'] },
    d11h:  { key:'d11h',  label:'D11_H',        id:528,  dpi:300, protocol:'v4', task:'v4',   density:3, label_type:1, speed:1, name_prefixes:['D11'] },
    m2h:   { key:'m2h',   label:'M2-H',         id:4608, dpi:300, protocol:'v4', task:'b1',   density:3, label_type:1, speed:1, name_prefixes:['M2'] },
    d110:  { key:'d110',  label:'D110',          id:2304, dpi:203, protocol:'v4', task:'b1',   density:3, label_type:1, speed:1, name_prefixes:['D110'] },
    n1:    { key:'n1',    label:'N1',           id:3586, dpi:203, protocol:'v4', task:'b1',   density:3, label_type:1, speed:1, name_prefixes:['N1'] },
  },
  /* size.key 格式: T{W}x{H}[_modelSuffix]。
     w_px = 打印头方向(横向),h_px = 走纸方向(纵向)。
     每个 model 只显示自己 dpi 匹配的尺寸(用户选错 dpi 边缘会被截断)。 */
  sizes: {
    /* ====== 300 dpi: B1 Pro / B2 Pro / M2-H / D11_H ====== */
    T15x30_300:  { key:'T15x30_300',  label:'15 × 30 mm',         code:'T15*30',  w_mm:15, h_mm:30, w_px:177, h_px:354, margin:6,  dpi:300 },
    T20x40_300:  { key:'T20x40_300',  label:'20 × 40 mm',         code:'T20*40',  w_mm:20, h_mm:40, w_px:236, h_px:472, margin:8,  dpi:300 },
    T25x25_300:  { key:'T25x25_300',  label:'25 × 25 mm（方）',   code:'T25*25',  w_mm:25, h_mm:25, w_px:295, h_px:295, margin:8,  dpi:300 },
    T25x38_300:  { key:'T25x38_300',  label:'25 × 38 mm（线缆旗）',code:'T25*38+40',w_mm:25,h_mm:38,w_px:295,h_px:449,margin:10,dpi:300 },
    T30x20_300:  { key:'T30x20_300',  label:'30 × 20 mm（横）',   code:'T30*20',  w_mm:30, h_mm:20, w_px:354, h_px:236, margin:10, dpi:300 },
    T30x30_300:  { key:'T30x30_300',  label:'30 × 30 mm',         code:'T30*30',  w_mm:30, h_mm:30, w_px:354, h_px:354, margin:10, dpi:300 },
    T30x45_300:  { key:'T30x45_300',  label:'30 × 45 mm（线缆旗）',code:'T30*45+50',w_mm:30,h_mm:45,w_px:354,h_px:531,margin:10,dpi:300 },
    T40x20_300:  { key:'T40x20_300',  label:'40 × 20 mm（横）',   code:'T40*20',  w_mm:40, h_mm:20, w_px:472, h_px:236, margin:10, dpi:300 },
    T40x30_300:  { key:'T40x30_300',  label:'40 × 30 mm（横）',   code:'T40*30',  w_mm:40, h_mm:30, w_px:472, h_px:354, margin:10, dpi:300 },
    T40x60_300:  { key:'T40x60_300',  label:'40 × 60 mm（大）',   code:'T40*60',  w_mm:40, h_mm:60, w_px:472, h_px:709, margin:10, dpi:300 },
    T50x30_300:  { key:'T50x30_300',  label:'50 × 30 mm（大横）', code:'T50*30',  w_mm:50, h_mm:30, w_px:584, h_px:354, margin:10, dpi:300 },
    T50x50_300:  { key:'T50x50_300',  label:'50 × 50 mm（大方）', code:'T50*50',  w_mm:50, h_mm:50, w_px:584, h_px:591, margin:10, dpi:300 },
    T50x80_300:  { key:'T50x80_300',  label:'50 × 80 mm（竖大）', code:'T50*80',  w_mm:50, h_mm:80, w_px:584, h_px:945, margin:10, dpi:300 },
    T60x40_300:  { key:'T60x40_300',  label:'60 × 40 mm',         code:'T60*40',  w_mm:60, h_mm:40, w_px:709, h_px:472, margin:10, dpi:300 },

    /* ====== 203 dpi: B1 / D110 / N1 ====== */
    T14x50_203:  { key:'T14x50_203',  label:'14 × 50 mm（经典条）',code:'T14*50', w_mm:14, h_mm:50, w_px:96,  h_px:400, margin:6,  dpi:203, offset_y_px:-1 },
    T15x30_203:  { key:'T15x30_203',  label:'15 × 30 mm',         code:'T15*30',  w_mm:15, h_mm:30, w_px:120, h_px:240, margin:6,  dpi:203 },
    T15x50_203:  { key:'T15x50_203',  label:'15 × 50 mm（小条）', code:'T15*50',  w_mm:15, h_mm:50, w_px:96,  h_px:400, margin:6,  dpi:203, offset_y_px:-2 },
    T20x20_203:  { key:'T20x20_203',  label:'20 × 20 mm（方）',   code:'T20*20',  w_mm:20, h_mm:20, w_px:160, h_px:160, margin:8,  dpi:203 },
    T25x25_203:  { key:'T25x25_203',  label:'25 × 25 mm（方）',   code:'T25*25',  w_mm:25, h_mm:25, w_px:200, h_px:200, margin:8,  dpi:203 },
    T30x20_203:  { key:'T30x20_203',  label:'30 × 20 mm（横）',   code:'T30*20',  w_mm:30, h_mm:20, w_px:240, h_px:160, margin:10, dpi:203 },
    T30x30_203:  { key:'T30x30_203',  label:'30 × 30 mm',         code:'T30*30',  w_mm:30, h_mm:30, w_px:240, h_px:240, margin:10, dpi:203 },
    T40x20_203:  { key:'T40x20_203',  label:'40 × 20 mm（横）',   code:'T40*20',  w_mm:40, h_mm:20, w_px:320, h_px:160, margin:10, dpi:203 },
    T40x30_203:  { key:'T40x30_203',  label:'40 × 30 mm（横）',   code:'T40*30',  w_mm:40, h_mm:30, w_px:320, h_px:240, margin:10, dpi:203 },
    T50x30_203:  { key:'T50x30_203',  label:'50 × 30 mm（大横）', code:'T50*30',  w_mm:50, h_mm:30, w_px:384, h_px:240, margin:8,  dpi:203, offset_y_px:4 },
    T50x80_203:  { key:'T50x80_203',  label:'50 × 80 mm（大）',   code:'T50*80',  w_mm:50, h_mm:80, w_px:384, h_px:640, margin:10, dpi:203 },
    T60x40_203:  { key:'T60x40_203',  label:'60 × 40 mm',         code:'T60*40',  w_mm:60, h_mm:40, w_px:480, h_px:320, margin:10, dpi:203 },
  }
};

/* 预计算按 dpi 分组的尺寸索引,免去 populateLabelsForModel 每次遍历过滤 */
window.REGISTRY._byDpi = {};
for(const [k,s] of Object.entries(window.REGISTRY.sizes)){
  (window.REGISTRY._byDpi[s.dpi] = window.REGISTRY._byDpi[s.dpi] || {})[k] = s;
}

/* model 默认选择 */
window.DEFAULT_MODEL = 'b1pro';
