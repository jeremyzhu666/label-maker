/* ============================================================
   Kali Academy — 交互式 Kali Linux 学习平台
   ============================================================ */
'use strict';

/* ---------- 工具 ---------- */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const Store = {
    KEY: 'kali_academy_progress_v1',
    get() {
        try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
        catch { return {}; }
    },
    set(obj) { localStorage.setItem(this.KEY, JSON.stringify(obj)); },
    markDone(id) {
        const p = this.get(); p[id] = true; this.set(p);
    },
    isDone(id) { return !!this.get()[id]; },
    reset() { localStorage.removeItem(this.KEY); }
};

function toast(msg, type = 'info') {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const ic = type === 'success' ? '✓' : 'ℹ';
    el.innerHTML = `<span class="toast-ic">${ic}</span><span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ---------- 虚拟文件系统(终端模拟) ---------- */
function makeFS() {
    return {
        '/': {
            type: 'dir',
            children: {
                'home': { type: 'dir', children: {
                    'kali': { type: 'dir', children: {
                        'Desktop': { type: 'dir', children: {} },
                        'Documents': { type: 'dir', children: {
                            'notes.txt': { type: 'file', content: 'Kali 学习笔记\n1. 永远在授权环境下练习\n2. 记录每一步操作' },
                            'targets.txt': { type: 'file', content: '# 授权目标列表\n10.0.0.1  本地路由器\n10.0.0.5  测试机(已授权)' }
                        } },
                        'Downloads': { type: 'dir', children: {} },
                        'wordlist.txt': { type: 'file', content: 'password\n123456\nadmin\nletmein\nkali\ntoor\nroot\nqwerty' }
                    } }
                } },
                'etc': { type: 'dir', children: {
                    'hostname': { type: 'file', content: 'kali' },
                    'os-release': { type: 'file', content: 'PRETTY_NAME="Kali GNU/Linux Rolling"\nNAME="Kali GNU/Linux"' }
                } },
                'usr': { type: 'dir', children: {
                    'share': { type: 'dir', children: {
                        'wordlists': { type: 'dir', children: {
                            'rockyou.txt': { type: 'file', content: '[压缩字典示例 — 1400万条密码]' }
                        } }
                    } }
                } }
            }
        }
    };
}

/* ---------- 终端模拟器 ---------- */
class Terminal {
    constructor(root, opts) {
        this.root = root;
        this.body = $('.terminal-body', root);
        this.taskEl = $('.terminal-task', root);
        this.fs = opts.fs || makeFS();
        this.cwd = opts.cwd || '/home/kali';
        this.user = 'kali';
        this.host = 'kali';
        this.task = opts.task || '';
        this.hint = opts.hint || '';
        this.goal = opts.goal || null;        // {cmd, re} 完成判定
        this.onDone = opts.onDone || (() => {});
        this.done = false;
        this.history = [];
        this.hIdx = -1;
        this.inputBuf = '';
        this.hiddenInput = null;
        this.caret = null;
        this.cmdLog = [];
        this.init();
    }
    init() {
        this.body.innerHTML = '';
        this.println(this.welcome(), 't-out');
        this.println('输入 help 查看可用命令。在终端区域点击即可输入。', 't-warn');
        this.newLine();
        this.body.addEventListener('click', () => this.focus());
    }
    welcome() {
        return '┌──(' + this.user + '@' + this.host + ')-[~]\n└─$ 欢迎使用 Kali Academy 互动终端';
    }
    focus() { if (this.curInput) this.curInput.focus(); }
    onKey(e) {
        const inp = e.target;
        if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = inp.value;
            this.history.unshift(cmd);
            this.hIdx = -1;
            this.commitLine(cmd);
            this.run(cmd);
            this.newLine();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.hIdx < this.history.length - 1) { this.hIdx++; inp.value = this.history[this.hIdx]; }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.hIdx > 0) { this.hIdx--; inp.value = this.history[this.hIdx]; }
            else { this.hIdx = -1; inp.value = ''; }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this.tabComplete();
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            this.body.innerHTML = '';
            this.newLine();
        }
    }
    commitLine(cmd) {
        const line = this.body.querySelector('.terminal-input-line');
        if (line) {
            line.outerHTML = `<div class="t-line"><span class="t-prompt">${this.promptStr()}</span> <span class="t-input">${esc(cmd)}</span></div>`;
        }
    }
    promptStr() {
        const path = this.cwd.replace('/home/kali', '~');
        return `┌──(<span class="t-user">${this.user}@${this.host}</span>)-[<span class="t-path">${path}</span>]\n└─<span class="t-prompt">$</span>`;
    }
    newLine() {
        const old = this.body.querySelector('.terminal-input-line');
        if (old) old.remove();
        const wrap = document.createElement('div');
        wrap.className = 'terminal-input-line';
        const path = this.cwd.replace('/home/kali', '~');
        wrap.innerHTML = `<div class="t-prompt-block">┌──(<span class="t-user">${this.user}@${this.host}</span>)-[<span class="t-path">${path}</span>]</div><div class="t-input-row"><span class="t-prompt">└─$</span><input class="term-live-input" autocomplete="off" spellcheck="false" /></div>`;
        this.body.appendChild(wrap);
        const inp = wrap.querySelector('.term-live-input');
        this.curInput = inp;
        inp.addEventListener('keydown', e => this.onKey(e));
        this.body.scrollTop = this.body.scrollHeight;
        this.focus();
    }
    println(text, cls = 't-out') {
        const lines = String(text).split('\n');
        for (const l of lines) {
            const d = document.createElement('div');
            d.className = 't-line ' + cls;
            d.innerHTML = l;
            this.body.appendChild(d);
        }
        this.body.scrollTop = this.body.scrollHeight;
    }
    run(raw) {
        const cmd = raw.trim();
        if (!cmd) return;
        this.cmdLog.push(cmd);
        const [name, ...args] = cmd.split(/\s+/);
        const handler = this.commands[name];
        if (!handler) {
            this.println(`${name}: 命令未找到。输入 help 查看可用命令。`, 't-err');
            return;
        }
        try { handler.call(this, args); } catch (err) { this.println(`错误: ${err.message}`, 't-err'); }
        this.checkGoal(cmd);
    }
    checkGoal(cmd) {
        if (this.done || !this.goal) return;
        const ok = this.goal.cmd ? cmd.trim().startsWith(this.goal.cmd) : (this.goal.re ? this.goal.re.test(cmd) : false);
        if (ok) {
            this.done = true;
            this.println('', 't-out');
            this.println('✓ 任务完成!干得漂亮!', 't-ok');
            this.taskEl.classList.add('done');
            const chk = this.taskEl.querySelector('.task-check');
            if (chk) chk.classList.add('done');
            this.onDone();
        }
    }
    /* 路径解析 */
    resolve(path) {
        if (!path) return this.cwd;
        if (path === '~') return '/home/kali';
        if (path.startsWith('~/')) path = '/home/kali/' + path.slice(2);
        let p = path.startsWith('/') ? path : this.cwd + '/' + path;
        const parts = p.split('/').filter(Boolean);
        const out = [];
        for (const part of parts) {
            if (part === '.') continue;
            else if (part === '..') out.pop();
            else out.push(part);
        }
        return '/' + out.join('/');
    }
    getNode(path) {
        const p = this.resolve(path).split('/').filter(Boolean);
        let node = this.fs['/'];
        for (const part of p) {
            if (!node || node.type !== 'dir' || !node.children[part]) return null;
            node = node.children[part];
        }
        return node;
    }
    tabComplete() {
        const inp = this.curInput;
        if (!inp) return;
        const parts = inp.value.split(/\s+/);
        if (parts.length <= 1) {
            const cmds = Object.keys(this.commands).filter(c => c.startsWith(parts[0]));
            if (cmds.length === 1) { inp.value = cmds[0] + ' '; }
            else if (cmds.length > 1) { this.println(cmds.join('   '), 't-info'); }
        } else {
            const target = parts[parts.length - 1];
            const dir = this.getNode(parts.slice(1, -1).join('/') || '.');
            if (dir && dir.type === 'dir') {
                const matches = Object.keys(dir.children).filter(c => c.startsWith(target));
                if (matches.length === 1) {
                    parts[parts.length - 1] = matches[0];
                    inp.value = parts.join(' ');
                } else if (matches.length > 1) {
                    this.println(matches.join('   '), 't-info');
                }
            }
        }
    }
}

/* 命令集(挂在原型上,每节课可扩展) */
Terminal.prototype.commands = {
    help() {
        this.println('可用命令:', 't-info');
        this.println('  导航: pwd, ls, cd <目录>, cd .., cd ~', 't-out');
        this.println('  文件: cat <文件>, touch <文件>, mkdir <目录>, rm <文件>, echo <文本>', 't-out');
        this.println('  系统: whoami, hostname, uname -a, date, clear, history', 't-out');
        this.println('  网络: ifconfig, ping <主机>, ip a', 't-out');
        this.println('  安全: nmap <目标>, man <命令>', 't-out');
    },
    pwd() { this.println(this.cwd); },
    ls(args) {
        const path = args.find(a => !a.startsWith('-')) || '.';
        const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const long = args.includes('-l') || args.includes('-la') || args.includes('-al');
        const node = this.getNode(path);
        if (!node) { this.println(`ls: 无法访问 '${path}': 没有那个文件或目录`, 't-err'); return; }
        if (node.type === 'file') { this.println(path); return; }
        let names = Object.keys(node.children);
        if (!showAll) names = names.filter(n => !n.startsWith('.'));
        if (long) {
            for (const n of names) {
                const c = node.children[n];
                const t = c.type === 'dir' ? 'd' : '-';
                const sz = c.type === 'file' ? (c.content.length) : 4096;
                this.println(`${t}rwxr-xr-x kali kali ${String(sz).padStart(6)} ${n}`, c.type === 'dir' ? 't-info' : 't-out');
            }
        } else {
            this.println(names.map(n => node.children[n].type === 'dir' ? n + '/' : n).join('   '), 't-info');
        }
    },
    cd(args) {
        const target = args[0] || '~';
        if (target === '..') {
            const parts = this.cwd.split('/').filter(Boolean); parts.pop();
            this.cwd = '/' + parts.join('/'); if (this.cwd === '/') this.cwd = '/';
            return;
        }
        const p = this.resolve(target);
        const node = this.getNode(target);
        if (!node) { this.println(`cd: ${target}: 没有那个文件或目录`, 't-err'); return; }
        if (node.type !== 'dir') { this.println(`cd: ${target}: 不是目录`, 't-err'); return; }
        this.cwd = p === '' ? '/' : p;
    },
    cat(args) {
        if (!args[0]) { this.println('cat: 缺少文件操作数', 't-err'); return; }
        const node = this.getNode(args[0]);
        if (!node) { this.println(`cat: ${args[0]}: 没有那个文件或目录`, 't-err'); return; }
        if (node.type !== 'file') { this.println(`cat: ${args[0]}: 是一个目录`, 't-err'); return; }
        this.println(node.content);
    },
    echo(args) { this.println(args.join(' ')); },
    touch(args) {
        if (!args[0]) { this.println('touch: 缺少文件操作数', 't-err'); return; }
        const dir = this.getNode('.');
        if (dir && dir.type === 'dir' && !dir.children[args[0]]) {
            dir.children[args[0]] = { type: 'file', content: '' };
        }
    },
    mkdir(args) {
        if (!args[0]) { this.println('mkdir: 缺少操作数', 't-err'); return; }
        const dir = this.getNode('.');
        if (dir && dir.type === 'dir') dir.children[args[0]] = { type: 'dir', children: {} };
    },
    rm(args) {
        const f = args.find(a => !a.startsWith('-'));
        if (!f) { this.println('rm: 缺少操作数', 't-err'); return; }
        const dir = this.getNode('.');
        if (dir && dir.children[f]) {
            if (dir.children[f].type === 'dir' && !args.includes('-r')) { this.println(`rm: 无法删除 '${f}': 是一个目录 (使用 -r)`, 't-err'); return; }
            delete dir.children[f];
        } else { this.println(`rm: 无法删除 '${f}': 没有那个文件或目录`, 't-err'); }
    },
    whoami() { this.println(this.user); },
    hostname() { this.println(this.host); },
    uname(args) {
        if (args.includes('-a')) this.println('Linux ' + this.host + ' 6.6.0-kali #1 SMP x86_64 GNU/Linux');
        else this.println('Linux');
    },
    date() { this.println(new Date().toString()); },
    history() { this.cmdLog.forEach((c, i) => this.println(`  ${String(i + 1).padStart(3)}  ${c}`)); },
    clear() { this.body.innerHTML = ''; },
    ifconfig() {
        this.println('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500', 't-info');
        this.println('        inet 10.0.0.42  netmask 255.255.255.0  broadcast 10.0.0.255');
        this.println('        ether 08:00:27:a4:c9:1e  txqueuelen 1000  (以太网)');
        this.println('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536', 't-info');
        this.println('        inet 127.0.0.1  netmask 255.0.0.0');
    },
    ip(args) {
        if (args[0] === 'a' || args[0] === 'addr') this.commands.ifconfig.call(this);
        else this.println('用法: ip a', 't-warn');
    },
    ping(args) {
        if (!args[0]) { this.println('ping: 用法: ping <主机>', 't-err'); return; }
        const host = args[0];
        this.println(`PING ${host} (10.0.0.${Math.floor(Math.random() * 200)}) 56(84) 字节的数据。`, 't-info');
        for (let i = 0; i < 3; i++) {
            this.println(`64 字节,来自 ${host}: icmp_seq=${i + 1} ttl=64 时间=${(Math.random() * 5 + 0.3).toFixed(1)} ms`);
        }
        this.println(`\n--- ${host} ping 统计 ---`, 't-out');
        this.println('3 个包已发送,3 个包已接收,0% 丢包', 't-ok');
    },
    nmap(args) {
        if (!args[0]) { this.println('nmap: 用法: nmap <目标> (试试 nmap 10.0.0.5)', 't-warn'); return; }
        const target = args[args.length - 1];
        const stealth = args.includes('-sS');
        const ver = args.includes('-sV');
        this.println(`Starting Nmap 7.94 ( https://nmap.org )`, 't-info');
        this.println(`Nmap scan report for ${target}`, 't-out');
        this.println(`Host is up (0.0008s latency).`, 't-ok');
        this.println('PORT     STATE SERVICE', 't-info');
        const ports = [
            ['22/tcp', 'open', 'ssh', ver ? 'OpenSSH 9.2p1' : ''],
            ['80/tcp', 'open', 'http', ver ? 'Apache httpd 2.4.57' : ''],
            ['443/tcp', 'open', 'https', ver ? 'Apache httpd 2.4.57' : ''],
        ];
        for (const [p, s, sv, v] of ports) this.println(`${p.padEnd(9)} ${s}    ${sv}${v ? ' ' + v : ''}`);
        this.println(`\nNmap done: 1 IP address (1 host up) scanned in ${stealth ? '0.42' : '1.3'} seconds`, 't-out');
    },
    man(args) {
        if (!args[0]) { this.println('man: 你想查看哪个命令的手册? (例如 man ls)', 't-warn'); return; }
        const docs = {
            ls: 'LS(1)\n名称: ls - 列出目录内容\n用法: ls [选项] [文件]\n常用: -l 详细列表  -a 显示隐藏文件  -la 组合',
            cd: 'CD(1) / 内建命令\n名称: cd - 切换当前目录\n用法: cd <目录>   cd .. 返回上级   cd ~ 回主目录',
            nmap: 'NMAP(1)\n名称: nmap - 网络探测与安全审计\n用法: nmap [选项] <目标>\n常用: -sS 隐蔽扫描  -sV 服务版本  -p 指定端口',
            cat: 'CAT(1)\n名称: cat - 连接并打印文件内容\n用法: cat <文件>',
            pwd: 'PWD(1)\n名称: pwd - 打印当前工作目录',
        };
        this.println(docs[args[0]] || `man: 没有关于 ${args[0]} 的手册页`, 't-info');
    },
    exit() { this.println('使用左侧目录切换到下一课继续学习吧!', 't-warn'); }
};

/* ============================================================
   课程数据
   ============================================================ */
const LESSONS = [
{
    id: 'intro',
    title: '认识 Kali Linux',
    diff: 'easy', time: '12 分钟', tags: ['基础概念', '零门槛'],
    lead: '在动手之前,先搞清楚 Kali Linux 是什么、为什么存在、以及如何合法地使用它。这一课没有难度,放轻松。',
    blocks: [
        '<div class="block"><h2>Kali Linux 是什么?</h2><p><strong>Kali Linux</strong> 是一个基于 Debian 的 Linux 发行版,由 <strong>Offensive Security</strong> 公司维护。它预装了 <strong>600 多个</strong>渗透测试与安全审计工具,是安全从业者和学习者最常用的操作系统之一。</p><p>你可以把它理解为一把"瑞士军刀"——专门为<strong>测试系统安全性</strong>而设计,而不是日常办公用的系统。</p></div>',
        '<div class="callout info"><span class="callout-ic">💡</span><div class="callout-body"><strong>核心理解</strong>Kali 不是"黑客工具箱"的代名词,而是一套<strong>合法的安全测试平台</strong>。它的价值在于帮助你理解系统是如何被测试的,从而知道如何防护。</div></div>',
        '<div class="block"><h2>它能做什么?</h2><ul><li><strong>信息收集</strong> — 了解目标的基本情况(端口、服务、系统)</li><li><strong>漏洞扫描</strong> — 发现系统存在的已知弱点</li><li><strong>密码安全</strong> — 测试密码强度、识别弱密码</li><li><strong>Web 应用测试</strong> — 检查网站的安全状况</li><li><strong>无线网络</strong> — 评估 Wi-Fi 安全性</li><li><strong>取证与逆向</strong> — 分析恶意软件、电子取证</li></ul></div>',
        '<div class="callout danger"><span class="callout-ic">⚠️</span><div class="callout-body"><strong>法律红线 — 请认真阅读</strong>未经授权对任何不属于你的系统进行扫描、探测或攻击,<strong>都是违法行为</strong>,可能面临刑事处罚。本平台所有练习都在<strong>模拟终端</strong>中进行,不会接触真实系统。学习安全知识的目的是<strong>保护</strong>,而非破坏。</div></div>',
        '<div class="block"><h2>新手学习心态</h2><ol><li><strong>先理解原理,再记命令</strong> — 知道"为什么"比知道"敲什么"更重要</li><li><strong>多动手</strong> — 每课的终端练习务必亲自完成</li><li><strong>接受困惑</strong> — 安全领域很大,不可能一蹴而就</li><li><strong>始终在授权环境练习</strong> — 用虚拟机、靶场(如 Metasploitable、VulnHub)</li></ol></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课小目标</strong>在下方终端中输入 <code>whoami</code> 和 <code>pwd</code>,感受一下命令行的世界。别怕,输错了也不会有任何问题。</div></div>'
    ],
    terminal: {
        task: '输入 <code>whoami</code> 查看当前用户',
        hint: '直接输入 whoami 然后回车',
        goal: { cmd: 'whoami' }
    }
},
{
    id: 'setup',
    title: '环境准备:虚拟机安装',
    diff: 'easy', time: '15 分钟', tags: ['安装', 'VMware', 'VirtualBox'],
    lead: '最安全的练习方式是把 Kali 装进虚拟机里。本课介绍安装思路与关键概念,你不必现在就动手装,先建立认知。',
    blocks: [
        '<div class="block"><h2>为什么用虚拟机?</h2><p>虚拟机(Virtual Machine)是在你电脑里模拟出来的一台"虚拟电脑"。它的好处是:</p><ul><li><strong>隔离</strong> — Kali 里的操作不会影响你的主系统</li><li><strong>可还原</strong> — 搞砸了用快照一键恢复</li><li><strong>合法</strong> — 在自己机器上测试,完全合规</li></ul></div>',
        '<div class="block"><h2>两种主流虚拟机软件</h2><h3>VirtualBox(免费,推荐新手)</h3><p>Oracle 公司出品,完全免费开源,跨平台,文档丰富,适合第一次接触虚拟机的人。</p><h3>VMware Workstation</h3><p>性能更好,功能更强,个人非商业使用免费。两者任选其一即可。</p></div>',
        '<div class="block"><h2>安装 Kali 的两种方式</h2><h3>方式一:预装镜像(推荐新手)</h3><p>OffSec 官方提供 <strong>现成的虚拟机镜像</strong>(.ova 文件),下载后直接导入虚拟机软件即可使用,免去安装过程。这是最省心的方式。</p><h3>方式二:ISO 手动安装</h3><p>下载 Kali 的安装 ISO,像装系统一样手动安装。过程更复杂,但你能学到更多。</p></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>安装后第一件事</strong>打开终端,执行 <code>sudo apt update && sudo apt upgrade -y</code> 更新系统。Kali 是滚动发行版,保持更新很重要。</div></div>',
        '<div class="block"><h2>关键概念:快照</h2><p>快照(Snapshot)是虚拟机的"存档点"。在做危险操作前先拍快照,出问题就能<strong>瞬间回滚</strong>。这是安全学习的护身符,务必养成习惯。</p></div>',
        '<div class="callout warn"><span class="callout-ic">📌</span><div class="callout-body"><strong>默认登录</strong>Kali 默认用户名和密码都是 <code>kali</code>(旧版本是 root/toor)。新版本已默认禁用 root 直接登录,使用 sudo 提权。</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课小目标</strong>虚拟机不是本课终端的重点,但你可以试试 <code>uname -a</code> 看看"系统信息"长什么样。</div></div>'
    ],
    terminal: {
        task: '输入 <code>uname -a</code> 查看系统内核信息',
        hint: 'uname -a',
        goal: { cmd: 'uname' }
    }
},
{
    id: 'terminal-basics',
    title: '终端与文件系统导航',
    diff: 'easy', time: '20 分钟', tags: ['ls', 'cd', 'pwd', '核心'],
    lead: '命令行是 Kali 的灵魂。这一课你将学会在文件系统中"行走"——查看你在哪、列出有什么、进入某个目录。这是之后一切的基础。',
    blocks: [
        '<div class="block"><h2>什么是终端?</h2><p>终端(Terminal)是一个让你用<strong>文字命令</strong>与系统交互的窗口。在 Kali 中,几乎所有安全工具都是命令行工具,所以熟练使用终端是必备技能。</p><p>打开终端后,你会看到一行<strong>提示符(prompt)</strong>,它告诉你"可以输入命令了"。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">提示符结构</span></div><pre><span class="cmt"># ┌──(用户名@主机名)-[当前目录]</span>\n<span class="cmt"># └─$ 命令在这里输入</span>\n┌──(<span class="cmd">kali@kali</span>)-[<span class="str">~</span>]\n└─<span class="cmd">$</span> </pre></div>',
        '<div class="block"><h2>三把钥匙命令</h2><h3>pwd — 我在哪?</h3><p><code>pwd</code>(print working directory)打印当前所在目录的绝对路径。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">pwd 示例</span></div><pre>└─<span class="cmd">$</span> pwd\n<span class="out">/home/kali</span></pre></div>',
        '<div class="block"><h3>ls — 这里有什么?</h3><p><code>ls</code>(list)列出当前目录下的内容。常用选项:</p><ul><li><code>ls -l</code> — 详细信息(权限、大小、时间)</li><li><code>ls -a</code> — 显示隐藏文件(以 . 开头)</li><li><code>ls -la</code> — 两者组合,最常用</li></ul></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">ls 示例</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">ls</span> <span class="flag">-la</span>\n<span class="out">drwxr-xr-x  kali kali 4096  Desktop/</span>\n<span class="out">drwxr-xr-x  kali kali 4096  Documents/</span>\n<span class="out">-rw-r--r--  kali kali   42  notes.txt</span></pre></div>',
        '<div class="block"><h3>cd — 我要去哪?</h3><p><code>cd</code>(change directory)切换目录。</p><ul><li><code>cd Documents</code> — 进入 Documents 子目录</li><li><code>cd ..</code> — 返回上一级</li><li><code>cd ~</code> 或 <code>cd</code> — 回到主目录(/home/kali)</li><li><code>cd /etc</code> — 进入绝对路径</li></ul></div>',
        '<div class="callout tip"><span class="callout-ic">💡</span><div class="callout-body"><strong>小技巧:Tab 自动补全</strong>输入 <code>cd Doc</code> 然后按 <kbd>Tab</kbd> 键,系统会自动补全为 <code>cd Documents/</code>。本平台的终端也支持 Tab 补全,试试看!</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课任务</strong>在下方终端中,先输入 <code>pwd</code> 看当前位置,然后输入 <code>ls</code> 列出文件。完成后即可进入下一课。</div></div>'
    ],
    terminal: {
        task: '输入 <code>ls</code> 列出当前目录内容',
        hint: '直接输入 ls 回车',
        goal: { cmd: 'ls' }
    }
},
{
    id: 'file-ops',
    title: '文件操作:查看、创建、删除',
    diff: 'mid', time: '20 分钟', tags: ['cat', 'touch', 'mkdir', 'rm'],
    lead: '学会了行走,现在要学会"动手"——查看文件内容、创建文件和目录、删除不要的东西。这些是日常操作中最常用的命令。',
    blocks: [
        '<div class="block"><h2>cat — 查看文件内容</h2><p><code>cat</code>(concatenate)最常用的功能是直接打印文件内容到屏幕。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">cat 示例</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">cat</span> <span class="str">Documents/notes.txt</span>\n<span class="out">Kali 学习笔记</span>\n<span class="out">1. 永远在授权环境下练习</span>\n<span class="out">2. 记录每一步操作</span></pre></div>',
        '<div class="block"><h2>touch — 创建空文件</h2><p><code>touch 文件名</code> 会创建一个空文件(如果文件已存在则更新时间戳)。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">touch 示例</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">touch</span> <span class="str">test.txt</span>\n└─<span class="cmd">$</span> <span class="cmd">ls</span>\n<span class="out">test.txt  Documents/  Desktop/</span></pre></div>',
        '<div class="block"><h2>mkdir — 创建目录</h2><p><code>mkdir 目录名</code> 创建新文件夹。</p></div>',
        '<div class="block"><h2>echo — 输出文字</h2><p><code>echo</code> 打印文字,常配合重定向 <code>&gt;</code> 写入文件:</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">echo 写入文件</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">echo</span> <span class="str">"hello kali"</span> > test.txt\n└─<span class="cmd">$</span> <span class="cmd">cat</span> <span class="str">test.txt</span>\n<span class="out">hello kali</span></pre></div>',
        '<div class="block"><h2>rm — 删除(危险!)</h2><p><code>rm</code>(remove)删除文件。<strong>删除后无法恢复</strong>,务必小心。</p><ul><li><code>rm 文件</code> — 删除文件</li><li><code>rm -r 目录</code> — 递归删除目录及内容</li><li><code>rm -f</code> — 强制删除不询问</li></ul></div>',
        '<div class="callout danger"><span class="callout-ic">⚠️</span><div class="callout-body"><strong>切勿尝试</strong>绝对不要执行 <code>rm -rf /</code> 或对系统目录使用 rm,这会删除整个系统!在虚拟机里也要养成良好的敬畏习惯。</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课任务</strong>用 <code>cat</code> 查看 <code>Documents/notes.txt</code> 的内容。提示:可以先 <code>cd Documents</code> 再 <code>cat notes.txt</code>,或直接 <code>cat Documents/notes.txt</code>。</div></div>'
    ],
    terminal: {
        task: '用 <code>cat</code> 查看 <code>Documents/notes.txt</code> 的内容',
        hint: 'cat Documents/notes.txt',
        goal: { re: /^cat\s+Documents\/notes\.txt(\s|$)/ }
    }
},
{
    id: 'permissions',
    title: '用户与权限基础',
    diff: 'mid', time: '18 分钟', tags: ['whoami', 'sudo', '权限'],
    lead: 'Linux 是多用户系统,每个文件都有"谁能读、谁能写、谁能执行"的权限规则。理解权限是理解安全的第一步。',
    blocks: [
        '<div class="block"><h2>whoami — 我是谁?</h2><p><code>whoami</code> 显示当前登录的用户名。在 Kali 中默认是 <code>kali</code>。</p></div>',
        '<div class="block"><h2>普通用户 vs root</h2><p>Linux 有一个超级用户 <strong>root</strong>,拥有系统最高权限,能做任何事。日常操作应使用普通用户,需要特权时用 <code>sudo</code> 临时提升。</p></div>',
        '<div class="callout warn"><span class="callout-ic">📌</span><div class="callout-body"><strong>sudo 的含义</strong><code>sudo</code> = "substitute user do",即"以其他用户(默认 root)身份执行"。它像是一个"确认你是管理员后才放行"的机制。</div></div>',
        '<div class="block"><h2>权限三要素</h2><p>每个文件对三类用户分别设定权限:</p><ul><li><strong>r</strong>(read)读 — 查看文件/列目录</li><li><strong>w</strong>(write)写 — 修改文件/增删目录内容</li><li><strong>x</strong>(execute)执行 — 运行文件/进入目录</li></ul><p>三类用户:<strong>u</strong>(所有者)<strong>g</strong>(所属组)<strong>o</strong>(其他人)</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">权限字符串解读</span></div><pre><span class="cmt"># drwxr-xr-x 的含义</span>\n<span class="cmd">d</span> rwx <span class="out">r-x</span> <span class="str">r-x</span>\n<span class="cmt">│  │   │    │</span>\n<span class="cmt">│  │   │    └─ 其他人:可读可执行,不可写</span>\n<span class="cmt">│  │   └────── 组:可读可执行,不可写</span>\n<span class="cmt">│  └────────── 所有者:可读可写可执行</span>\n<span class="cmt">└───────────── d=目录, -=普通文件</span></pre></div>',
        '<div class="block"><h2>chmod — 修改权限</h2><p>用数字表示权限最常见:读=4,写=2,执行=1,相加得到一组数字。</p><ul><li><code>chmod 755 文件</code> — rwxr-xr-x(所有者全权,其他人只读执行)</li><li><code>chmod 644 文件</code> — rw-r--r--(常见文件权限)</li><li><code>chmod +x 文件</code> — 给所有人加执行权限</li></ul></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">权限数字计算</span></div><pre><span class="cmt"># 755 = 7 + 5 + 5</span>\n<span class="cmd">7</span> = 4(r) + 2(w) + 1(x) = <span class="str">rwx</span>  所有者\n<span class="cmd">5</span> = 4(r) + 1(x)       = <span class="str">r-x</span>  组\n<span class="cmd">5</span> = 4(r) + 1(x)       = <span class="str">r-x</span>  其他人</pre></div>',
        '<div class="callout info"><span class="callout-ic">💡</span><div class="callout-body"><strong>安全视角</strong>权限是 Linux 安全的基石。一个权限配置错误的文件(比如密码文件设成 777)就是漏洞。安全审计很多时候就是在检查"谁的权限给多了"。</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课任务</strong>输入 <code>whoami</code> 确认你的身份。然后用 <code>ls -l</code> 观察一下文件的权限字符串长什么样。</div></div>'
    ],
    terminal: {
        task: '输入 <code>ls -l</code> 查看文件权限详情',
        hint: 'ls -l',
        goal: { cmd: 'ls -l' }
    }
},
{
    id: 'network',
    title: '网络基础:ifconfig 与 ping',
    diff: 'mid', time: '18 分钟', tags: ['网络', 'ifconfig', 'ping'],
    lead: '做安全测试,首先要"联网"。这一课认识两个最基础的网络命令:查看自己的网络配置,以及测试能不能连通目标。',
    blocks: [
        '<div class="block"><h2>ifconfig — 查看网络接口</h2><p><code>ifconfig</code>(interface config)显示本机所有网络接口的配置信息,包括 IP 地址、MAC 地址、子网掩码等。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">ifconfig 输出解读</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">ifconfig</span>\n<span class="str">eth0</span>: flags=4163&lt;UP,BROADCAST,RUNNING&gt;  mtu 1500\n        <span class="cmd">inet 10.0.0.42</span>  netmask 255.255.255.0\n        ether 08:00:27:a4:c9:1e\n<span class="str">lo</span>: flags=73&lt;UP,LOOPBACK&gt;\n        <span class="cmd">inet 127.0.0.1</span>  <span class="cmt"># 本地回环</span></pre></div>',
        '<div class="block"><h3>关键字段</h3><ul><li><strong>eth0</strong> — 以太网卡(有线网络)</li><li><strong>lo</strong> — 本地回环接口,IP 永远是 127.0.0.1,指"自己"</li><li><strong>inet</strong> — 本机的 IPv4 地址(这是"你在网络中的门牌号")</li><li><strong>ether</strong> — MAC 地址(网卡的物理唯一标识)</li></ul></div>',
        '<div class="callout info"><span class="callout-ic">💡</span><div class="callout-body"><strong>新命令:ip</strong>新版本 Linux 推荐用 <code>ip a</code>(ip addr 的缩写)代替 ifconfig,功能更强。两者都会用最稳妥。</div></div>',
        '<div class="block"><h2>ping — 测试连通性</h2><p><code>ping</code> 向目标发送小数据包,看对方是否回应、多久回应。这是判断"能不能连上"的最简单方法。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">ping 示例</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">ping</span> <span class="str">10.0.0.1</span>\n<span class="out">PING 10.0.0.1 56 字节的数据。</span>\n<span class="ok">64 字节,来自 10.0.0.1: icmp_seq=1 ttl=64 时间=0.8 ms</span>\n<span class="ok">64 字节,来自 10.0.0.1: icmp_seq=2 ttl=64 时间=0.6 ms</span>\n<span class="cmt"># 收到回应 = 目标在线且可达</span></pre></div>',
        '<div class="block"><h3>怎么读 ping 结果?</h3><ul><li><strong>有回应</strong> — 目标在线,网络可达</li><li><strong>超时无回应</strong> — 目标离线,或被防火墙拦截</li><li><strong>时间(time)</strong> — 延迟,越小越快</li><li><strong>ttl</strong> — 生存时间,大致反映经过的路由跳数</li></ul></div>',
        '<div class="callout warn"><span class="callout-ic">⚠️</span><div class="callout-body"><strong>合法使用</strong>ping 看似无害,但持续 ping 他人服务器(ping 洪水)也是一种攻击。只在授权目标上使用。</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课任务</strong>在终端中输入 <code>ifconfig</code> 查看本机网络接口(这是模拟环境,地址是示例值)。</div></div>'
    ],
    terminal: {
        task: '输入 <code>ifconfig</code> 查看网络接口',
        hint: 'ifconfig',
        goal: { cmd: 'ifconfig' }
    }
},
{
    id: 'nmap',
    title: '信息收集:nmap 扫描入门',
    diff: 'hard', time: '22 分钟', tags: ['nmap', '扫描', '核心工具'],
    lead: 'nmap 是安全领域最著名的工具之一。它像"雷达",能发现目标开了哪些门(端口)、运行什么服务。这是渗透测试的第一步:先了解目标。',
    blocks: [
        '<div class="block"><h2>nmap 是什么?</h2><p><strong>nmap</strong>(Network Mapper)是一个网络扫描与审计工具。它能:</p><ul><li>发现网络中存活的主机</li><li>探测目标开放了哪些端口</li><li>识别端口背后运行的服务和版本</li><li>猜测目标的操作系统</li></ul></div>',
        '<div class="callout info"><span class="callout-ic">💡</span><div class="callout-body"><strong>端口是什么?</strong>可以把 IP 想成"大楼地址",端口就是"房间号"。一台电脑有 65535 个端口,每个端口可能运行一个服务(如 22 号端口=SSH,80 号端口=网站)。扫描端口就是挨个敲门看哪个房间"有人"。</div></div>',
        '<div class="block"><h2>最基础的扫描</h2></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">基础端口扫描</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">nmap</span> <span class="str">10.0.0.5</span>\n<span class="out">Nmap scan report for 10.0.0.5</span>\n<span class="ok">Host is up (0.0008s latency).</span>\n<span class="str">PORT     STATE SERVICE</span>\n<span class="cmd">22/tcp   open  ssh</span>\n<span class="cmd">80/tcp   open  http</span>\n<span class="cmd">443/tcp  open  https</span></pre></div>',
        '<div class="block"><h3>怎么读结果?</h3><ul><li><strong>PORT</strong> — 端口号和协议(tcp)</li><li><strong>STATE</strong> — 状态:<code>open</code>(开放,有人在听)<code>closed</code>(关闭)<code>filtered</code>(被防火墙挡住,看不到)</li><li><strong>SERVICE</strong> — 这个端口通常对应的服务名</li></ul></div>',
        '<div class="block"><h2>常用选项</h2><h3>-sV:识别服务版本</h3><p>不仅知道端口开着,还知道运行的是什么软件、什么版本。版本信息对找漏洞至关重要。</p></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">版本探测</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">nmap</span> <span class="flag">-sV</span> <span class="str">10.0.0.5</span>\n<span class="str">PORT     STATE SERVICE  VERSION</span>\n<span class="cmd">22/tcp   open  ssh      OpenSSH 9.2p1</span>\n<span class="cmd">80/tcp   open  http     Apache httpd 2.4.57</span></pre></div>',
        '<div class="block"><h3>-sS:隐蔽 SYN 扫描</h3><p>又称"半开扫描",更隐蔽,不易被日志记录。需要 root 权限(sudo)。</p></div>',
        '<div class="callout warn"><span class="callout-ic">⚠️</span><div class="callout-body"><strong>重要提醒</strong>nmap 扫描会对目标产生流量,在未经授权的系统上扫描<strong>是违法的</strong>。即使是"只是看看"也不行。请只在:自己的机器、CTF 靶场、明确授权的目标上使用。</div></div>',
        '<div class="block"><h2>信息收集的意义</h2><p>渗透测试有一条铁律:<strong>"信息收集决定成败"</strong>。开放端口和服务版本就是后续一切工作的入口——找到旧版本的服务,就能查它有没有已知漏洞,这就是测试的起点。</p></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>本课任务</strong>在终端中对模拟目标 <code>10.0.0.5</code> 执行一次 nmap 扫描。直接输入 <code>nmap 10.0.0.5</code> 即可。</div></div>'
    ],
    terminal: {
        task: '用 <code>nmap</code> 扫描目标 <code>10.0.0.5</code>',
        hint: 'nmap 10.0.0.5',
        goal: { re: /^nmap\s+.*10\.0\.0\.5(\s|$)/ }
    }
},
{
    id: 'final',
    title: '综合实战:小小侦察任务',
    diff: 'hard', time: '25 分钟', tags: ['综合', '实战', '复习'],
    lead: '恭喜来到最后一课!现在把前面学到的命令串起来,完成一次完整的"侦察流程"——从了解自己,到探测目标。这是真实安全测试的缩影。',
    blocks: [
        '<div class="block"><h2>实战场景</h2><p>假设你获得授权,要对内网一台测试机 <code>10.0.0.5</code> 进行安全评估。一次基础的侦察流程通常包括:</p><ol><li><strong>确认自身环境</strong> — 我是谁?我的网络配置?</li><li><strong>测试目标连通性</strong> — 目标在线吗?</li><li><strong>扫描开放端口</strong> — 目标开了哪些服务?</li><li><strong>识别服务版本</strong> — 具体软件版本是什么?</li><li><strong>记录发现</strong> — 把结果整理成报告</li></ol></div>',
        '<div class="callout info"><span class="callout-ic">💡</span><div class="callout-body"><strong>这就是渗透测试的雏形</strong>真实的渗透测试在侦察之后还会有漏洞利用、后渗透、报告撰写等阶段,但"侦察"始终是第一步,也是最耗时、最关键的一步。</div></div>',
        '<div class="block"><h2>本课任务流程</h2><p>在下方终端中,按顺序完成这些命令(每条都会帮你复习):</p><ul><li><code>whoami</code> — 确认身份</li><li><code>ifconfig</code> — 查看本机网络</li><li><code>ping 10.0.0.5</code> — 测试目标连通</li><li><code>nmap -sV 10.0.0.5</code> — 扫描并识别服务版本</li></ul></div>',
        '<div class="codedemo"><div class="codedemo-head"><div class="codedemo-dots"><i></i><i></i><i></i></div><span class="codedemo-title">完整流程示例</span></div><pre>└─<span class="cmd">$</span> <span class="cmd">whoami</span>\n<span class="out">kali</span>\n└─<span class="cmd">$</span> <span class="cmd">ifconfig</span>\n<span class="out">eth0: inet 10.0.0.42 ...</span>\n└─<span class="cmd">$</span> <span class="cmd">ping</span> <span class="str">10.0.0.5</span>\n<span class="ok">64 字节,来自 10.0.0.5: 时间=0.8 ms</span>\n└─<span class="cmd">$</span> <span class="cmd">nmap</span> <span class="flag">-sV</span> <span class="str">10.0.0.5</span>\n<span class="str">PORT   STATE SERVICE  VERSION</span>\n<span class="cmd">22/tcp open  ssh      OpenSSH 9.2p1</span>\n<span class="cmd">80/tcp open  http     Apache 2.4.57</span></pre></div>',
        '<div class="block"><h2>发现意味着什么?</h2><p>扫描结果显示目标运行 <strong>OpenSSH 9.2p1</strong> 和 <strong>Apache 2.4.57</strong>。下一步(超出本课程范围)你会:</p><ul><li>查这些版本是否有<strong>已知漏洞</strong>(CVE)</li><li>检查 SSH 是否允许弱密码登录</li><li>检查网站是否有常见 Web 漏洞</li></ul><p>每一条开放的服务,都是一个需要评估的"入口"。</p></div>',
        '<div class="callout tip"><span class="callout-ic">🎓</span><div class="callout-body"><strong>恭喜!</strong>完成本课任务后,你已经走完了一遍真实安全侦察的完整流程。这只是起点——真实世界的工具和场景远比这复杂,但你已经建立了正确的认知框架。</div></div>',
        '<div class="callout danger"><span class="callout-ic">⚠️</span><div class="callout-body"><strong>最后的话</strong>能力越大,责任越大。你学到的每一条命令都可能在真实系统中造成影响。请始终:<strong>只测授权目标</strong>、<strong>遵守当地法律</strong>、<strong>用技术保护而非破坏</strong>。</div></div>',
        '<div class="callout tip"><span class="callout-ic">✅</span><div class="callout-body"><strong>最终任务</strong>执行 <code>nmap -sV 10.0.0.5</code> 完成版本探测扫描,结束你的训练之旅!</div></div>'
    ],
    terminal: {
        task: '执行 <code>nmap -sV 10.0.0.5</code> 完成版本探测',
        hint: 'nmap -sV 10.0.0.5',
        goal: { re: /^nmap\s+(-\S+\s+)*10\.0\.0\.5(\s|$)/ }
    }
}
];

/* ============================================================
   资源
   ============================================================ */
const RESOURCES = [
    { ic: '🌐', title: 'Kali Linux 官网', desc: '官方下载、文档与工具列表,所有学习的起点。', link: 'https://www.kali.org/' },
    { ic: '📚', title: 'Kali 文档', desc: '官方使用文档,涵盖安装、配置、工具用法。', link: 'https://www.kali.org/docs/' },
    { ic: '🎓', title: 'OffSec Learn', desc: 'Kali 母公司 Offensive Security 的官方培训与认证(OSCP 等)。', link: 'https://www.offsec.com/' },
    { ic: '🎯', title: 'VulnHub', desc: '大量可下载的练习靶机镜像,合法练习渗透测试。', link: 'https://www.vulnhub.com/' },
    { ic: '🛡️', title: 'HackTheBox', desc: '在线靶场平台,从易到难的实战机器与挑战。', link: 'https://www.hackthebox.com/' },
    { ic: '📖', title: 'nmap 官方文档', desc: '本课重点工具 nmap 的完整用法与选项参考。', link: 'https://nmap.org/book/man.html' }
];

/* ============================================================
   渲染
   ============================================================ */
let currentId = null;
let currentTerm = null;

function renderSidebar() {
    const list = $('#lessonList');
    list.innerHTML = LESSONS.map((l, i) => {
        const done = Store.isDone(l.id);
        const diffMap = { easy: '简单', mid: '中等', hard: '进阶' };
        return `<li class="lesson-item ${done ? 'done' : ''}" data-id="${l.id}">
            <span class="lesson-num">${done ? '✓' : i + 1}</span>
            <div class="lesson-info">
                <div class="lesson-title">${l.title}</div>
                <div class="lesson-meta"><span class="lesson-diff diff-${l.diff}">${diffMap[l.diff]}</span> · ${l.time}</div>
            </div>
        </li>`;
    }).join('');
    list.addEventListener('click', e => {
        const item = e.target.closest('.lesson-item');
        if (item) { renderLesson(item.dataset.id); closeMobileSidebar(); }
    });
}

function updateSidebarActive() {
    $$('.lesson-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === currentId);
        const done = Store.isDone(el.dataset.id);
        el.classList.toggle('done', done);
        const num = el.querySelector('.lesson-num');
        const idx = LESSONS.findIndex(l => l.id === el.dataset.id);
        num.textContent = done ? '✓' : (idx + 1);
    });
}

function renderHome() {
    currentId = null;
    updateSidebarActive();
    const content = $('#content');
    content.innerHTML = `
        <div class="home-hero">
            <span class="badge">🛡️ 新手友好 · 浏览器内即可练习</span>
            <h1>从零开始<br>掌握 Kali Linux</h1>
            <p>互动式学习平台,带你从"什么是 Kali"到完成第一次安全侦察。每课配有<strong>模拟终端</strong>,边学边练,无需安装任何东西。</p>
            <div class="home-cta">
                <button class="btn-primary" id="startBtn">开始第一课 →</button>
                <button class="btn-secondary" id="resumeBtn">继续学习</button>
            </div>
            <div class="home-stats">
                <div class="stat"><div class="stat-num">${LESSONS.length}</div><div class="stat-label">课程</div></div>
                <div class="stat"><div class="stat-num">7</div><div class="stat-label">互动终端</div></div>
                <div class="stat"><div class="stat-num">100%</div><div class="stat-label">免费</div></div>
                <div class="stat"><div class="stat-num">0</div><div class="stat-label">需安装</div></div>
            </div>
        </div>
        <div class="block">
            <h2>学习路径概览</h2>
            <p>课程按难度递进设计,建议按顺序学习。每完成一课的终端任务,进度自动保存。</p>
        </div>
        ${LESSONS.map((l, i) => {
            const done = Store.isDone(l.id);
            const diffMap = { easy: '简单', mid: '中等', hard: '进阶' };
            return `<div class="lesson-item" style="margin-bottom:10px" data-go="${l.id}">
                <span class="lesson-num">${done ? '✓' : i + 1}</span>
                <div class="lesson-info">
                    <div class="lesson-title">${l.title}</div>
                    <div class="lesson-meta"><span class="lesson-diff diff-${l.diff}">${diffMap[l.diff]}</span> · ${l.time} · ${l.tags.join(' / ')}</div>
                </div>
            </div>`;
        }).join('')}
    `;
    $('#startBtn').addEventListener('click', () => renderLesson(LESSONS[0].id));
    $('#resumeBtn').addEventListener('click', () => {
        const next = LESSONS.find(l => !Store.isDone(l.id)) || LESSONS[0];
        renderLesson(next.id);
    });
    $$('#content [data-go]').forEach(el => el.addEventListener('click', () => renderLesson(el.dataset.go)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLesson(id) {
    const idx = LESSONS.findIndex(l => l.id === id);
    if (idx < 0) return;
    const l = LESSONS[idx];
    currentId = id;
    updateSidebarActive();
    const diffMap = { easy: '简单', mid: '中等', hard: '进阶' };
    const content = $('#content');
    content.innerHTML = `
        <div class="lesson-hero">
            <div class="lesson-crumb">课程 <span>/ ${String(idx + 1).padStart(2, '0')}</span> · ${diffMap[l.diff]}</div>
            <h1 class="lesson-h1">${l.title}</h1>
            <p class="lesson-lead">${l.lead}</p>
            <div class="lesson-tags">${l.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>
        ${l.blocks.join('')}
        ${l.terminal ? renderTerminalCard(l) : ''}
        <div class="lesson-nav">
            <button class="lesson-nav-btn prev" ${idx === 0 ? 'disabled' : ''}>
                <span class="nav-label">← 上一课</span>
                <span class="nav-title">${idx > 0 ? LESSONS[idx - 1].title : '已是第一课'}</span>
            </button>
            <button class="lesson-nav-btn next" ${idx === LESSONS.length - 1 ? 'disabled' : ''}>
                <span class="nav-label">下一课 →</span>
                <span class="nav-title">${idx < LESSONS.length - 1 ? LESSONS[idx + 1].title : '已完成全部课程'}</span>
            </button>
        </div>
    `;
    if (l.terminal) initTerminal(l);
    const prevBtn = $('.lesson-nav-btn.prev');
    const nextBtn = $('.lesson-nav-btn.next');
    if (prevBtn && !prevBtn.disabled) prevBtn.addEventListener('click', () => renderLesson(LESSONS[idx - 1].id));
    if (nextBtn && !nextBtn.disabled) nextBtn.addEventListener('click', () => renderLesson(LESSONS[idx + 1].id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderTerminalCard(l) {
    const done = Store.isDone(l.id);
    return `
        <div class="terminal-card" id="termCard">
            <div class="terminal-head">
                <div class="terminal-head-left">
                    <div class="codedemo-dots"><i></i><i></i><i></i></div>
                    <span class="terminal-title">kali@kali: ~ — 互动终端</span>
                </div>
                <span class="terminal-prompt-label">点击终端即可输入 · Tab 补全 · ↑↓ 历史</span>
            </div>
            <div class="terminal-body"></div>
            <div class="terminal-hint"><span class="hint-label">提示:</span> ${l.terminal.hint.replace(/<code>/g, '<code>').replace(/<\/code>/g, '</code>')} · 输入 <code>help</code> 查看命令</div>
            <div class="terminal-task ${done ? 'done' : ''}">
                <span class="task-check ${done ? 'done' : ''}"></span>
                <strong>任务:</strong> ${l.terminal.task}
            </div>
        </div>
    `;
}

function initTerminal(l) {
    const card = $('#termCard');
    if (!card) return;
    const alreadyDone = Store.isDone(l.id);
    const term = new Terminal(card, {
        fs: makeFS(),
        cwd: '/home/kali',
        task: l.terminal.task,
        hint: l.terminal.hint,
        goal: l.terminal.goal,
        onDone: () => {
            if (!Store.isDone(l.id)) {
                Store.markDone(l.id);
                toast('课程完成!进度已保存', 'success');
                updateProgress();
                updateSidebarActive();
            }
        }
    });
    if (alreadyDone) { term.done = true; }
    currentTerm = term;
    setTimeout(() => term.focus(), 300);
}

function updateProgress() {
    const done = LESSONS.filter(l => Store.isDone(l.id)).length;
    const pct = Math.round(done / LESSONS.length * 100);
    $('#globalProgressFill').style.width = pct + '%';
    $('#globalProgressText').textContent = pct + '%';
}

function renderResources() {
    $('#resourceGrid').innerHTML = RESOURCES.map(r => `
        <div class="resource-card">
            <h3><span class="r-ic">${r.ic}</span> ${r.title}</h3>
            <p>${r.desc}</p>
            <a href="${r.link}" target="_blank" rel="noopener">访问 →</a>
        </div>
    `).join('');
}

function closeMobileSidebar() {
    $('#sidebar').classList.remove('open');
}

/* ---------- 初始化 ---------- */
function init() {
    renderSidebar();
    renderResources();
    updateProgress();
    renderHome();

    $('#resetProgress').addEventListener('click', () => {
        if (confirm('确定要重置所有学习进度吗?此操作不可撤销。')) {
            Store.reset();
            updateProgress();
            renderSidebar();
            if (currentId) renderLesson(currentId); else renderHome();
            toast('进度已重置', 'info');
        }
    });

    $('#sidebarToggle').addEventListener('click', () => {
        $('#sidebar').classList.toggle('open');
    });

    $$('.topnav a, [data-nav]').forEach(el => {
        el.addEventListener('click', e => {
            const nav = el.dataset.nav;
            if (nav === 'home') { e.preventDefault(); renderHome(); }
            else if (nav === 'curriculum') { e.preventDefault(); renderHome(); }
            else if (nav === 'terminal') {
                e.preventDefault();
                const first = LESSONS.find(l => l.terminal) || LESSONS[0];
                renderLesson(first.id);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
