/**
 * 摸鱼塘 · Client half.
 *
 * Registers two seats: an icon in the left sidebar panel list ("摸鱼塘") and the
 * pond panel it opens. The pond reads token totals from the Host half through a
 * same-origin route; every rule below runs locally, keeps no conversation text and
 * makes no outbound request.
 *
 * 数据来源：GET /moyutang-api/state → { metrics: { totalEffectiveTokens, ... } }
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-moyutang',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useState,
      useEffect,
      useRef,
      useMemo,
      useCallback,
      useSyncExternalStore,
    } = React

    /* ------------------------------------------------------------------ *
     * 1. 静态内容：鱼塘、鱼种、商品、委托
     * ------------------------------------------------------------------ */

    const BALANCE = {
      tokensPerPoint: 1000,
      softCap: [
        [0, 300, 1],
        [300, 600, 0.5],
        [600, Infinity, 0.1],
      ],
      streakPerDay: 0.05,
      streakMax: 0.3,
      completionBonus: 1,
      shinyChance: 1 / 200,
      fatChance: 0.08,
      pity: 10,
      autoSuccess: 0.6,
      autoIntervalMs: 12000,
      biteWindowMs: 900,
      biteWaitMs: [3000, 9000],
      reel: {
        start: 42,
        hold: 54,
        release: 40,
        burst: [14, 26],
        burstEveryMs: [1100, 2100],
        burstDecayMs: 520,
        progressGain: 33,
        progressLoss: 12,
        breakAt: 100,
      },
    }

    const RARITY = {
      N: { name: '普通', label: 'N', weight: 0.6, price: [5, 15], color: '#a8b6c4', glow: 'rgba(168,182,196,0.25)' },
      R: { name: '优良', label: 'R', weight: 0.25, price: [20, 50], color: '#5aa9e6', glow: 'rgba(90,169,230,0.30)' },
      SR: { name: '稀有', label: 'SR', weight: 0.11, price: [80, 200], color: '#a882e8', glow: 'rgba(168,130,232,0.35)' },
      SSR: { name: '史诗', label: 'SSR', weight: 0.035, price: [300, 800], color: '#e8b44a', glow: 'rgba(232,180,74,0.40)' },
      UR: { name: '传说', label: 'UR', weight: 0.005, price: null, color: '#ef6f6c', glow: 'rgba(239,111,108,0.45)' },
    }
    const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 }

    const PONDS = [
      {
        id: 'newbie-creek',
        name: '新手摸鱼溪',
        tagline: '工位旁的小溪，适合第一天上班摸鱼',
        cost: 5,
        unlock: { coins: 0, species: 0 },
        anchor: { from: [48, 17], float: [47.7, 45] },
        palette: { sky: ['#f6e7c8', '#cfe8d5'], water: ['#7cc4c8', '#2f7d8c'], bank: '#c8a878' },
      },
      {
        id: 'caffeine-lake',
        name: '咖啡因湖',
        tagline: '拿铁色的湖水，喝完再钓',
        cost: 8,
        unlock: { coins: 800, species: 8 },
        anchor: { from: [52.4, 46], float: [52.6, 65.5] },
        palette: { sky: ['#f3dcc4', '#e3c3a3'], water: ['#b98a5f', '#5d3d2e'], bank: '#8a6547' },
      },
      {
        id: 'bug-swamp',
        name: 'Bug 沼泽',
        tagline: '报错越多，鱼越多',
        cost: 12,
        unlock: { coins: 3000, species: 18 },
        anchor: { from: [6, 104], float: [52, 62] },
        palette: { sky: ['#cfd9b8', '#98a878'], water: ['#6f7f4e', '#2f3b26'], bank: '#5b6b3c' },
      },
      {
        id: 'overtime-sea',
        name: '加班夜海',
        tagline: '十九点以后才开张的夜海',
        cost: 18,
        unlock: { coins: 8000, species: 30 },
        anchor: { from: [6, 104], float: [56, 66] },
        palette: { sky: ['#1c2a49', '#243b63'], water: ['#315a80', '#0e1d33'], bank: '#20304a' },
      },
      {
        id: 'context-abyss',
        name: '上下文深渊',
        tagline: '越深越古老，也越值钱',
        cost: 25,
        unlock: { coins: 20000, species: 42 },
        anchor: { from: [6, 104], float: [55, 58] },
        palette: { sky: ['#20233f', '#14162b'], water: ['#3b3f78', '#0b0c19'], bank: '#2a2c47' },
      },
      {
        id: 'whale-fall',
        name: '深度求索鲸落',
        tagline: '终局鱼塘，传说鲸在此长眠',
        cost: 40,
        unlock: { coins: 50000, species: 55, bosses: 5 },
        anchor: { from: [6, 104], float: [52, 62] },
        palette: { sky: ['#0e1a2c', '#091220'], water: ['#1c3f5c', '#061019'], bank: '#122536' },
      },
    ]

    const POND_BY_ID = Object.fromEntries(PONDS.map((p) => [p.id, p]))

    // [id, 名称, 鱼塘, 稀有度, 最小cm, 最大cm, 图鉴简介, 谜语提示, 条件]
    const FISH_RAW = [
      ['moyu', '摸鱼', 'newbie-creek', 'N', 12, 38, '本塘之魂。它不在工作，你也不在。', '它一直待在水里，却从没被水流带走。'],
      ['huashui', '划水鱼', 'newbie-creek', 'N', 8, 25, '游得很努力，但一直在原地。', '尾巴摆得最勤的那条，通常哪儿也没去。'],
      ['zhoubao', '周报鲤鱼', 'newbie-creek', 'N', 15, 40, '口头承诺三件事，落在纸上一句话。', '它只在周五下午浮上来，汇报一下本周水位。'],
      ['daiyu', '带鱼', 'newbie-creek', 'R', 40, 90, '被叫作“带鱼”，因为它总在带薪。', '名字里带“带”，但不带加班费。'],
      ['xuqiu', '需求变更泥鳅', 'newbie-creek', 'R', 10, 30, '上一秒的需求，这一刻已经过时。', '你刚看清它，它已经换了形状。'],
      ['tuanjian', '团建鲫', 'newbie-creek', 'R', 15, 35, '集体活动时最活跃，工作群里最安静。', '它总在群里 @所有人，却从不出现在工位上。'],
      ['moyuwang', '摸鱼王', 'newbie-creek', 'SR', 50, 120, '钓上它的人，今天可以理直气壮地休息。', '王冠很轻，因为它从不加班。'],
      ['gongwei', '工位锦鲤', 'newbie-creek', 'SR', 25, 60, '据说转发它，能换来一次不被打断的专注。', '转发没用，钓到才有用。'],
      ['zhouwu', '周五下午的金鱼', 'newbie-creek', 'SSR', 30, 70, '它只在大家心思已经飞走时浮出水面。', '它和你的下班心情同频。'],
      ['xizhu', '摸鱼溪主', 'newbie-creek', 'UR', 120, 260, '整条溪的摸鱼气息都归它调度。', '水面忽然很安静，那是它在下面伸懒腰。', { boss: true }],

      ['meishi', '美式小鱼', 'caffeine-lake', 'N', 8, 20, '苦，但提神。和你早上那杯一样。', '喝下去会皱眉，游起来很精神。'],
      ['lengcui', '冷萃鲦', 'caffeine-lake', 'N', 10, 26, '泡了一整夜，比你先进入状态。', '它比你更早开始今天。'],
      ['kafeizha', '咖啡渣鳅', 'caffeine-lake', 'N', 6, 18, '沉在湖底，负责给整片湖调味。', '它一翻身，湖水就苦了一点。'],
      ['natie', '拿铁锦鲤', 'caffeine-lake', 'R', 25, 55, '身上有奶泡花纹，钓到后今天效率 +1（心理作用）。', '只在清晨出现，带着一层奶泡。', { time: 'morning' }],
      ['kabuqinuo', '卡布奇诺鲈', 'caffeine-lake', 'R', 20, 45, '泡沫比身体厚，气势比实力足。', '看起来很大，一大半是泡沫。'],
      ['xintiao', '心跳加速鱼', 'caffeine-lake', 'R', 12, 30, '不是因为它稀有，是因为咖啡因过量。', '手抖的时候更容易钓到它。'],
      ['zhengze', '正则水母', 'caffeine-lake', 'SR', 30, 70, '触手排列看似有规律，第二天就看不懂了。', '你越盯着它看，越觉得它像一坨括号。'],
      ['nongsuo', '浓缩双份鳟', 'caffeine-lake', 'SR', 35, 80, '一口就能顶到下班。', '它出现时，湖水会明显变浓。'],
      ['guozai', '咖啡因过载鳗', 'caffeine-lake', 'SSR', 60, 150, '它游过的地方，水面会抖三分钟。', '湖水在抖，不是你的错觉。'],
      ['lahua', '拉花利维坦', 'caffeine-lake', 'UR', 200, 420, '奶油泡沫堆成的巨兽，喝掉它需要一点勇气。', '湖心有一朵永远不散的拉花。', { boss: true }],

      ['kongzhizhen', '空指针蝌蚪', 'bug-swamp', 'N', 5, 14, '它指向的地方什么也没有。', '它一直指向一片空白。'],
      ['fenhao', '分号虾', 'bug-swamp', 'N', 4, 12, '少一个不行，多一个也不行。', '全沼泽因为它静了一秒。'],
      ['suojin', '缩进错位鳅', 'bug-swamp', 'N', 8, 22, '只差一个空格，整片沼泽就乱了。', '它和同伴总差半个身位。'],
      ['buglu', 'Bug 鲈', 'bug-swamp', 'R', 20, 50, '每钓上一条，水里会再冒出两条。', '雷雨天气，它最活跃。', { weather: 'storm', bass: true }],
      ['duancuowu', '段错误泥鳅', 'bug-swamp', 'R', 12, 28, '它出现的时候，程序已经倒下了。', '它一冒头，水面就黑屏。'],
      ['yuejie', '越界鲶', 'bug-swamp', 'R', 25, 60, '它总在边界外多待一会儿。', '它从不在该在的范围内。'],
      ['youling', '404 幽灵鱼', 'bug-swamp', 'SR', 30, 80, '你确定它存在吗？鱼卡偶尔会显示“未找到”。', '图鉴说它不存在，鱼篓说它来过。'],
      ['huigui', '回归测试鲟', 'bug-swamp', 'SR', 60, 140, '每修一次 Bug，它就重新游一遍全场。', '它每隔一阵就绕回来检查一遍。'],
      ['buding', '补丁鳕', 'bug-swamp', 'SSR', 70, 160, '贴在断线处，看着能用，最好别问多久。', '身上有一块明显是后贴的鳞。'],
      ['laobug', '千年老 Bug 鳄', 'bug-swamp', 'UR', 260, 520, '沼泽最深处，它活在所有还没修的问题里。', '沼泽的泥里有一双很旧的眼睛。', { boss: true }],

      ['jiaban', '加班沙丁', 'overtime-sea', 'N', 6, 18, '成群结队地熬夜。', '它们总是密密麻麻，一条也不少。'],
      ['yexiao', '夜宵带鱼', 'overtime-sea', 'N', 30, 70, '凌晨一点的煎锅里，它是主角。', '闻到油烟味就上钩。'],
      ['huiyi', '会议鲽', 'overtime-sea', 'N', 15, 35, '整片海域都在讨论水位，没有一条在游。', '它们开会讨论怎么游，然后散会。'],
      ['pingmu', '屏幕光鲷', 'overtime-sea', 'R', 20, 45, '身上泛着显示器的蓝光。', '只有天黑以后，它才发光。', { time: 'night' }],
      ['dagong', '打工鲱', 'overtime-sea', 'R', 12, 30, '游得很快，但方向由别人决定。', '它游向哪里，要看岸上的安排。'],
      ['jianmao', '键帽鲷', 'overtime-sea', 'R', 10, 26, '每一声咔哒，它都记得。', '它在水下也发出咔哒声。'],
      ['neicun', '内存泄漏鲶', 'overtime-sea', 'SR', 40, 90, '放在鱼篓里会越长越大，记得及时卖掉。', '它每天都在变重一点。'],
      ['tongxiao', '通宵夜鳗', 'overtime-sea', 'SR', 80, 180, '它见过这座城市所有的凌晨。', '它只在深夜出没，眼圈很深。', { time: 'night' }],
      ['zhouwu2', '周五上线鲨', 'overtime-sea', 'SSR', 120, 260, '极其凶猛，只在周五下午出没。', '一周里只有一天能看到它的鳍。', { weekly: 5 }],
      ['juluo', '深夜巨鱿', 'overtime-sea', 'UR', 300, 600, '十九点以后，海面下的影子会多出一个。', '夜海下面，有一团比船还大的影子。', { boss: true }],

      ['shangxiawen', '上下文小虾', 'context-abyss', 'N', 4, 10, '记得住三句话，第四句开始迷糊。', '它总在第三句话之后消失。'],
      ['jianduan', '截断鳐', 'context-abyss', 'N', 20, 45, '说到一半就被切走了。', '它的尾巴总是突然消失。'],
      ['jixing', '健忘鲀', 'context-abyss', 'N', 8, 20, '上一秒的事，这一秒已经不属于它。', '刚看清它，它就忘了你。'],
      ['zhaiyao', '摘要鲽', 'context-abyss', 'R', 20, 45, '把一整片海缩成一句话。', '它身上只有一句重点。'],
      ['yinyong', '引用循环鲟', 'context-abyss', 'R', 50, 120, '它肚子里装着它自己，谁也放不下谁。', '钓上来一条，鱼篓里多出三条同样的。'],
      ['changwen', '长上下文鳗', 'context-abyss', 'R', 70, 160, '越长越慢，但什么也不肯忘。', '它记得你第一次抛竿的角度。'],
      ['digui', '递归海马', 'context-abyss', 'SR', 25, 60, '肚子里装着一只更小的递归海马。', '一层一层，永远还有一层。'],
      ['shenshen', '深潜鳐', 'context-abyss', 'SR', 40, 100, '越往下，它越古老。', '只有想得足够久的人才能下钩到它。', { deep: true }],
      ['yasuo', '上下文压缩鳕', 'context-abyss', 'SSR', 90, 200, '能把十万字压成一句话，但会忘掉你的名字。', '它记得所有事，除了你是谁。'],
      ['chenmo', '深渊的沉默鲸', 'context-abyss', 'UR', 320, 700, '它一句话也不说，但听懂的人不少。', '深渊里安静得不像没有东西。', { boss: true }],

      ['jingluo', '鲸落浮游鱼', 'whale-fall', 'N', 3, 9, '靠一场盛大的告别活了一整年。', '巨大的东西沉下来以后，它们才热闹起来。'],
      ['haixue', '海雪鳕', 'whale-fall', 'N', 10, 26, '从上层慢慢沉下来，像下了一场安静的雪。', '往上数三千米，才有它的来处。'],
      ['denglong', '深蓝灯笼鱼', 'whale-fall', 'N', 8, 18, '自己点灯，自己看路。', '黑水里唯一的一点光。'],
      ['lanjing', '蓝鲸影子', 'whale-fall', 'R', 60, 140, '你看见的是影子，它看见的是你的注意力。', '水面上什么也没有，水下面什么都有。'],
      ['liniguang', '磷光鲱', 'whale-fall', 'R', 8, 22, '游动时留下一道很短的银河。', '它游过的地方会亮一小会儿。'],
      ['jingmi', '静谧鲷', 'whale-fall', 'R', 20, 50, '在这片海里，安静本身就是一种稀有度。', '钓到它的时候，声音会小一点。'],
      ['sikao', '思考水母', 'whale-fall', 'SR', 40, 100, '它想得越久，触手就越亮。', '它一直在想，但不说答案。'],
      ['huisheng', '深海回声鲟', 'whale-fall', 'SR', 100, 240, '喊一声，回来的是三秒后的自己。', '你听见自己的声音晚了一点回来。'],
      ['linggan', '凌晨三点的灵感鱼', 'whale-fall', 'SSR', 30, 80, '只在你最不该醒着的时候出现。', '三点到四点之间，水面会亮一下。', { hour: [3, 4], hidden: true }],
      ['jing', '深度求索鲸', 'whale-fall', 'UR', 400, 900, '传说中的蓝鲸，见过它的人都说“它在思考”。', '整片海的安静，都是它在想事情。', { boss: true }],
    ]

    const FISH = FISH_RAW.map((row) => ({
      id: row[0],
      name: row[1],
      pond: row[2],
      rarity: row[3],
      min: row[4],
      max: row[5],
      description: row[6],
      hint: row[7],
      time: row[8]?.time,
      weather: row[8]?.weather,
      hour: row[8]?.hour,
      weekly: row[8]?.weekly,
      hidden: Boolean(row[8]?.hidden),
      boss: Boolean(row[8]?.boss),
      bass: Boolean(row[8]?.bass),
      deep: Boolean(row[8]?.deep),
    }))
    const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]))
    const BOSSES = FISH.filter((f) => f.boss)

    const RODS = [
      { id: 'bamboo', name: '竹竿', price: 0, tolerance: 1, desc: '手感一般，但足够开始摸鱼。' },
      { id: 'carbon', name: '碳素竿', price: 200, tolerance: 1.25, desc: '张力条更宽，断线更少。' },
      { id: 'keyboard', name: '机械键盘竿', price: 1500, tolerance: 1.55, desc: '段落感带来的抛竿精度，很难解释。' },
      { id: 'whalebone', name: '鲸骨竿', price: 6000, tolerance: 1.85, desc: '沉，稳，稀有鱼也愿意给个面子。' },
    ]

    const BAITS = [
      { id: 'bread', name: '面包屑', price: 0, pack: 1, desc: '最普通的饵，什么都能钓一点。' },
      { id: 'coffee', name: '咖啡豆', price: 30, pack: 5, desc: '清晨更容易咬钩，优良鱼略多。' },
      { id: 'bug', name: 'bug 虫', price: 60, pack: 5, desc: '雷雨天的 Bug 鲈几乎必上钩。' },
      { id: 'chain', name: '思维链饵', price: 300, pack: 3, desc: '钓得更深，稀有以上概率提升。' },
    ]

    const LINES = [
      { id: 'cork', art: 'bobber', name: '木塞浮漂', price: 0, bite: 0, breakAt: 0, desc: '能浮起来就行。' },
      { id: 'glow', art: 'glow', name: '夜光浮漂', price: 150, bite: 380, breakAt: 0, desc: '咬钩窗口多 0.38 秒。' },
      { id: 'steel', art: 'steel', name: '防断线轮', price: 800, bite: 0, breakAt: 8, desc: '断线阈值提高 8。' },
    ]

    const DECOR = [
      { id: 'hut', name: '小木屋', price: 300, art: 'hut', desc: '岸上多一间小屋，纯外观。' },
      { id: 'chair', name: '钓鱼椅', price: 500, art: 'chair', desc: '坐得舒服一点，鱼不会知道。' },
      { id: 'chime', name: '鲸鱼风铃', price: 1200, art: 'chime', desc: '风一吹，整片水面都在响。' },
      { id: 'cat', name: '像素猫', price: 800, art: 'cat', desc: '它会盯着水面，但从不帮忙。' },
    ]

    const QUEST_POOL = [
      { id: 'cast5', text: '抛竿 5 次', metric: 'casts', target: 5, coins: 60 },
      { id: 'catch5', text: '钓上 5 条鱼', metric: 'catches', target: 5, coins: 80 },
      { id: 'rare1', text: '钓到 1 条稀有（SR）以上', metric: 'rareCatches', target: 1, coins: 120 },
      { id: 'sell3', text: '卖出 3 条鱼', metric: 'sold', target: 3, coins: 70 },
      { id: 'storm1', text: '在雷雨里钓到 1 条鱼', metric: 'stormCatches', target: 1, coins: 150 },
      { id: 'distinct3', text: '钓到 3 个不同鱼种', metric: 'distinct', target: 3, coins: 90 },
      { id: 'shiny', text: '遇到 1 条闪光变种', metric: 'shinyCatches', target: 1, coins: 200 },
    ]

    const ACHIEVEMENTS = [
      { id: 'empty10', name: '空军大师', desc: '连续 10 竿空军', coins: 150 },
      { id: 'bugtamer', name: '报错驯鱼师', desc: '钓到 3 条 Bug 类鱼', coins: 200 },
      { id: 'nightowl', name: '凌晨三点见证者', desc: '在 03:00–04:00 钓到鱼', coins: 300 },
      { id: 'boss1', name: '第一个 Boss', desc: '钓上任意一条鱼塘 Boss', coins: 500 },
      { id: 'half', name: '图鉴过半', desc: '点亮 30 个图鉴条目', coins: 800 },
      { id: 'whale', name: '见过鲸的人', desc: '钓到深度求索鲸', coins: 1500 },
    ]

    /* ------------------------------------------------------------------ *
     * 2. 纯函数：随机、时间、稀有度、价格、市场
     * ------------------------------------------------------------------ */

    const clamp = (value, low, high) => (value < low ? low : value > high ? high : value)
    const pad2 = (value) => String(value).padStart(2, '0')

    function dayKey(date = new Date()) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    function shiftDay(key, delta) {
      const [y, m, d] = key.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      date.setDate(date.getDate() + delta)
      return dayKey(date)
    }

    function hash32(text) {
      let hash = 2166136261
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function seeded(seed) {
      let state = seed >>> 0 || 1
      return () => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        state >>>= 0
        return state / 4294967296
      }
    }

    function phaseOfHour(hour) {
      if (hour >= 5 && hour < 9) return 'morning'
      if (hour >= 9 && hour < 17) return 'day'
      if (hour >= 17 && hour < 20) return 'dusk'
      return 'night'
    }

    const PHASE_LABEL = { morning: '清晨', day: '白天', dusk: '黄昏', night: '深夜' }

    function inHours(fish, hour) {
      if (!fish.hour) return true
      return hour >= fish.hour[0] && hour < fish.hour[1]
    }

    function matchesTime(fish, phase) {
      return !fish.time || fish.time === phase
    }

    function marketOf(dateKey) {
      const random = seeded(hash32(`market:${dateKey}`))
      const order = FISH.slice().sort(() => random() - 0.5)
      return {
        hot: [order[0]?.id, order[1]?.id].filter(Boolean),
        cold: order[2]?.id,
      }
    }

    function marketModifier(fishId, market) {
      if (market.hot.includes(fishId)) return 2
      if (market.cold === fishId) return 0.5
      return 1
    }

    function rollSize(fish, power, random) {
      const span = fish.max - fish.min
      const reach = clamp(power / 100, 0, 1)
      const roll = 0.12 + random() * 0.62 + reach * 0.26
      return Math.round((fish.min + span * clamp(roll, 0, 1)) * 10) / 10
    }

    function sellPrice(fish, size, quality, market) {
      const price = RARITY[fish.rarity].price
      if (!price) return 0
      const span = Math.max(1, fish.max - fish.min)
      const ratio = clamp((size - fish.min) / span, 0, 1)
      const base = price[0] + (price[1] - price[0]) * Math.pow(ratio, 0.85)
      const qualityFactor = quality === 'shiny' ? 2 : quality === 'fat' ? 1.5 : 1
      return Math.max(1, Math.round(base * qualityFactor * marketModifier(fish.id, market)))
    }

    function fishWeight(fish, options) {
      let weight = RARITY[fish.rarity].weight
      if (fish.boss) weight *= 0.28 * (0.4 + clamp(options.power / 100, 0, 1) * 0.6)
      if (fish.hidden) {
        if (!inHours(fish, options.hour)) return 0
        weight *= 0.7
      }
      if (fish.time && fish.time !== options.phase) weight *= 0.05
      if (fish.weekly && fish.weekly !== options.weekday) weight *= 0.12
      if (fish.weather === 'storm') weight *= options.storm ? 2.2 : 0.45
      if (fish.deep) weight *= 0.35 + options.deepDive
      if (options.power > 55) {
        weight *= RARITY_ORDER[fish.rarity] >= 2 ? 1.35 : 1
      } else if (options.power < 25) {
        weight *= RARITY_ORDER[fish.rarity] >= 3 ? 0.5 : 1
      }
      if (options.bait === 'bug' && fish.bass) weight *= 2.4
      if (options.bait === 'coffee' && fish.time === 'morning') weight *= 1.8
      if (options.bait === 'chain') {
        weight *= RARITY_ORDER[fish.rarity] >= 2 ? 1.45 : 0.85
      }
      if (options.pity >= BALANCE.pity && RARITY_ORDER[fish.rarity] >= 2) weight *= 3
      return Math.max(0, weight)
    }

    function pickWeighted(entries, random) {
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
      if (total <= 0) return null
      let roll = random() * total
      for (const entry of entries) {
        roll -= entry.weight
        if (roll <= 0) return entry.fish
      }
      return entries[entries.length - 1].fish
    }

    function rollFish(pondId, options) {
      const random = options.random
      const pool = FISH.filter((fish) => fish.pond === pondId)
      const entries = pool
        .map((fish) => ({ fish, weight: fishWeight(fish, options) }))
        .filter((entry) => entry.weight > 0)
      if (entries.length === 0) return null
      let caught = pickWeighted(entries, random)
      if (!caught) return null
      if (options.pity >= BALANCE.pity && RARITY_ORDER[caught.rarity] < 2) {
        const upgraded = entries.filter((entry) => RARITY_ORDER[entry.fish.rarity] >= 2)
        if (upgraded.length > 0) caught = pickWeighted(upgraded, random) || caught
      }
      return caught
    }

    function rollQuality(random) {
      if (random() < BALANCE.shinyChance) return 'shiny'
      if (random() < BALANCE.fatChance) return 'fat'
      return 'normal'
    }

    function creditWithCap(pointsToday, amount) {
      let cursor = Math.max(0, pointsToday)
      let remaining = Math.max(0, amount)
      let credited = 0
      let guard = 0
      while (remaining > 0.0001 && guard < 8) {
        guard += 1
        const tier = BALANCE.softCap.find(([low, high]) => cursor >= low && cursor < high)
        if (!tier) break
        const room = tier[1] - cursor
        const take = Math.min(room, remaining)
        credited += take * tier[2]
        cursor += take
        remaining -= take
      }
      return credited
    }

    const fmt = (value) => {
      const rounded = Math.round(value * 10) / 10
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
    }

    const fmtInt = (value) => Math.round(value).toLocaleString('zh-CN')

    function timeToClock(ms) {
      const date = new Date(ms)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    /* ------------------------------------------------------------------ *
     * 3. 存档：本地 JSON，带版本号；不产生任何网络请求
     * ------------------------------------------------------------------ */

    const SAVE_KEY = 'dsh.moyutang.save.v1'
    const MAX_BASKET = 60
    const MAX_DIARY = 40

    function freshDayStats() {
      return {
        casts: 0,
        catches: 0,
        rareCatches: 0,
        sold: 0,
        stormCatches: 0,
        shinyCatches: 0,
        distinct: [],
      }
    }

    function defaultSave() {
      return {
        v: 1,
        createdAt: Date.now(),
        points: 0,
        coins: 0,
        favor: {},
        credit: {
          day: dayKey(),
          pointsToday: 0,
          creditedToday: 0,
          seenTotal: null,
          seenTurns: null,
          streak: 1,
          lastActiveDay: null,
        },
        collection: {},
        basket: [],
        ponds: ['newbie-creek'],
        gear: { rod: 'bamboo', line: 'cork', bait: 'bread' },
        inventory: { coffee: 0, bug: 0, chain: 0 },
        owned: {},
        decor: [],
        stats: {
          casts: 0,
          catches: 0,
          misses: 0,
          emptyStreak: 0,
          maxEmptyStreak: 0,
          sold: 0,
          coinsEarned: 0,
          coinsSpent: 0,
          pointsEarned: 0,
          bossCaught: {},
          bugCatches: 0,
          day: dayKey(),
          dayStats: freshDayStats(),
        },
        quests: { day: dayKey(), items: [] },
        achievements: {},
        diary: [],
        feed: [],
        cheat: { manual: 0 },
        settings: { auto: false, autoPond: 'newbie-creek', reduceMotion: false, confirmPause: true },
        auto: null,
        updatedAt: Date.now(),
      }
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value))
    }

    function loadSave() {
      const base = defaultSave()
      try {
        const text = localStorage.getItem(SAVE_KEY)
        if (!text) {
          base.points = 40
          base.coins = 200
          base.feed = [{ at: Date.now(), text: '新手礼包：40 鱼饵积分 + 200 金币' }]
          return base
        }
        const raw = JSON.parse(text)
        if (!raw || typeof raw !== 'object') return base
        const merged = { ...base, ...raw }
        merged.credit = { ...base.credit, ...(raw.credit || {}) }
        merged.gear = { ...base.gear, ...(raw.gear || {}) }
        merged.settings = { ...base.settings, ...(raw.settings || {}) }
        merged.inventory = { ...base.inventory, ...(raw.inventory || {}) }
        merged.stats = { ...base.stats, ...(raw.stats || {}) }
        merged.stats.dayStats = { ...freshDayStats(), ...(raw.stats?.dayStats || {}) }
        merged.quests = { ...base.quests, ...(raw.quests || {}) }
        merged.collection = raw.collection && typeof raw.collection === 'object' ? raw.collection : {}
        merged.basket = Array.isArray(raw.basket) ? raw.basket.slice(0, MAX_BASKET) : []
        merged.diary = Array.isArray(raw.diary) ? raw.diary.slice(0, MAX_DIARY) : []
        merged.feed = Array.isArray(raw.feed) ? raw.feed.slice(0, 12) : []
        merged.auto = raw.auto && typeof raw.auto === 'object' ? raw.auto : null
        merged.ponds = Array.isArray(raw.ponds) && raw.ponds.length > 0 ? raw.ponds : ['newbie-creek']
        merged.decor = Array.isArray(raw.decor) ? raw.decor : []
        merged.owned = raw.owned && typeof raw.owned === 'object' ? raw.owned : {}
        merged.achievements = raw.achievements && typeof raw.achievements === 'object' ? raw.achievements : {}
        merged.favor = raw.favor && typeof raw.favor === 'object' ? raw.favor : {}
        merged.cheat = { ...base.cheat, ...(raw.cheat || {}) }
        merged.points = Number.isFinite(raw.points) ? raw.points : 0
        merged.coins = Number.isFinite(raw.coins) ? raw.coins : 0
        return merged
      } catch {
        return base
      }
    }

    function persistSave(save) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(save))
      } catch {}
    }

    function pushFeed(save, text) {
      save.feed = [{ at: Date.now(), text }, ...(save.feed || [])].slice(0, 12)
    }

    function pushDiary(save, text, fishId, size) {
      save.diary = [{ at: Date.now(), text, fishId, size }, ...(save.diary || [])].slice(0, MAX_DIARY)
    }

    function buildQuests(dateKey) {
      const random = seeded(hash32(`quests:${dateKey}`))
      const order = QUEST_POOL.slice().sort(() => random() - 0.5)
      return order.slice(0, 3).map((quest) => ({ id: quest.id, claimed: false }))
    }

    function ensureDay(save, now = new Date()) {
      const today = dayKey(now)
      if (save.stats.day !== today) {
        save.stats.day = today
        save.stats.dayStats = freshDayStats()
      }
      if (save.quests.day !== today) {
        save.quests = { day: today, items: buildQuests(today) }
      }
      if (save.credit.day !== today) {
        save.credit.day = today
        save.credit.pointsToday = 0
        save.credit.creditedToday = 0
      }
      return save
    }

    function bumpStreak(save, today) {
      const credit = save.credit
      if (credit.lastActiveDay === today) return
      const yesterday = shiftDay(today, -1)
      credit.streak = credit.lastActiveDay === yesterday ? Math.min(30, credit.streak + 1) : 1
      credit.lastActiveDay = today
    }

    function streakMultiplier(streak) {
      return 1 + Math.min(BALANCE.streakMax, BALANCE.streakPerDay * Math.max(0, streak - 1))
    }

    /** Token → 鱼饵积分：倍率、软上限、完成奖励，全部在本地结算。 */
    function creditFromMetrics(save, metrics) {
      ensureDay(save)
      const credit = save.credit
      let changed = false
      if (credit.seenTotal === null || credit.seenTurns === null) {
        // 首次同步从 0 起算：Host 已经记下的 Token 会按当日软上限补发一次。
        // （必须返回 true，否则 draft 会被丢弃、基线永远存不下来。）
        credit.seenTotal = 0
        credit.seenTurns = 0
        changed = true
      }
      const total = metrics.totalEffectiveTokens || 0
      if (total < credit.seenTotal) {
        credit.seenTotal = total
        changed = true
      }
      const deltaTokens = total - credit.seenTotal
      const deltaTurns = Math.max(0, (metrics.turnsCompleted || 0) - credit.seenTurns)
      if (deltaTokens <= 0 && deltaTurns <= 0) return changed
      const today = dayKey()
      bumpStreak(save, today)
      const raw =
        (deltaTokens / BALANCE.tokensPerPoint) * streakMultiplier(credit.streak) +
        deltaTurns * BALANCE.completionBonus
      const credited = creditWithCap(credit.pointsToday, raw)
      credit.pointsToday += raw
      credit.seenTotal = total
      credit.seenTurns = metrics.turnsCompleted || 0
      if (credited > 0.0001) {
        save.points += credited
        credit.creditedToday = (credit.creditedToday || 0) + credited
        save.stats.pointsEarned += credited
      }
      return true
    }

    function questProgress(quest, dayStats) {
      if (!quest) return 0
      if (quest.metric === 'distinct') return (dayStats.distinct || []).length
      const value = dayStats[quest.metric]
      return typeof value === 'number' ? value : 0
    }

    function unlockRequirementMissing(save, pond, now = new Date()) {
      const species = Object.keys(save.collection).length
      const bosses = Object.keys(save.stats.bossCaught || {}).length
      const missing = []
      if (pond.unlock.coins > 0 && save.coins < pond.unlock.coins) {
        missing.push(`金币 ${fmtInt(save.coins)} / ${fmtInt(pond.unlock.coins)}`)
      }
      if (pond.unlock.species > 0 && species < pond.unlock.species) {
        missing.push(`图鉴 ${species} / ${pond.unlock.species}`)
      }
      if (pond.unlock.bosses && bosses < pond.unlock.bosses) {
        missing.push(`Boss ${bosses} / ${pond.unlock.bosses}`)
      }
      if (pond.id === 'overtime-sea' && now.getHours() < 19) {
        missing.push('19:00 后开放')
      }
      return missing
    }

    function seasonOf(pond) {
      if (pond.id === 'newbie-creek') return 'sunny'
      return 'calm'
    }

    /* ------------------------------------------------------------------ *
     * 4. React 绑定：存档、指标轮询、本地化
     * ------------------------------------------------------------------ */

    const RuntimeContext = React.createContext(null)

    function useRuntime() {
      return React.useContext(RuntimeContext) || { t: (key) => key, locale: null, layout: null }
    }

    /* 一个存档、一个计量轮询，供鱼塘面板与对话底部的挂机条共用：
       否则两处各写各的 localStorage，会互相覆盖。 */

    let gameState = null
    const gameListeners = new Set()

    function notifyGame() {
      gameListeners.forEach((listener) => {
        try {
          listener()
        } catch {}
      })
    }

    let gameStoreInstance = null

    function gameStore() {
      if (gameStoreInstance) return gameStoreInstance
      gameState = loadSave()
      window.addEventListener('storage', (event) => {
        if (event.key !== SAVE_KEY || !event.newValue) return
        try {
          gameState = loadSave()
          notifyGame()
        } catch {}
      })
      gameStoreInstance = {
        get: () => gameState,
        subscribe(listener) {
          gameListeners.add(listener)
          return () => gameListeners.delete(listener)
        },
        act(mutator) {
          const draft = clone(gameState)
          ensureDay(draft)
          if (mutator(draft) === false) return false
          draft.updatedAt = Date.now()
          gameState = draft
          persistSave(gameState)
          notifyGame()
          return true
        },
      }
      return gameStoreInstance
    }

    function useGame() {
      const store = gameStore()
      const [, force] = useState(0)
      useEffect(() => store.subscribe(() => force((value) => value + 1)), [store])
      const ref = useMemo(
        () => ({
          get current() {
            return store.get()
          },
        }),
        [store],
      )
      return { save: store.get(), act: store.act, ref }
    }

    let metricsState = { status: 'connecting', metrics: null, debug: null, serverTime: 0, at: 0 }
    let metricsTimer = null
    let metricsRefs = 0
    const metricsListeners = new Set()

    async function pollMetrics() {
      try {
        const response = await fetch('/moyutang-api/state', { cache: 'no-store' })
        if (!response.ok) throw new Error(`http ${response.status}`)
        const body = await response.json()
        if (!body || !body.metrics) throw new Error('bad payload')
        metricsState = {
          status: 'online',
          metrics: body.metrics,
          debug: body.debug || null,
          serverTime: body.serverTime || Date.now(),
          at: Date.now(),
        }
        // 结算放在轮询里：面板没打开时（只看对话）积分也照涨。
        gameStore().act((draft) => creditFromMetrics(draft, body.metrics))
      } catch (error) {
        metricsState = { ...metricsState, status: 'offline' }
      }
      metricsListeners.forEach((listener) => {
        try {
          listener()
        } catch {}
      })
    }

    function useMetrics() {
      const [, force] = useState(0)
      useEffect(() => {
        const listener = () => force((value) => value + 1)
        metricsRefs += 1
        metricsListeners.add(listener)
        if (!metricsTimer) {
          pollMetrics()
          metricsTimer = setInterval(pollMetrics, 5000)
        }
        return () => {
          metricsListeners.delete(listener)
          metricsRefs -= 1
          if (metricsRefs <= 0 && metricsTimer) {
            clearInterval(metricsTimer)
            metricsTimer = null
          }
        }
      }, [])
      return metricsState
    }

    function useAssets() {
      const [state, setState] = useState({ version: 0, fish: [], items: [], ponds: [] })
      useEffect(() => {
        let alive = true
        fetch('/moyutang-api/assets', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            if (!alive || !body || !body.ok) return
            setState({
              version: body.version || 0,
              fish: body.fish || [],
              items: body.items || [],
              ponds: body.ponds || [],
            })
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [])
      const fish = useMemo(() => new Set(state.fish), [state.fish])
      const items = useMemo(() => new Set(state.items), [state.items])
      const ponds = useMemo(() => new Set(state.ponds), [state.ponds])
      const version = state.version
      const url = useCallback(
        (kind, id) => `/moyutang-api/asset/${kind}/${id}.webp${version ? `?v=${version}` : ''}`,
        [version],
      )
      return useMemo(() => ({ fish, items, ponds, url }), [fish, items, ponds, url])
    }

    function FishImage({ fish, size = 72, assets, locked = false, shiny = false }) {
      const [broken, setBroken] = useState(false)
      const hasArt = Boolean(assets && assets.fish.has(fish.id)) && !broken
      if (locked || !hasArt) return h(FishArt, { fish, size, locked, shiny })
      const image = h('img', {
        src: assets.url('fish', fish.id),
        width: size,
        height: size,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
        onError: () => setBroken(true),
        style: { display: 'block', objectFit: 'contain' },
      })
      if (!shiny) return image
      return h(
        'span',
        {
          className: 'mt-shiny',
          style: { width: size, height: size },
        },
        image,
        h('span', { className: 'mt-shiny-star', 'aria-hidden': true }, '✦'),
      )
    }

    function ItemIcon({ id, assets, size = 32, alt = '' }) {
      if (!assets || !assets.items.has(id)) return null
      return h('img', {
        src: assets.url('items', id),
        width: size,
        height: size,
        alt,
        loading: 'lazy',
        decoding: 'async',
        draggable: false,
        style: { display: 'block', objectFit: 'contain', flex: '0 0 auto' },
      })
    }

    /* ------------------------------------------------------------------ *
     * 5. 钓鱼状态机：蓄力 → 等待咬钩 → 张力收线 → 鱼卡结算
     * ------------------------------------------------------------------ */

    function uuid() {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }

    function habitatText(fish) {
      if (fish.boss) return '鱼塘 Boss · 三回合'
      if (fish.hidden) return `隐藏 · ${pad2(fish.hour[0])}:00–${pad2(fish.hour[1])}:00`
      const bits = []
      if (fish.time) bits.push(PHASE_LABEL[fish.time])
      if (fish.weather === 'storm') bits.push('雷雨')
      if (fish.weekly) bits.push(['周日', '周一', '周二', '周三', '周四', '周五', '周六'][fish.weekly])
      if (fish.deep) bits.push('深水')
      return bits.length > 0 ? bits.join(' · ') : '全天'
    }

    function commitCatch(save, pond, fish, item, storm) {
      const stats = save.stats
      const dayStats = stats.dayStats
      const now = item.at
      const known = save.collection[fish.id]
      if (!known) {
        save.collection[fish.id] = {
          firstAt: now,
          count: 1,
          maxSize: item.size,
          shiny: item.quality === 'shiny',
          shinyAt: item.quality === 'shiny' ? now : 0,
        }
      } else {
        known.count += 1
        if (item.size > (known.maxSize || 0)) known.maxSize = item.size
        if (item.quality === 'shiny' && !known.shiny) {
          known.shiny = true
          known.shinyAt = now
        }
      }
      if (save.basket.length < MAX_BASKET) save.basket.unshift(item)
      stats.catches += 1
      stats.emptyStreak = 0
      dayStats.catches += 1
      if (RARITY_ORDER[fish.rarity] >= 2) dayStats.rareCatches += 1
      if (storm) dayStats.stormCatches += 1
      if (item.quality === 'shiny') {
        dayStats.shinyCatches += 1
        stats.shinyCatches = (stats.shinyCatches || 0) + 1
      }
      if (fish.bass) stats.bugCatches = (stats.bugCatches || 0) + 1
      if (!dayStats.distinct.includes(fish.id)) dayStats.distinct.push(fish.id)
      if (fish.boss) stats.bossCaught[pond.id] = true
      stats.sinceSR = RARITY_ORDER[fish.rarity] >= 2 ? 0 : (stats.sinceSR || 0) + 1
      const localHour = new Date(now).getHours()
      if (fish.boss) pushDiary(save, `钓上了 ${pond.name} 的 Boss「${fish.name}」`, fish.id, item.size)
      else pushDiary(save, `在${pond.name}钓到 ${fish.name} · ${item.size}cm`, fish.id, item.size)
      return { localHour }
    }

    function checkAchievements(save, localHour) {
      const unlocked = []
      const has = (id) => Boolean(save.achievements[id])
      const award = (id) => {
        const def = ACHIEVEMENTS.find((entry) => entry.id === id)
        if (!def || has(id)) return
        save.achievements[id] = Date.now()
        save.coins += def.coins
        save.stats.coinsEarned += def.coins
        unlocked.push(def)
        pushFeed(save, `成就解锁：${def.name}（+${def.coins} 金币）`)
      }
      if ((save.stats.maxEmptyStreak || 0) >= 10) award('empty10')
      if ((save.stats.bugCatches || 0) >= 3) award('bugtamer')
      if (localHour >= 3 && localHour < 4 && save.stats.catches > 0) award('nightowl')
      if (Object.keys(save.stats.bossCaught || {}).length >= 1) award('boss1')
      if (Object.keys(save.collection).length >= 30) award('half')
      if (save.collection.jing) award('whale')
      return unlocked
    }

    /* ------------------------------------------------------------------ *
     * 5. 挂机钓鱼：一个模块级计时器，鱼塘面板与对话底部的挂机条共用
     * ------------------------------------------------------------------ */

    function setAutoFishing(save, enabled) {
      save.settings.auto = Boolean(enabled)
      if (enabled) save.auto = { startedAt: Date.now(), catches: 0, misses: 0, lastAt: 0 }
      return true
    }

    function effectiveDeepDive(metrics) {
      const reasoningMs = metrics?.reasoningMsToday || 0
      const todayTokens = metrics?.todayEffectiveTokens || 0
      return clamp(reasoningMs > 0 ? reasoningMs / (10 * 60 * 1000) : todayTokens / 300000, 0, 1)
    }

    function runAutoCast() {
      const store = gameStore()
      const save = store.get()
      if (!save.settings.auto) return
      const pond = POND_BY_ID[save.settings.autoPond] || PONDS[0]
      if (!save.ponds.includes(pond.id)) return
      const current = new Date()
      if (pond.id === 'overtime-sea' && current.getHours() < 19) return
      const metrics = metricsState.metrics
      const deepDive = effectiveDeepDive(metrics)
      if (pond.id === 'context-abyss' && deepDive < 0.05) return
      if (save.points + 1e-6 < pond.cost) return
      const storm = Boolean(metrics?.storm)
      const success = Math.random() < BALANCE.autoSuccess
      store.act((draft) => {
        draft.points = Math.max(0, draft.points - pond.cost)
        draft.stats.casts += 1
        draft.stats.dayStats.casts += 1
        draft.auto = {
          startedAt: draft.auto?.startedAt || Date.now(),
          catches: draft.auto?.catches || 0,
          misses: draft.auto?.misses || 0,
          lastAt: Date.now(),
        }
        if (!success) {
          draft.stats.misses += 1
          draft.stats.emptyStreak += 1
          draft.stats.maxEmptyStreak = Math.max(draft.stats.maxEmptyStreak, draft.stats.emptyStreak)
          draft.auto.misses += 1
          return true
        }
        const options = {
          power: 55,
          bait: 'bread',
          storm,
          deepDive,
          hour: current.getHours(),
          phase: phaseOfHour(current.getHours()),
          weekday: current.getDay(),
          pity: draft.stats.sinceSR || 0,
          random: Math.random,
        }
        const fish = rollFish(pond.id, options) || FISH.find((entry) => entry.pond === pond.id) || FISH[0]
        const quality = rollQuality(Math.random)
        const size = rollSize(fish, 55, Math.random)
        const item = {
          uid: uuid(),
          fishId: fish.id,
          size,
          quality,
          price: sellPrice(fish, size, quality, marketOf(dayKey())),
          at: Date.now(),
        }
        const info = commitCatch(draft, pond, fish, item, storm)
        checkAchievements(draft, info.localHour)
        draft.auto.catches += 1
        draft.auto.lastFish = fish.id
        draft.auto.lastSize = size
        return true
      })
    }

    let autoTimer = null
    let autoRefs = 0

    function useAutoFishing() {
      useEffect(() => {
        autoRefs += 1
        if (autoTimer === null) {
          autoTimer = setInterval(runAutoCast, BALANCE.autoIntervalMs)
          autoTimer.unref?.()
        }
        return () => {
          autoRefs -= 1
          if (autoRefs <= 0 && autoTimer !== null) {
            clearInterval(autoTimer)
            autoTimer = null
          }
        }
      }, [])
    }

    function usePondMachine({ game, metrics, pond, weather, deepDive, onToast }) {
      const { act, ref } = game
      const pondRef = useRef(pond)
      pondRef.current = pond
      const metricsRef = useRef(metrics)
      metricsRef.current = metrics
      const machine = useRef({
        phase: 'idle',
        t0: 0,
        power: 0,
        castPower: 0,
        biteAt: 0,
        biteDeadline: 0,
        biteWindow: BALANCE.biteWindowMs,
        nextNibble: 0,
        nibbleUntil: 0,
        tension: BALANCE.reel.start,
        progress: 0,
        phaseIndex: 1,
        phaseCount: 1,
        surgeAt: 0,
        surgeUntil: 0,
        surgeRate: 0,
        holding: false,
        pending: null,
        card: null,
        message: null,
        messageUntil: 0,
        float: null,
        castFrom: null,
        castTo: null,
        castStart: 0,
        castDur: 640,
        splashAt: 0,
        splash: false,
      })
      const [, forceRender] = useState(0)
      const bump = useCallback(() => forceRender((value) => value + 1), [])

      const setMessage = useCallback((text, duration = 2400) => {
        machine.current.message = text
        machine.current.messageUntil = performance.now() + duration
        bump()
      }, [bump])

      const clearCard = useCallback(() => {
        machine.current.card = null
        machine.current.phase = 'idle'
        machine.current.pending = null
        machine.current.progress = 0
        machine.current.tension = BALANCE.reel.start
        machine.current.holding = false
        machine.current.power = 0
        machine.current.float = null
        machine.current.splash = false
        bump()
      }, [bump])

      const rod = useMemo(() => RODS.find((entry) => entry.id === game.save.gear.rod) || RODS[0], [game.save.gear.rod])
      const line = useMemo(() => LINES.find((entry) => entry.id === game.save.gear.line) || LINES[0], [game.save.gear.line])
      const rodRef = useRef(rod)
      rodRef.current = rod
      const lineRef = useRef(line)
      lineRef.current = line

      const fail = useCallback(
        (reason, options = {}) => {
          const m = machine.current
          m.phase = 'idle'
          m.pending = null
          m.card = null
          m.holding = false
          m.progress = 0
          m.tension = BALANCE.reel.start
          m.power = 0
          m.float = null
          m.splash = false
          if (!options.silent) {
            act((save) => {
              save.stats.misses += 1
              save.stats.emptyStreak += 1
              save.stats.maxEmptyStreak = Math.max(save.stats.maxEmptyStreak, save.stats.emptyStreak)
              pushDiary(save, `空军：${reason}`)
              const unlocked = checkAchievements(save, new Date().getHours())
              if (unlocked.length > 0 && onToast) onToast(`成就解锁：${unlocked.map((a) => a.name).join('、')}`)
              return true
            })
            setMessage(reason)
          }
          bump()
        },
        [act, bump, onToast, setMessage],
      )

      const land = useCallback(() => {
        const m = machine.current
        const pending = m.pending
        if (!pending) {
          clearCard()
          return
        }
        const target = pondRef.current
        const save = ref.current
        const market = marketOf(dayKey())
        const price = sellPrice(pending.fish, pending.size, pending.quality, market)
        const known = save.collection[pending.fish.id]
        const preview = {
          isNew: !known,
          record: Boolean(known) && pending.size > (known.maxSize || 0),
          shinyNew: pending.quality === 'shiny' && !known?.shiny,
        }
        const item = {
          uid: uuid(),
          fishId: pending.fish.id,
          size: pending.size,
          quality: pending.quality,
          price,
          at: Date.now(),
        }
        let achievements = []
        act((draft) => {
          const info = commitCatch(draft, target, pending.fish, item, pending.storm)
          achievements = checkAchievements(draft, info.localHour)
          return true
        })
        if (achievements.length > 0 && onToast) {
          onToast(`成就解锁：${achievements.map((a) => a.name).join('、')}`)
        }
        m.card = {
          ...preview,
          item,
          fish: pending.fish,
          price,
          size: pending.size,
          quality: pending.quality,
          storm: pending.storm,
          boss: pending.fish.boss,
        }
        m.phase = 'card'
        m.holding = false
        bump()
      }, [act, bump, clearCard, onToast, ref])

      const startReel = useCallback(() => {
        const m = machine.current
        const pending = m.pending
        if (!pending) return
        m.phase = 'reel'
        m.t0 = performance.now()
        m.tension = BALANCE.reel.start
        m.progress = 0
        m.phaseIndex = 1
        m.phaseCount = pending.fish.boss ? 3 : 1
        m.holding = false
        m.surgeAt = performance.now() + 900
        m.surgeUntil = 0
        m.surgeRate = 0
        bump()
      }, [bump])

      const castStart = useCallback(() => {
        const m = machine.current
        if (m.phase !== 'idle') return
        const save = ref.current
        const target = pondRef.current
        const now = new Date()
        if (!save.ponds.includes(target.id)) {
          setMessage('这个鱼塘还没解锁')
          return
        }
        if (target.id === 'overtime-sea' && now.getHours() < 19) {
          setMessage('加班夜海 19:00 后才开放')
          return
        }
        if (target.id === 'context-abyss' && deepDive < 0.05) {
          setMessage('深潜不足：让 Agent 多思考一会儿再来')
          return
        }
        if (save.points + 1e-6 < target.cost) {
          setMessage(`鱼饵积分不足，需要 ${target.cost}（当前 ${fmt(save.points)}）`)
          return
        }
        m.phase = 'charging'
        m.t0 = performance.now()
        m.power = 0
        bump()
      }, [bump, deepDive, ref, setMessage])

      const castRelease = useCallback(() => {
        const m = machine.current
        if (m.phase !== 'charging') return
        const target = pondRef.current
        const save = ref.current
        const power = Math.round(m.power)
        const baitId = save.gear.bait
        const owned = baitId === 'bread' ? Infinity : save.inventory[baitId] || 0
        const bait = owned > 0 ? baitId : 'bread'
        if (bait !== baitId) setMessage('这个鱼饵用完了，换回面包屑', 1600)
        act((draft) => {
          draft.points = Math.max(0, draft.points - target.cost)
          if (bait !== 'bread') draft.inventory[bait] = Math.max(0, (draft.inventory[bait] || 0) - 1)
          draft.stats.casts += 1
          draft.stats.dayStats.casts += 1
          return true
        })
        const now = performance.now()
        const [low, high] = BALANCE.biteWaitMs
        const current = new Date()
        const storm = Boolean(metricsRef.current?.storm)
        const options = {
          power,
          bait,
          storm,
          deepDive,
          hour: current.getHours(),
          phase: phaseOfHour(current.getHours()),
          weekday: current.getDay(),
          pity: save.stats.sinceSR || 0,
          random: Math.random,
        }
        const fish = rollFish(target.id, options) || FISH.find((f) => f.pond === target.id && !f.hidden)
        const quality = rollQuality(Math.random)
        const size = rollSize(fish, power, Math.random)
        m.castPower = power
        m.pending = { fish, size, quality, storm, power, bait }
        const anchor = target.anchor || { from: [10, 92], float: [52, 60] }
        m.castFrom = anchor.from
        m.castTo = anchor.float
        m.float = { x: anchor.from[0], y: anchor.from[1] }
        m.castStart = now
        m.castDur = 560 + (100 - power) * 2.2
        m.splashAt = 0
        m.splash = false
        m.phase = 'casting'
        m.t0 = now
        m.biteAt = now + low + Math.random() * (high - low)
        m.nextNibble = Math.random() < 0.75 ? now + 600 + Math.random() * Math.max(500, m.biteAt - now - 1200) : 0
        m.biteWindow = BALANCE.biteWindowMs + (lineRef.current?.bite || 0)
        m.nibbleUntil = 0
        bump()
      }, [act, bump, deepDive, ref, setMessage])

      const tap = useCallback(() => {
        const m = machine.current
        const now = performance.now()
        if (m.phase === 'waiting') {
          if (now < m.nibbleUntil) {
            fail('提竿太早，假动作把你骗了')
            return
          }
          if (now < m.biteAt) {
            fail('手快了，鱼还没咬钩')
            return
          }
          startReel()
          return
        }
        if (m.phase === 'bite') {
          if (now <= m.biteDeadline) startReel()
          else fail('慢了一拍，鱼跑了')
          return
        }
        if (m.phase === 'reel') {
          m.holding = !m.holding
          bump()
        }
      }, [bump, fail, startReel])

      const holdStart = useCallback(() => {
        const m = machine.current
        if (m.phase === 'reel') {
          m.holding = true
          bump()
        }
      }, [bump])

      const holdEnd = useCallback(() => {
        const m = machine.current
        if (m.phase === 'reel' && m.holding) {
          m.holding = false
          bump()
        }
      }, [bump])

      const primaryDown = useCallback(() => {
        const m = machine.current
        if (m.phase === 'idle') castStart()
        else if (m.phase === 'waiting' || m.phase === 'bite') tap()
        else if (m.phase === 'reel') holdStart()
      }, [castStart, holdStart, tap])

      const primaryUp = useCallback(() => {
        const m = machine.current
        if (m.phase === 'charging') castRelease()
        else if (m.phase === 'reel') holdEnd()
      }, [castRelease, holdEnd])

      const settle = useCallback(
        (action) => {
          const m = machine.current
          const card = m.card
          if (!card) return
          const target = pondRef.current
          if (action === 'keep') {
            act((save) => {
              pushFeed(save, `${card.fish.name} 已放入鱼篓`)
              return true
            })
          } else if (action === 'sell') {
            if (card.price <= 0) {
              setMessage('传说鱼不能卖，只能收藏')
              return
            }
            act((save) => {
              save.basket = save.basket.filter((entry) => entry.uid !== card.item.uid)
              save.coins += card.price
              save.stats.coinsEarned += card.price
              save.stats.sold += 1
              save.stats.dayStats.sold += 1
              pushDiary(save, `卖出 ${card.fish.name}，+${card.price} 金币`)
              return true
            })
            if (onToast) onToast(`卖出 ${card.fish.name}，+${card.price} 金币`)
          } else if (action === 'release') {
            act((save) => {
              save.basket = save.basket.filter((entry) => entry.uid !== card.item.uid)
              save.favor[target.id] = (save.favor[target.id] || 0) + 1
              pushDiary(save, `放生 ${card.fish.name}，${target.name}好感 +1`)
              return true
            })
            if (onToast) onToast(`放生 ${card.fish.name}，鱼塘好感 +1`)
          }
          clearCard()
        },
        [act, clearCard, onToast, setMessage],
      )

      useEffect(() => {
        let raf = 0
        let last = performance.now()
        const frame = (now) => {
          const m = machine.current
          const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
          last = now
          if (m.message && now > m.messageUntil) {
            m.message = null
            bump()
          }
          if (m.phase === 'charging') {
            const elapsed = (now - m.t0) / 1000
            const cycle = 1.6
            const position = (elapsed % cycle) / cycle
            m.power = position < 0.5 ? position * 200 : (1 - (position - 0.5) * 2) * 100
            bump()
          } else if (m.phase === 'casting') {
            const k = clamp((now - m.castStart) / m.castDur, 0, 1)
            const ease = 1 - Math.pow(1 - k, 2.2)
            const from = m.castFrom || [10, 92]
            const to = m.castTo || [52, 60]
            m.float = {
              x: from[0] + (to[0] - from[0]) * ease,
              y: from[1] + (to[1] - from[1]) * ease - Math.sin(Math.PI * k) * 15,
            }
            if (k >= 1) {
              m.phase = 'waiting'
              m.float = { x: to[0], y: to[1] }
              m.splashAt = now
              m.splash = true
              m.t0 = now
            }
            bump()
          } else if (m.phase === 'waiting') {
            if (m.nextNibble > 0 && now >= m.nextNibble) {
              m.nibbleUntil = now + 260
              m.nextNibble = 0
            }
            if (m.splash && now - m.splashAt > 780) m.splash = false
            if (m.castTo) {
              const bob = Math.sin(now / 430) * 0.55 + (now < m.nibbleUntil ? 1.7 : 0)
              m.float = { x: m.castTo[0], y: m.castTo[1] + bob }
            }
            if (now >= m.biteAt) {
              m.phase = 'bite'
              m.t0 = now
              m.biteDeadline = now + m.biteWindow
              m.splashAt = now
              m.splash = true
            }
            bump()
          } else if (m.phase === 'bite') {
            if (now >= m.biteDeadline) {
              fail('慢了一拍，鱼把饵吐了')
            } else {
              const elapsed = (now - m.t0) / 1000
              if (m.splash && now - m.splashAt > 780) m.splash = false
              if (m.castTo) {
                m.float = {
                  x: m.castTo[0] + Math.sin(elapsed * 27) * 0.5,
                  y: m.castTo[1] + 3.6 + Math.sin(elapsed * 41) * 0.7,
                }
              }
              bump()
            }
          } else if (m.phase === 'reel') {
            const rodNow = rodRef.current
            const lineNow = lineRef.current
            const breakAt = BALANCE.reel.breakAt + (lineNow?.breakAt || 0)
            const high = Math.min(breakAt - 6, 74 + ((rodNow?.tolerance || 1) - 1) * 34)
            const low = 18
            let tension = m.tension
            tension += (m.holding ? BALANCE.reel.hold : -BALANCE.reel.release) * dt
            if (m.surgeUntil > now) {
              const remaining = (m.surgeUntil - now) / BALANCE.reel.burstDecayMs
              tension += m.surgeRate * Math.max(0, remaining) * dt
            }
            tension = clamp(tension, 0, breakAt + 20)
            const inBand = tension >= low && tension <= high
            let progress = m.progress + (inBand ? BALANCE.reel.progressGain : -BALANCE.reel.progressLoss) * dt
            progress = clamp(progress, 0, 100)
            m.tension = tension
            m.progress = progress
            if (m.castTo && m.castFrom) {
              const pull = (progress / 100) * 0.6
              m.float = {
                x: m.castTo[0] + (m.castFrom[0] - m.castTo[0]) * pull + Math.sin(now / 85) * 0.45,
                y: m.castTo[1] + (m.castFrom[1] - m.castTo[1]) * pull * 0.35 + Math.sin(now / 65) * 0.45,
              }
            }
            if (now >= m.surgeAt) {
              const [minBurst, maxBurst] = BALANCE.reel.burst
              m.surgeRate = (minBurst + Math.random() * (maxBurst - minBurst)) * 1.4
              m.surgeUntil = now + BALANCE.reel.burstDecayMs
              m.surgeAt = now + BALANCE.reel.burstEveryMs[0] + Math.random() * (BALANCE.reel.burstEveryMs[1] - BALANCE.reel.burstEveryMs[0])
            }
            if (tension >= breakAt) {
              fail('张力过高，断线了')
              raf = requestAnimationFrame(frame)
              return
            }
            if (progress >= 100) {
              if (m.phaseIndex < m.phaseCount) {
                m.phaseIndex += 1
                m.progress = 0
                m.tension = BALANCE.reel.start
                bump()
              } else {
                land()
              }
              raf = requestAnimationFrame(frame)
              return
            }
            bump()
          }
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)
        return () => cancelAnimationFrame(raf)
      }, [bump, fail, land])

      useEffect(() => {
        const release = () => holdEnd()
        window.addEventListener('pointerup', release)
        window.addEventListener('pointercancel', release)
        window.addEventListener('blur', release)
        return () => {
          window.removeEventListener('pointerup', release)
          window.removeEventListener('pointercancel', release)
          window.removeEventListener('blur', release)
        }
      }, [holdEnd])

      useAutoFishing()

      const m = machine.current
      return {
        phase: m.phase,
        power: m.power,
        castPower: m.castPower,
        tension: m.tension,
        progress: m.progress,
        phaseIndex: m.phaseIndex,
        phaseCount: m.phaseCount,
        nibbling: m.nibbleUntil > performance.now(),
        holding: m.holding,
        pending: m.pending,
        card: m.card,
        message: m.message,
        float: m.float,
        splash: m.splash,
        castFrom: m.castFrom,
        castTo: m.castTo,
        primaryDown,
        primaryUp,
        tap,
        settle,
        castStart,
        castRelease,
      }
    }

    /* ------------------------------------------------------------------ *
     * 6. 界面
     * ------------------------------------------------------------------ */

    const FISH_SHAPES = [
      [
        '..................',
        '.......BBBB.......',
        '.....BBBBBBBB.....',
        '...BBBBBBEBBBBB...',
        '.TBBBBBBBBBBBBBBB.',
        'TTBBBBBBBBBBBBBBB.',
        'TTBBBBBBBBBBBBBBB.',
        '.TBBBBBBBBBBBBBBB.',
        '...BBBBBBBBBBBB...',
        '.....BBBBBBBB.....',
        '.......BBBB.......',
      ],
      [
        '..................',
        '..................',
        '..BBBB............',
        '.BBBBBBB..........',
        '.BBBBBBBBBBBB.....',
        '..BBBBEBBBBBBBBBB.',
        '...BBBBB.BBBBBBB..',
        '........BBBBBBB...',
        '.........BBBBB....',
        '..................',
        '..................',
      ],
      [
        '..................',
        '.....BBBBBB.......',
        '...BBBBBBBBBB.....',
        '..BBBBBBBBBBBB....',
        '..BBEBBBBBBBBB....',
        '..BBBBBBBBBBBB....',
        '...B.B.B.B.B......',
        '...B.B.B.B.B......',
        '....B.B.B.B.......',
        '..................',
        '..................',
      ],
    ]

    function shade(hex, factor) {
      const value = hex.replace('#', '')
      const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
      const parts = [0, 2, 4].map((offset) => Math.round(clamp(parseInt(full.slice(offset, offset + 2), 16) * factor, 0, 255)))
      return `rgb(${parts[0]},${parts[1]},${parts[2]})`
    }

    function FishArt({ fish, size = 72, locked = false, shiny = false }) {
      if (!fish) return null
      const rarity = RARITY[fish.rarity] || RARITY.N
      const hash = hash32(fish.id)
      const shape = FISH_SHAPES[hash % FISH_SHAPES.length]
      const flip = (hash >> 3) % 2 === 1
      const cols = shape[0].length
      const rows = shape.length
      const unit = size / cols
      const height = rows * unit
      const cells = []
      shape.forEach((row, y) => {
        for (let x = 0; x < cols; x += 1) {
          const code = row[x]
          if (code === '.') continue
          let fill = rarity.color
          if (code === 'E') fill = '#0e1a22'
          else if (code === 'T') fill = shade(rarity.color, 0.76)
          else if (code === 'D') fill = shade(rarity.color, 1.2)
          else if (y > rows * 0.62) fill = shade(rarity.color, 1.14)
          cells.push(
            h('rect', {
              key: `${x}-${y}`,
              x: x * unit,
              y: y * unit,
              width: unit + 0.35,
              height: unit + 0.35,
              fill,
              opacity: locked ? 0.16 : 1,
            }),
          )
        }
      })
      const extras = []
      if (shiny && !locked) {
        extras.push(
          h('circle', { key: 's1', cx: size * 0.78, cy: height * 0.28, r: unit * 0.9, fill: '#ffe9a8' }),
          h('circle', { key: 's2', cx: size * 0.16, cy: height * 0.2, r: unit * 0.6, fill: '#ffe9a8' }),
        )
      }
      return h(
        'svg',
        {
          viewBox: `0 0 ${size} ${height}`,
          width: size,
          height,
          role: 'img',
          'aria-hidden': true,
          style: { display: 'block', transform: flip ? 'scaleX(-1)' : undefined },
        },
        cells,
        extras,
      )
    }

    function Pill({ children, tone = 'default', title }) {
      return h('span', { className: `mt-pill mt-pill-${tone}`, title }, children)
    }

    function Bar({ value, max = 100, tone = 'brand', height = 6, label }) {
      const width = `${clamp((value / max) * 100, 0, 100)}%`
      return h(
        'div',
        { className: 'mt-bar', style: { height } },
        h('div', { className: `mt-bar-fill mt-bar-${tone}`, style: { width } }),
        label ? h('span', { className: 'mt-bar-label' }, label) : null,
      )
    }

    function Empty({ children }) {
      return h('div', { className: 'mt-empty' }, children)
    }

    function rarityTag(rarity) {
      const info = RARITY[rarity] || RARITY.N
      return h('span', { className: 'mt-rarity', style: { color: info.color, borderColor: info.color } }, info.label)
    }

    function DecorationGlyph({ id }) {
      if (id === 'hut') {
        return h(
          'svg',
          { viewBox: '0 0 24 20', width: 34, height: 28 },
          h('rect', { x: 4, y: 9, width: 16, height: 9, fill: '#c89a5e' }),
          h('path', { d: 'M2 9 L12 2 L22 9 Z', fill: '#8a5a3b' }),
          h('rect', { x: 10, y: 12, width: 4, height: 6, fill: '#6b4227' }),
        )
      }
      if (id === 'chair') {
        return h(
          'svg',
          { viewBox: '0 0 20 20', width: 24, height: 24 },
          h('rect', { x: 3, y: 7, width: 12, height: 3, fill: '#a9784a' }),
          h('rect', { x: 3, y: 2, width: 3, height: 6, fill: '#8a5a3b' }),
          h('rect', { x: 4, y: 10, width: 2, height: 7, fill: '#6b4227' }),
          h('rect', { x: 12, y: 10, width: 2, height: 7, fill: '#6b4227' }),
        )
      }
      if (id === 'chime') {
        return h(
          'svg',
          { viewBox: '0 0 18 22', width: 20, height: 24 },
          h('path', { d: 'M3 3 h12 l-2 6 h-8 z', fill: '#9fd7e8' }),
          h('path', { d: 'M9 9 v9', stroke: '#e6f4f8', strokeWidth: 1.2 }),
          h('circle', { cx: 9, cy: 19, r: 2, fill: '#e6f4f8' }),
        )
      }
      return h(
        'svg',
        { viewBox: '0 0 20 18', width: 22, height: 20 },
        h('rect', { x: 3, y: 8, width: 14, height: 8, fill: '#3a3f47' }),
        h('path', { d: 'M3 8 l-2 -4 h6 l2 4 z', fill: '#3a3f47' }),
        h('path', { d: 'M17 8 l2 -4 h-6 l-2 4 z', fill: '#3a3f47' }),
        h('circle', { cx: 8, cy: 11, r: 1.2, fill: '#ffd166' }),
        h('circle', { cx: 13, cy: 11, r: 1.2, fill: '#ffd166' }),
      )
    }

    const SCENE_DECOR_SLOTS = ['6%', '22%', '60%', '76%']

    function PondScene({ pond, phase, power, watching, bite, machine, decorations, reduceMotion, assets, floatArt }) {
      const artUrl = assets && assets.ponds.has(pond.id) ? assets.url('ponds', pond.id) : null
      const knownDecor = (decorations || []).filter((id) => assets && assets.items.has(id))
      const anchorFrom = (pond.anchor && pond.anchor.from) || [6, 104]
      const restSpot = (pond.anchor && pond.anchor.float) || [52, 60]
      const float = machine.float
      const floatUrl = assets && assets.items.has(floatArt || 'bobber') ? assets.url('items', floatArt || 'bobber') : null
      const charge =
        machine.phase === 'charging'
          ? h(
              'div',
              { className: 'mt-charge' },
              h('div', { className: 'mt-charge-track' }, h('div', { className: 'mt-charge-fill', style: { width: `${Math.round(power)}%` } })),
              h('div', { className: 'mt-charge-label' }, `力度 ${Math.round(power)}`),
            )
          : null

      if (artUrl) {
        const lineSag = machine.phase === 'casting' ? 2 : 8
        const lineControl = float
          ? {
              x: (anchorFrom[0] + float.x) / 2,
              y: (anchorFrom[1] + float.y) / 2 + lineSag,
            }
          : null
        return h(
          'div',
          { className: `mt-scene mt-scene-photo${bite && !reduceMotion ? ' mt-scene-bite' : ''}` },
          h('div', { className: 'mt-scene-art', style: { backgroundImage: `url("${artUrl}")` } }),
          h('div', { className: 'mt-scene-vignette' }),
          knownDecor.length > 0
            ? h(
                'div',
                { className: 'mt-scene-decor' },
                knownDecor.map((id, index) =>
                  h(
                    'span',
                    {
                      key: id,
                      className: 'mt-scene-decor-item',
                      style: { left: SCENE_DECOR_SLOTS[index % SCENE_DECOR_SLOTS.length] },
                    },
                    h(ItemIcon, { id, assets, size: 34 }),
                  ),
                ),
              )
            : null,
          machine.phase === 'charging'
            ? h('span', {
                className: 'mt-target-ring',
                style: { left: `${restSpot[0]}%`, top: `${restSpot[1]}%` },
              })
            : null,
          float && lineControl
            ? h(
                'svg',
                { className: 'mt-fishing-line', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true },
                h('path', {
                  d: `M ${anchorFrom[0]} ${anchorFrom[1]} Q ${lineControl.x} ${lineControl.y} ${float.x} ${float.y}`,
                }),
              )
            : null,
          float && floatUrl
            ? h('img', {
                className: 'mt-float-sprite',
                src: floatUrl,
                alt: '',
                draggable: false,
                style: { left: `${float.x}%`, top: `${float.y}%` },
              })
            : null,
          machine.splash
            ? h(
                'span',
                { className: 'mt-splash', style: { left: `${restSpot[0]}%`, top: `${restSpot[1]}%` } },
                h('i', null),
                h('i', null),
                h('i', null),
              )
            : null,
          bite && float
            ? h('span', { className: 'mt-bite-bubble', style: { left: `${float.x}%`, top: `${float.y}%` } }, '咬钩！')
            : null,
          charge,
        )
      }

      const nightish = phase === 'night' || phase === 'dusk'
      const waterTop = pond.palette.water[0]
      const waterBottom = pond.palette.water[1]
      const skyTop = nightish ? '#101a2b' : pond.palette.sky[0]
      const skyBottom = nightish ? '#1d3250' : pond.palette.sky[1]
      const shadows = []
      for (let index = 0; index < 3; index += 1) {
        shadows.push(
          h('div', {
            key: `s${index}`,
            className: reduceMotion ? 'mt-shadow mt-shadow-static' : 'mt-shadow',
            style: {
              top: `${34 + index * 13}%`,
              width: `${44 + index * 16}px`,
              animationDelay: `${index * 1.7}s`,
              animationDuration: `${13 + index * 4}s`,
            },
          }),
        )
      }
      const floatVisible = watching || bite
      return h(
        'div',
        { className: `mt-scene${bite ? ' mt-scene-bite' : ''}` },
        h('div', { className: 'mt-sky', style: { backgroundImage: `linear-gradient(180deg, ${skyTop}, ${skyBottom})` } }),
        h('div', { className: 'mt-sun' }),
        h('div', { className: 'mt-hills' }),
        h(
          'div',
          {
            className: 'mt-water',
            style: {
              backgroundImage: `linear-gradient(180deg, ${waterTop}, ${waterBottom})`,
              height: nightish ? '58%' : '54%',
            },
          },
          h('div', { className: 'mt-ripple mt-ripple-a' }),
          h('div', { className: 'mt-ripple mt-ripple-b' }),
          shadows,
        ),
        h('div', { className: 'mt-bank', style: { background: pond.palette.bank } }),
        h(
          'div',
          { className: 'mt-decor' },
          (decorations || []).map((id) => h('div', { key: id, className: `mt-decor-item mt-decor-${id}` }, h(DecorationGlyph, { id }))),
        ),
        floatVisible
          ? h(
              'div',
              { className: `mt-float${bite ? ' mt-float-bite' : ''}${machine.nibbling ? ' mt-float-nibble' : ''}` },
              h('div', { className: 'mt-line' }),
              h('div', { className: 'mt-float-body' }),
              h('div', { className: 'mt-float-tip' }),
            )
          : null,
        bite ? h('div', { className: 'mt-bite-tag' }, '咬钩！') : null,
        charge,
      )
    }

    function CatchCard({ card, t, onAction, assets }) {
      if (!card) return null
      const fish = card.fish
      const rarity = RARITY[fish.rarity] || RARITY.N
      const qualityTag =
        card.quality === 'shiny' ? t('shinyTag') : card.quality === 'fat' ? t('fatTag') : t('normalTag')
      return h(
        'div',
        { className: 'mt-overlay', role: 'dialog', 'aria-modal': 'true' },
        h(
          'div',
          { className: 'mt-card', style: { borderColor: rarity.color, boxShadow: `0 18px 48px ${rarity.glow}` } },
          h('div', { className: 'mt-card-top' }, rarityTag(fish.rarity), h('span', { className: 'mt-card-title' }, fish.name)),
          h('div', { className: 'mt-card-art' }, h(FishImage, { fish, size: 164, assets, shiny: card.quality === 'shiny' })),
          h('div', { className: 'mt-card-meta' },
            h(Pill, { tone: 'muted' }, `${card.size} cm`),
            h(Pill, { tone: 'muted' }, qualityTag),
            card.isNew ? h(Pill, { tone: 'good' }, t('newEntry')) : null,
            card.record ? h(Pill, { tone: 'warn' }, t('newRecord')) : null,
            card.boss ? h(Pill, { tone: 'bad' }, 'BOSS') : null,
          ),
          h('p', { className: 'mt-card-desc' }, fish.description),
          h(
            'div',
            { className: 'mt-card-price' },
            card.price > 0 ? `${t('sell')} ${card.price} ${t('coins')}` : t('notSellable'),
          ),
          h(
            'div',
            { className: 'mt-card-actions' },
            h('button', { type: 'button', className: 'mt-btn mt-btn-primary', onClick: () => onAction('keep') }, t('keep')),
            h('button', {
              type: 'button',
              className: 'mt-btn',
              disabled: card.price <= 0,
              onClick: () => onAction('sell'),
            }, t('sell')),
            h('button', { type: 'button', className: 'mt-btn', onClick: () => onAction('release') }, t('release')),
          ),
        ),
      )
    }

    function PondView({ game, metrics, t, toast, assets }) {
      const save = game.save
      const storm = Boolean(metrics.metrics?.storm)
      const reasoningMs = metrics.metrics?.reasoningMsToday || 0
      const todayTokens = metrics.metrics?.todayEffectiveTokens || 0
      // 深潜 = Agent 今天想得够不够久；provider 不报 reasoning 时退化为今天的有效 Token 量。
      const deepDive = clamp(
        reasoningMs > 0 ? reasoningMs / (10 * 60 * 1000) : todayTokens / 300000,
        0,
        1,
      )
      const [pondId, setPondId] = useState(() => {
        const preferred = save.settings.autoPond
        if (preferred && save.ponds.includes(preferred)) return preferred
        const unlocked = PONDS.filter((p) => save.ponds.includes(p.id))
        return (unlocked[unlocked.length - 1] || PONDS[0]).id
      })
      const choosePond = useCallback(
        (id) => {
          setPondId(id)
          game.act((draft) => {
            draft.settings.autoPond = id
            return true
          })
        },
        [game],
      )
      const pond = POND_BY_ID[pondId] || PONDS[0]
      const machine = usePondMachine({ game, metrics, pond, weather: { storm }, deepDive, onToast: toast })
      const now = new Date()
      const phase = phaseOfHour(now.getHours())
      const locked = !save.ponds.includes(pondId)
      const missing = unlockRequirementMissing(save, pond, now)
      const dayStats = save.stats.dayStats
      const todayBest = (save.basket || [])
        .filter((entry) => dayKey(new Date(entry.at)) === dayKey(now))
        .sort((a, b) => b.size - a.size)[0]
      const decor = save.decor
      const rodTolerance = (RODS.find((entry) => entry.id === save.gear.rod) || RODS[0]).tolerance
      const breakAt = 100 + (LINES.find((entry) => entry.id === save.gear.line) || LINES[0]).breakAt
      const bandLow = (18 / breakAt) * 100
      const bandHigh = Math.min(breakAt - 6, 74 + (rodTolerance - 1) * 34)
      const bandWidth = ((bandHigh - 18) / breakAt) * 100

      const label = (() => {
        switch (machine.phase) {
          case 'charging':
            return `${t('releaseToCast')} · ${Math.round(machine.power)}`
          case 'casting':
            return t('castingLabel')
          case 'waiting':
            return t('waitingBite')
          case 'bite':
            return t('tapNow')
          case 'reel':
            return machine.holding ? t('reeling') : t('holdToReel')
          case 'card':
            return t('settling')
          default:
            return locked ? t('lockedPond') : `${t('holdToCast')} · ${pond.cost} ${t('points')}`
        }
      })()

      return h(
        'div',
        { className: 'mt-pond' },
        h(
          'div',
          { className: 'mt-pond-list' },
          PONDS.map((entry) => {
            const entryLocked = !save.ponds.includes(entry.id)
            return h(
              'button',
              {
                key: entry.id,
                type: 'button',
                className: `mt-pond-chip${entry.id === pondId ? ' is-active' : ''}${entryLocked ? ' is-locked' : ''}`,
                onClick: () => {
                  if (machine.phase !== 'idle') return
                  choosePond(entry.id)
                },
                title: entry.tagline,
              },
              entry.name,
              h('span', { className: 'mt-pond-cost' }, entryLocked ? t('locked') : `${entry.cost}`),
            )
          }),
        ),
        h(PondScene, {
          pond,
          phase,
          power: machine.power,
          watching: machine.phase === 'waiting' || machine.phase === 'bite',
          bite: machine.phase === 'bite',
          machine,
          decorations: decor,
          reduceMotion: save.settings.reduceMotion,
          assets,
          floatArt: save.gear.line === 'glow' ? 'glow' : 'bobber',
        }),
        h(
          'div',
          { className: 'mt-pond-status' },
          h('span', { className: 'mt-pond-tagline' }, pond.tagline),
          h(
            'span',
            { className: 'mt-pond-weather' },
            h('i', { className: `mt-dot${storm ? ' mt-dot-bad' : ' mt-dot-good'}` }),
            `${storm ? t('storm') : t('sunny')} · ${PHASE_LABEL[phase]} · ${t('deepDive')} ${Math.round(deepDive * 100)}%`,
          ),
        ),
        machine.phase === 'reel'
          ? h(
              'div',
              { className: 'mt-reel' },
              h(
                'div',
                { className: 'mt-reel-row' },
                h('span', { className: 'mt-reel-label' }, `${t('tension')} ${Math.round(machine.tension)}`),
                h('span', { className: 'mt-reel-label' }, `${t('progress')} ${Math.round(machine.progress)}%`),
              ),
              h(
                'div',
                { className: 'mt-tension' },
                h('div', { className: 'mt-tension-band', style: { left: `${bandLow}%`, width: `${bandWidth}%` } }),
                h('div', {
                  className: 'mt-tension-mark',
                  style: { left: `${clamp((machine.tension / breakAt) * 100, 0, 100)}%` },
                }),
              ),
              h(Bar, { value: machine.progress, max: 100, tone: 'good' }),
              machine.phaseCount > 1
                ? h('div', { className: 'mt-reel-round' }, `${t('round')} ${machine.phaseIndex} / ${machine.phaseCount}`)
                : null,
              h('div', { className: 'mt-reel-hint' }, t('reelHint')),
            )
          : null,
        h(
          'div',
          { className: 'mt-pond-actions' },
          h(
            'button',
            {
              type: 'button',
              className: `mt-cast${machine.phase === 'bite' ? ' is-hot' : ''}${machine.phase === 'reel' && machine.holding ? ' is-holding' : ''}`,
              disabled: locked || machine.phase === 'card',
              onPointerDown: (event) => {
                event.preventDefault()
                machine.primaryDown()
              },
              onPointerUp: (event) => {
                event.preventDefault()
                machine.primaryUp()
              },
              onPointerLeave: () => machine.primaryUp(),
              onContextMenu: (event) => event.preventDefault(),
            },
            label,
          ),
          h(
            'label',
            { className: 'mt-auto' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(save.settings.auto),
              onChange: (event) =>
                game.act((draft) => setAutoFishing(draft, event.target.checked)),
            }),
            h('span', null, t('autoMode')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mt-btn',
              onClick: () => {
                game.act((draft) => setAutoFishing(draft, !draft.settings.auto))
              },
            },
            save.settings.auto ? t('autoStop') : t('autoStart'),
          ),
        ),
        machine.message ? h('div', { className: 'mt-message' }, machine.message) : null,
        locked
          ? h(
              'div',
              { className: 'mt-unlock' },
              h('div', { className: 'mt-unlock-title' }, `${pond.name} · ${t('lockedPond')}`),
              h('div', { className: 'mt-unlock-need' }, missing.length > 0 ? missing.join(' · ') : t('ready')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mt-btn mt-btn-primary',
                  disabled: missing.length > 0,
                  onClick: () => {
                    const ok = game.act((draft) => {
                      if (unlockRequirementMissing(draft, pond, new Date()).length > 0) return false
                      draft.coins -= pond.unlock.coins
                      draft.stats.coinsSpent += pond.unlock.coins
                      draft.ponds.push(pond.id)
                      pushFeed(draft, `解锁了新的鱼塘：${pond.name}`)
                      return true
                    })
                    if (ok) toast(`${t('unlockedToast')} ${pond.name}`)
                  },
                },
                `${t('unlockFor')} ${fmtInt(pond.unlock.coins || 0)} ${t('coins')}`,
              ),
            )
          : null,
        h(
          'div',
          { className: 'mt-stats-row' },
          h('div', { className: 'mt-stat' }, h('span', null, t('todayCast')), h('strong', null, dayStats.casts)),
          h('div', { className: 'mt-stat' }, h('span', null, t('todayCatch')), h('strong', null, dayStats.catches)),
          h(
            'div',
            { className: 'mt-stat' },
            h('span', null, t('todayBest')),
            h('strong', null, todayBest ? `${todayBest.size} cm` : '—'),
          ),
          h(
            'div',
            { className: 'mt-stat' },
            h('span', null, t('pondFavor')),
            h('strong', null, save.favor[pondId] || 0),
          ),
        ),
        h(
          'div',
          { className: 'mt-note' },
          t('privacyNote'),
        ),
        h(CatchCard, { card: machine.card, t, onAction: machine.settle, assets }),
      )
    }

    function CollectionView({ game, t, assets }) {
      const save = game.save
      const [filter, setFilter] = useState('all')
      const [detail, setDetail] = useState(null)
      const discovered = Object.keys(save.collection).length
      const shownPonds = filter === 'all' ? PONDS : PONDS.filter((pond) => pond.id === filter)
      return h(
        'div',
        { className: 'mt-section' },
        h(
          'div',
          { className: 'mt-section-head' },
          h('h2', { className: 'mt-section-title' }, t('tabCollection')),
          h('span', { className: 'mt-section-sub' }, `${t('collectionProgress')} ${discovered} / ${FISH.length}`),
        ),
        h(Bar, { value: discovered, max: FISH.length, tone: 'brand', height: 8 }),
        h(
          'div',
          { className: 'mt-filters' },
          h(
            'button',
            {
              type: 'button',
              className: `mt-filter${filter === 'all' ? ' is-active' : ''}`,
              onClick: () => setFilter('all'),
            },
            t('allPonds'),
          ),
          PONDS.map((pond) => {
            const total = FISH.filter((fish) => fish.pond === pond.id).length
            const got = FISH.filter((fish) => fish.pond === pond.id && save.collection[fish.id]).length
            return h(
              'button',
              {
                key: pond.id,
                type: 'button',
                className: `mt-filter${filter === pond.id ? ' is-active' : ''}`,
                onClick: () => setFilter(pond.id),
              },
              `${pond.name} ${got}/${total}`,
            )
          }),
        ),
        shownPonds.map((pond) => {
          const fishes = FISH.filter((fish) => fish.pond === pond.id)
          const got = fishes.filter((fish) => save.collection[fish.id]).length
          return h(
            'section',
            { key: pond.id, className: 'mt-group' },
            h('div', { className: 'mt-group-head' },
              h('div', { className: 'mt-group-titlewrap' },
                assets && assets.ponds.has(pond.id)
                  ? h('img', { className: 'mt-pond-thumb', src: assets.url('ponds', pond.id), alt: '', loading: 'lazy', decoding: 'async' })
                  : null,
                h('strong', null, pond.name),
              ),
              h('span', null, `${got} / ${fishes.length}`),
            ),
            h(
              'div',
              { className: 'mt-grid' },
              fishes.map((fish) => {
                const entry = save.collection[fish.id]
                const locked = !entry
                return h(
                  'button',
                  {
                    key: fish.id,
                    type: 'button',
                    className: `mt-fishcard${locked ? ' is-locked' : ''}${fish.boss ? ' is-boss' : ''}`,
                    onClick: () => setDetail(fish),
                    style: locked ? undefined : { borderColor: `${RARITY[fish.rarity].color}55` },
                  },
                  h('div', { className: 'mt-fishcard-art' }, h(FishImage, { fish, size: 72, assets, locked, shiny: Boolean(entry?.shiny) })),
                  h('div', { className: 'mt-fishcard-name' }, locked ? '???' : fish.name),
                  h('div', { className: 'mt-fishcard-meta' }, rarityTag(fish.rarity), entry ? h('span', null, `${entry.maxSize} cm`) : null),
                  locked ? h('div', { className: 'mt-fishcard-hint' }, fish.hint) : null,
                )
              }),
            ),
          )
        }),
        detail
          ? h(
              'div',
              { className: 'mt-overlay', role: 'dialog', 'aria-modal': 'true', onClick: () => setDetail(null) },
              h(
                'div',
                { className: 'mt-card', style: { borderColor: RARITY[detail.rarity].color }, onClick: (event) => event.stopPropagation() },
                h('div', { className: 'mt-card-top' }, rarityTag(detail.rarity), h('span', { className: 'mt-card-title' }, save.collection[detail.id] ? detail.name : '???')),
                h('div', { className: 'mt-card-art' }, h(FishImage, { fish: detail, size: 152, assets, locked: !save.collection[detail.id], shiny: Boolean(save.collection[detail.id]?.shiny) })),
                h('div', { className: 'mt-card-meta' },
                  h(Pill, { tone: 'muted' }, `${POND_BY_ID[detail.pond].name} · ${habitatText(detail)}`),
                  save.collection[detail.id] ? h(Pill, { tone: 'muted' }, `${t('maxSizeRecord')} ${save.collection[detail.id].maxSize} cm`) : null,
                  save.collection[detail.id] ? h(Pill, { tone: 'muted' }, `${t('caughtCount')} ${save.collection[detail.id].count}`) : null,
                ),
                h('p', { className: 'mt-card-desc' }, save.collection[detail.id] ? detail.description : detail.hint),
                save.collection[detail.id]
                  ? h('div', { className: 'mt-card-price' }, `${t('firstCaught')} ${timeToClock(save.collection[detail.id].firstAt)}`)
                  : h('div', { className: 'mt-card-price' }, t('lockedHint')),
                h('div', { className: 'mt-card-actions' }, h('button', { type: 'button', className: 'mt-btn mt-btn-primary', onClick: () => setDetail(null) }, t('close'))),
              ),
            )
          : null,
      )
    }

    function ShopView({ game, t, toast, assets }) {
      const save = game.save
      const has = (id) => Boolean(save.owned[id])
      const spend = (price, mutate) =>
        game.act((draft) => {
          if (draft.coins < price) return false
          draft.coins -= price
          draft.stats.coinsSpent += price
          mutate(draft)
          return true
        })

      const gearRow = (item, kind) => {
        const owned = has(item.id) || item.price === 0
        const equipped = save.gear[kind] === item.id
        return h(
          'div',
          { key: item.id, className: 'mt-row' },
          h(ItemIcon, { id: item.art || item.id, assets, size: 36 }),
          h('div', { className: 'mt-row-main' },
            h('div', { className: 'mt-row-title' }, item.name, equipped ? h(Pill, { tone: 'good' }, t('equipped')) : null),
            h('div', { className: 'mt-row-desc' }, item.desc),
          ),
          h('div', { className: 'mt-row-side' },
            h('span', { className: 'mt-price' }, item.price === 0 ? t('free') : `${fmtInt(item.price)} ${t('coins')}`),
            owned
              ? h('button', {
                  type: 'button',
                  className: 'mt-btn',
                  disabled: equipped,
                  onClick: () => game.act((draft) => { draft.gear[kind] = item.id; return true }),
                }, equipped ? t('equipped') : t('equip'))
              : h('button', {
                  type: 'button',
                  className: 'mt-btn mt-btn-primary',
                  disabled: save.coins < item.price,
                  onClick: () => {
                    const ok = spend(item.price, (draft) => {
                      draft.owned[item.id] = true
                      draft.gear[kind] = item.id
                      pushFeed(draft, `购买了 ${item.name}`)
                    })
                    toast(ok ? `${t('bought')} ${item.name}` : t('noCoins'))
                  },
                }, t('buy')),
          ),
        )
      }

      return h(
        'div',
        { className: 'mt-section' },
        h('div', { className: 'mt-section-head' },
          h('h2', { className: 'mt-section-title' }, t('tabShop')),
          h('span', { className: 'mt-section-sub' }, `${fmtInt(save.coins)} ${t('coins')}`),
        ),
        h('h3', { className: 'mt-group-title' }, t('shopRod')),
        h('div', { className: 'mt-list' }, RODS.map((item) => gearRow(item, 'rod'))),
        h('h3', { className: 'mt-group-title' }, t('shopLine')),
        h('div', { className: 'mt-list' }, LINES.map((item) => gearRow(item, 'line'))),
        h('h3', { className: 'mt-group-title' }, t('shopBait')),
        h(
          'div',
          { className: 'mt-list' },
          BAITS.map((item) => {
            const count = item.id === 'bread' ? '∞' : save.inventory[item.id] || 0
            const equipped = save.gear.bait === item.id
            return h(
              'div',
              { key: item.id, className: 'mt-row' },
              h(ItemIcon, { id: item.id, assets, size: 36 }),
              h('div', { className: 'mt-row-main' },
                h('div', { className: 'mt-row-title' }, item.name, equipped ? h(Pill, { tone: 'good' }, t('equipped')) : null, h(Pill, { tone: 'muted' }, `× ${count}`)),
                h('div', { className: 'mt-row-desc' }, item.desc),
              ),
              h('div', { className: 'mt-row-side' },
                h('span', { className: 'mt-price' }, `${fmtInt(item.price)} / ${item.pack}`),
                h('button', {
                  type: 'button',
                  className: 'mt-btn',
                  disabled: save.coins < item.price || item.price === 0,
                  onClick: () => {
                    const ok = spend(item.price, (draft) => {
                      draft.inventory[item.id] = (draft.inventory[item.id] || 0) + item.pack
                    })
                    toast(ok ? `${t('bought')} ${item.name} ×${item.pack}` : t('noCoins'))
                  },
                }, t('buy')),
                h('button', {
                  type: 'button',
                  className: 'mt-btn',
                  disabled: equipped || (item.id !== 'bread' && (save.inventory[item.id] || 0) <= 0),
                  onClick: () => game.act((draft) => { draft.gear.bait = item.id; return true }),
                }, equipped ? t('equipped') : t('equip')),
              ),
            )
          }),
        ),
        h('h3', { className: 'mt-group-title' }, t('shopDecor')),
        h(
          'div',
          { className: 'mt-list' },
          DECOR.map((item) => {
            const owned = has(item.id)
            return h(
              'div',
              { key: item.id, className: 'mt-row' },
              h(ItemIcon, { id: item.id, assets, size: 36 }),
              h('div', { className: 'mt-row-main' },
                h('div', { className: 'mt-row-title' }, item.name, owned ? h(Pill, { tone: 'good' }, t('owned')) : null),
                h('div', { className: 'mt-row-desc' }, item.desc),
              ),
              h('div', { className: 'mt-row-side' },
                h('span', { className: 'mt-price' }, `${fmtInt(item.price)} ${t('coins')}`),
                owned
                  ? h('button', {
                      type: 'button',
                      className: 'mt-btn',
                      onClick: () =>
                        game.act((draft) => {
                          draft.decor = draft.decor.includes(item.id)
                            ? draft.decor.filter((id) => id !== item.id)
                            : [...draft.decor, item.id]
                          return true
                        }),
                    }, save.decor.includes(item.id) ? t('hide') : t('show'))
                  : h('button', {
                      type: 'button',
                      className: 'mt-btn mt-btn-primary',
                      disabled: save.coins < item.price,
                      onClick: () => {
                        const ok = spend(item.price, (draft) => {
                          draft.owned[item.id] = true
                          if (!draft.decor.includes(item.id)) draft.decor.push(item.id)
                        })
                        toast(ok ? `${t('bought')} ${item.name}` : t('noCoins'))
                      },
                    }, t('buy')),
              ),
            )
          }),
        ),
      )
    }

    function BasketView({ game, t, toast, assets }) {
      const save = game.save
      const basket = save.basket
      const total = basket.reduce((sum, entry) => sum + entry.price, 0)
      const todayKey = dayKey()
      const todayBest = basket
        .filter((entry) => dayKey(new Date(entry.at)) === todayKey)
        .sort((a, b) => b.size - a.size)[0]
      return h(
        'div',
        { className: 'mt-section' },
        h('div', { className: 'mt-section-head' },
          h('h2', { className: 'mt-section-title' }, t('tabBasket')),
          h('span', { className: 'mt-section-sub' }, `${basket.length} / ${MAX_BASKET} · ${t('totalValue')} ${fmtInt(total)}`),
        ),
        h('div', { className: 'mt-inline-actions' },
          h('button', {
            type: 'button',
            className: 'mt-btn mt-btn-primary',
            disabled: basket.length === 0,
            onClick: () => {
              if (basket.length === 0) return
              const earnings = basket.reduce((sum, entry) => sum + (entry.price > 0 ? entry.price : 0), 0)
              game.act((draft) => {
                draft.basket = draft.basket.filter((entry) => entry.price <= 0)
                draft.coins += earnings
                draft.stats.coinsEarned += earnings
                draft.stats.sold += basket.length
                draft.stats.dayStats.sold += basket.length
                pushDiary(draft, `一次卖出 ${basket.length} 条鱼，+${earnings} 金币`)
                return true
              })
              toast(`${t('soldAll')} +${fmtInt(earnings)} ${t('coins')}`)
            },
          }, t('sellAll')),
          h('button', {
            type: 'button',
            className: 'mt-btn',
            disabled: basket.length === 0,
            onClick: () => {
              game.act((draft) => {
                draft.favor['newbie-creek'] = (draft.favor['newbie-creek'] || 0) + draft.basket.length
                draft.basket = draft.basket.filter((entry) => entry.price <= 0)
                return true
              })
              toast(t('releasedAll'))
            },
          }, t('releaseAll')),
        ),
        todayBest
          ? h('div', { className: 'mt-best' },
              h(FishImage, { fish: FISH_BY_ID[todayBest.fishId], size: 56, assets }),
              h('div', null,
                h('strong', null, `${t('todayBest')}：${FISH_BY_ID[todayBest.fishId]?.name || ''}`),
                h('div', { className: 'mt-row-desc' }, `${todayBest.size} cm · ${todayBest.price} ${t('coins')}`),
              ),
            )
          : null,
        basket.length === 0
          ? h(Empty, null, t('basketEmpty'))
          : h(
              'div',
              { className: 'mt-list' },
              basket.map((entry) => {
                const fish = FISH_BY_ID[entry.fishId]
                if (!fish) return null
                return h(
                  'div',
                  { key: entry.uid, className: 'mt-row' },
                  h('div', { className: 'mt-row-art' }, h(FishImage, { fish, size: 44, assets, shiny: entry.quality === 'shiny' })),
                  h('div', { className: 'mt-row-main' },
                    h('div', { className: 'mt-row-title' }, fish.name, rarityTag(fish.rarity),
                      entry.quality === 'shiny' ? h(Pill, { tone: 'warn' }, t('shinyTag')) : null,
                      entry.quality === 'fat' ? h(Pill, { tone: 'muted' }, t('fatTag')) : null,
                    ),
                    h('div', { className: 'mt-row-desc' }, `${entry.size} cm · ${timeToClock(entry.at)}`),
                  ),
                  h('div', { className: 'mt-row-side' },
                    h('span', { className: 'mt-price' }, entry.price > 0 ? `${entry.price} ${t('coins')}` : t('notSellable')),
                    h('button', {
                      type: 'button',
                      className: 'mt-btn',
                      disabled: entry.price <= 0,
                      onClick: () => {
                        game.act((draft) => {
                          draft.basket = draft.basket.filter((item) => item.uid !== entry.uid)
                          draft.coins += entry.price
                          draft.stats.coinsEarned += entry.price
                          draft.stats.sold += 1
                          draft.stats.dayStats.sold += 1
                          return true
                        })
                        toast(`+${entry.price} ${t('coins')}`)
                      },
                    }, t('sell')),
                    h('button', {
                      type: 'button',
                      className: 'mt-btn',
                      onClick: () => {
                        game.act((draft) => {
                          draft.basket = draft.basket.filter((item) => item.uid !== entry.uid)
                          draft.favor[fish.pond] = (draft.favor[fish.pond] || 0) + 1
                          return true
                        })
                        toast(t('releasedOne'))
                      },
                    }, t('release')),
                  ),
                )
              }),
            ),
      )
    }

    function QuestsView({ game, t, toast }) {
      const save = game.save
      const dayStats = save.stats.dayStats
      const items = (save.quests.items || []).map((quest) => ({
        ...QUEST_POOL.find((entry) => entry.id === quest.id),
        claimed: quest.claimed,
        progress: questProgress(QUEST_POOL.find((entry) => entry.id === quest.id), dayStats),
      }))
      return h(
        'div',
        { className: 'mt-section' },
        h('div', { className: 'mt-section-head' },
          h('h2', { className: 'mt-section-title' }, t('questsTitle')),
          h('span', { className: 'mt-section-sub' }, save.quests.day),
        ),
        h(
          'div',
          { className: 'mt-list' },
          items.map((quest) =>
            quest.text
              ? h(
                  'div',
                  { key: quest.id, className: `mt-row${quest.claimed ? ' is-done' : ''}` },
                  h('div', { className: 'mt-row-main' },
                    h('div', { className: 'mt-row-title' }, quest.text),
                    h(Bar, { value: Math.min(quest.progress, quest.target), max: quest.target, tone: quest.progress >= quest.target ? 'good' : 'brand' }),
                    h('div', { className: 'mt-row-desc' }, `${Math.min(quest.progress, quest.target)} / ${quest.target} · ${quest.coins} ${t('coins')}`),
                  ),
                  h('div', { className: 'mt-row-side' },
                    h('button', {
                      type: 'button',
                      className: 'mt-btn mt-btn-primary',
                      disabled: quest.claimed || quest.progress < quest.target,
                      onClick: () => {
                        const ok = game.act((draft) => {
                          const target = draft.quests.items.find((entry) => entry.id === quest.id)
                          if (!target || target.claimed) return false
                          if (questProgress(quest, draft.stats.dayStats) < quest.target) return false
                          target.claimed = true
                          draft.coins += quest.coins
                          draft.stats.coinsEarned += quest.coins
                          pushFeed(draft, `完成委托：${quest.text}（+${quest.coins} 金币）`)
                          return true
                        })
                        toast(ok ? `${t('claimedToast')} +${quest.coins}` : '')
                      },
                    }, quest.claimed ? t('questClaimed') : t('questClaim')),
                  ),
                )
              : null,
          ),
        ),
        h('h3', { className: 'mt-group-title' }, t('achievementsTitle')),
        h(
          'div',
          { className: 'mt-ach' },
          ACHIEVEMENTS.map((achievement) => {
            const unlocked = Boolean(save.achievements[achievement.id])
            return h(
              'div',
              { key: achievement.id, className: `mt-ach-item${unlocked ? ' is-unlocked' : ''}` },
              h('strong', null, achievement.name),
              h('span', null, achievement.desc),
              unlocked ? h(Pill, { tone: 'good' }, t('owned')) : h(Pill, { tone: 'muted' }, '+ ' + achievement.coins),
            )
          }),
        ),
      )
    }

    function SettingsView({ game, t, metrics, toast }) {
      const save = game.save
      const [text, setText] = useState('')
      return h(
        'div',
        { className: 'mt-section' },
        h('div', { className: 'mt-section-head' },
          h('h2', { className: 'mt-section-title' }, t('tabSettings')),
          h('span', { className: 'mt-section-sub' }, `v1.0 · ${t('privacyShort')}`),
        ),
        h('div', { className: 'mt-list' },
          h('div', { className: 'mt-row' },
            h('div', { className: 'mt-row-main' },
              h('div', { className: 'mt-row-title' }, t('dataSource')),
              h('div', { className: 'mt-row-desc' }, metrics.status === 'online' ? `${t('dataOnline')} · ${t('lastSync')} ${metrics.at ? timeToClock(metrics.at) : '—'}` : t('dataOffline')),
            ),
            h('div', { className: 'mt-row-side' },
              h(Pill, { tone: metrics.status === 'online' ? 'good' : 'warn' }, metrics.status === 'online' ? t('online') : t('offline')),
            ),
          ),
          metrics.debug
            ? h('div', { className: 'mt-row' },
                h('div', { className: 'mt-row-main' },
                  h('div', { className: 'mt-row-title' }, t('hostPulse')),
                  h('div', { className: 'mt-row-desc' },
                    `${metrics.debug.lastEventAt ? timeToClock(metrics.debug.lastEventAt) : t('never')} · ${t('hostReattach')} ${metrics.debug.reattaches || 0}`,
                  ),
                ),
                h('div', { className: 'mt-row-side' },
                  h(Pill, { tone: 'muted' }, `#${metrics.debug.eventsSeen || 0}`),
                ),
              )
            : null,
          h('label', { className: 'mt-row' },
            h('div', { className: 'mt-row-main' },
              h('div', { className: 'mt-row-title' }, t('autoMode')),
              h('div', { className: 'mt-row-desc' }, t('autoHint')),
            ),
            h('div', { className: 'mt-row-side' },
              h('input', {
                type: 'checkbox',
                checked: Boolean(save.settings.auto),
                onChange: (event) => game.act((draft) => setAutoFishing(draft, event.target.checked)),
              }),
            ),
          ),
          h('label', { className: 'mt-row' },
            h('div', { className: 'mt-row-main' },
              h('div', { className: 'mt-row-title' }, t('reduceMotion')),
              h('div', { className: 'mt-row-desc' }, t('reduceMotionHint')),
            ),
            h('div', { className: 'mt-row-side' },
              h('input', {
                type: 'checkbox',
                checked: Boolean(save.settings.reduceMotion),
                onChange: (event) => game.act((draft) => { draft.settings.reduceMotion = event.target.checked; return true }),
              }),
            ),
          ),
          h('div', { className: 'mt-row' },
            h('div', { className: 'mt-row-main' },
              h('div', { className: 'mt-row-title' }, t('manual')),
              h('div', { className: 'mt-row-desc' }, t('manualHint')),
            ),
            h('div', { className: 'mt-row-side' },
              h('button', {
                type: 'button',
                className: 'mt-btn',
                disabled: metrics.status === 'online',
                onClick: () => {
                  game.act((draft) => {
                    draft.points += 5
                    draft.cheat.manual += 5
                    pushFeed(draft, '体验模式：手动结算 5 鱼饵积分')
                    return true
                  })
                  toast('+5')
                },
              }, '+5'),
            ),
          ),
        ),
        h('h3', { className: 'mt-group-title' }, t('saveTitle')),
        h('div', { className: 'mt-inline-actions' },
          h('button', {
            type: 'button',
            className: 'mt-btn',
            onClick: () => {
              const json = JSON.stringify(save)
              setText(json)
              try {
                navigator.clipboard.writeText(json)
                toast(t('copyToast'))
              } catch {
                toast(t('exportToast'))
              }
            },
          }, t('exportSave')),
          h('button', {
            type: 'button',
            className: 'mt-btn',
            onClick: () => setText(JSON.stringify(save, null, 2)),
          }, t('showSave')),
          h('button', {
            type: 'button',
            className: 'mt-btn',
            onClick: () => {
              const ok = game.act((draft) => {
                const fresh = defaultSave()
                Object.keys(draft).forEach((key) => delete draft[key])
                Object.assign(draft, fresh)
                pushFeed(draft, '存档已重置')
                return true
              })
              if (ok) toast(t('resetToast'))
            },
          }, t('resetSave')),
        ),
        h('textarea', {
          className: 'mt-textarea',
          value: text,
          onChange: (event) => setText(event.target.value),
          placeholder: t('importHint'),
          spellCheck: false,
        }),
        h('div', { className: 'mt-inline-actions' },
          h('button', {
            type: 'button',
            className: 'mt-btn mt-btn-primary',
            disabled: text.trim() === '',
            onClick: () => {
              try {
                const raw = JSON.parse(text)
                localStorage.setItem(SAVE_KEY, JSON.stringify(raw))
                toast(t('importedToast'))
                window.location.reload()
              } catch {
                toast(t('badSave'))
              }
            },
          }, t('doImport')),
        ),
        h('p', { className: 'mt-note' }, t('privacyNote')),
      )
    }

    function useToast() {
      const [toast, setToast] = useState(null)
      const timer = useRef(0)
      const push = useCallback((text) => {
        if (!text) return
        setToast({ text, id: Date.now() })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setToast(null), 2600)
      }, [])
      useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
      return [toast, push]
    }

    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('[moyutang] pond panel crashed', error)
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            { className: 'mt-root' },
            h('style', { dangerouslySetInnerHTML: { __html: STYLE } }),
            h('div', { className: 'mt-section', style: { padding: '28px 20px' } },
              h('h2', { className: 'mt-section-title' }, '摸鱼塘加载失败'),
              h('p', { className: 'mt-note' }, String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)),
              h('button', {
                type: 'button',
                className: 'mt-btn mt-btn-primary',
                onClick: () => this.setState({ error: null }),
              }, '重试'),
            ),
          )
        }
        return this.props.children
      }
    }

    function MoyutangPanel() {
      const runtime = useRuntime()
      const t = runtime.t
      const game = useGame()
      const metrics = useMetrics()
      const assets = useAssets()
      const [tab, setTab] = useState('pond')
      const [toast, pushToast] = useToast()
      const save = game.save

      const multiplier = streakMultiplier(save.credit.streak)
      const tabs = [
        ['pond', t('tabPond')],
        ['collection', t('tabCollection')],
        ['shop', t('tabShop')],
        ['basket', t('tabBasket')],
        ['quests', t('tabQuest')],
        ['settings', t('tabSettings')],
      ]

      const header = h(
        'header',
        { className: 'mt-header' },
        h('div', { className: 'mt-headline' },
          h('div', { className: 'mt-brand' }, h(WaterMark, null), h('span', { className: 'mt-title' }, t('title'))),
          h('span', { className: 'mt-sub' }, t('subtitle')),
        ),
        h('div', { className: 'mt-wallet' },
          h(Pill, { tone: 'brand', title: t('pointsHint') }, `${t('points')} ${fmt(save.points)}`),
          h(Pill, { tone: 'warn' }, `${t('coins')} ${fmtInt(save.coins)}`),
          h('div', { className: 'mt-cap' },
            h('span', { className: 'mt-cap-label' }, `${t('today')} +${fmt(save.credit.creditedToday || 0)}`),
            h(Bar, {
              value: Math.min(save.credit.pointsToday || 0, 300),
              max: 300,
              tone: (save.credit.pointsToday || 0) > 300 ? 'warn' : 'brand',
              height: 5,
            }),
            (save.credit.pointsToday || 0) > 300 ? h('span', { className: 'mt-cap-note' }, t('capReached')) : null,
          ),
          h(Pill, { tone: 'muted' }, `${t('streak')} ${save.credit.streak} × ${multiplier.toFixed(2)}`),
        ),
      )

      const body = (() => {
        if (tab === 'pond') return h(PondView, { game, metrics, t, toast: pushToast, assets })
        if (tab === 'collection') return h(CollectionView, { game, t, assets })
        if (tab === 'shop') return h(ShopView, { game, t, toast: pushToast, assets })
        if (tab === 'basket') return h(BasketView, { game, t, toast: pushToast, assets })
        if (tab === 'quests') return h(QuestsView, { game, t, toast: pushToast })
        return h(SettingsView, { game, t, metrics, toast: pushToast })
      })()

      return h(
        'div',
        { className: 'mt-root' },
        h('style', { dangerouslySetInnerHTML: { __html: STYLE } }),
        header,
        metrics.status === 'offline'
          ? h('div', { className: 'mt-banner' }, t('offlineBanner'))
          : null,
        h(
          'nav',
          { className: 'mt-tabs' },
          tabs.map(([id, label]) =>
            h(
              'button',
              {
                key: id,
                type: 'button',
                className: `mt-tab${tab === id ? ' is-active' : ''}`,
                'aria-current': tab === id ? 'page' : undefined,
                onClick: () => setTab(id),
              },
              label,
            ),
          ),
        ),
        h('div', { className: 'mt-scroll' }, body),
        toast ? h('div', { className: 'mt-toast', role: 'status' }, toast.text) : null,
      )
    }

    /* ------------------------------------------------------------------ *
     * 6.5 对话底部的挂机条：和 token 统计并排，勾上就一直在后台钓
     * ------------------------------------------------------------------ */

    const DOCK_STYLE = `
.mt-dock{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:1px 2px 5px;
  font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.mt-dock-toggle{display:inline-flex;align-items:center;gap:6px;padding:2px 9px 2px 6px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font:inherit}
.mt-dock-toggle:hover{background:var(--dsw-alias-bg-layer-2)}
.mt-dock-toggle.is-on{border-color:var(--dsw-alias-state-success-primary)}
.mt-dock-check{width:12px;height:12px;border-radius:3px;border:1px solid var(--dsw-alias-border-l2);
  display:inline-flex;align-items:center;justify-content:center;font-size:9px;line-height:1;
  color:var(--dsw-alias-bg-base);flex:0 0 auto}
.mt-dock-toggle.is-on .mt-dock-check{background:var(--dsw-alias-state-success-primary);
  border-color:var(--dsw-alias-state-success-primary)}
.mt-dock-live{display:inline-flex;align-items:center;color:var(--dsw-alias-state-success-primary)}
.mt-dock-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);
  display:inline-block;margin-right:6px;animation:mt-dock-pulse 1.6s ease-in-out infinite}
.mt-dock-points{font-variant-numeric:tabular-nums}
.mt-dock-open{border:none;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;
  font:inherit;padding:1px 3px;text-decoration:underline;text-underline-offset:2px}
@keyframes mt-dock-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.mt-dock-dot{animation:none}}
`

    function AutoDock() {
      const runtime = useRuntime()
      const t = runtime.t
      const game = useGame()
      const metrics = useMetrics()
      useAutoFishing()
      const save = game.save
      const auto = Boolean(save.settings.auto)
      const pond = POND_BY_ID[save.settings.autoPond] || PONDS[0]
      const catches = save.auto?.catches || 0
      const misses = save.auto?.misses || 0
      const points = fmt(save.points)
      const openPond = () => {
        try {
          runtime.layout?.selectPanel?.('moyutang')
        } catch {}
      }
      return h(
        'div',
        { className: 'mt-dock' },
        h('style', { dangerouslySetInnerHTML: { __html: DOCK_STYLE } }),
        h(
          'button',
          {
            type: 'button',
            className: `mt-dock-toggle${auto ? ' is-on' : ''}`,
            'aria-pressed': auto,
            title: t('autoHint'),
            onClick: () => game.act((draft) => setAutoFishing(draft, !draft.settings.auto)),
          },
          h('span', { className: 'mt-dock-check', 'aria-hidden': true }, auto ? '✓' : ''),
          h('span', null, t('autoMode')),
        ),
        auto
          ? h(
              'span',
              { className: 'mt-dock-live' },
              h('i', { className: 'mt-dock-dot', 'aria-hidden': true }),
              `${t('autoRunning')} · ${pond.name} · ${t('autoCaught')} ${catches}${misses > 0 ? ` · ${t('autoMissed')} ${misses}` : ''}`,
            )
          : h('span', null, `${t('autoIdle')} · ${pond.name}`),
        h('span', { className: 'mt-dock-points' }, `${t('points')} ${points}`),
        metrics.status === 'offline' ? h('span', null, t('offline')) : null,
        h('button', { type: 'button', className: 'mt-dock-open', onClick: openPond }, t('openPond')),
      )
    }

    class DockBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('[moyutang] dock crashed', error)
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'mt-dock' }, h('style', { dangerouslySetInnerHTML: { __html: DOCK_STYLE } }), '摸鱼塘挂机条加载失败')
        }
        return this.props.children
      }
    }

    /* ------------------------------------------------------------------ *
     * 7. 样式与文案
     * ------------------------------------------------------------------ */

    const STYLE = `
.mt-root{position:relative;display:flex;flex-direction:column;flex:1 1 auto;height:100%;min-height:520px;min-width:0;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;overflow:hidden}
.mt-root *{box-sizing:border-box}
.mt-root button{font:inherit;color:var(--dsw-alias-label-primary)}
.mt-root img{max-width:100%}
.mt-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mt-headline{display:flex;align-items:baseline;gap:10px;min-width:0}
.mt-brand{display:inline-flex;align-items:center;gap:8px}
.mt-title{font-size:15px;font-weight:600;letter-spacing:.02em}
.mt-sub{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mt-wallet{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mt-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:12px;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-pill-brand{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.mt-pill-warn{color:var(--dsw-alias-state-warn-primary)}
.mt-pill-good{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.mt-pill-bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.mt-pill-muted{color:var(--dsw-alias-label-secondary)}
.mt-cap{display:flex;flex-direction:column;gap:3px;min-width:104px}
.mt-cap-label{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.mt-cap-note{font-size:10.5px;color:var(--dsw-alias-state-warn-primary);white-space:nowrap}
.mt-bar{position:relative;width:100%;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1)}
.mt-bar-fill{height:100%;border-radius:999px;transition:width .25s ease}
.mt-bar-brand{background:var(--dsw-alias-brand-primary)}
.mt-bar-good{background:var(--dsw-alias-state-success-primary)}
.mt-bar-warn{background:var(--dsw-alias-state-warn-primary)}
.mt-tabs{display:flex;flex-wrap:nowrap;gap:4px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);
  overflow-x:auto;overflow-y:hidden;max-width:100%;flex:0 0 auto}
.mt-tab{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:26px;
  padding:5px 12px;border-radius:8px;border:1px solid transparent;background:transparent;
  color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;font-size:12.5px;line-height:1.45}
.mt-root .mt-tab{color:var(--dsw-alias-label-secondary)}
.mt-root .mt-tab:hover{color:var(--dsw-alias-label-primary)}
.mt-root .mt-tab.is-active{color:var(--dsw-alias-label-primary)}
.mt-tab.is-active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-border-l2)}
.mt-scroll{flex:1 1 auto;min-height:0;min-width:0;overflow:auto;padding:16px 20px 40px}
.mt-banner{flex:0 0 auto;padding:7px 20px;font-size:12px;color:var(--dsw-alias-state-warn-primary);
  background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}
.mt-section{display:flex;flex-direction:column;gap:12px;max-width:920px;min-width:0}
.mt-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.mt-section-title{margin:0;font-size:14px;font-weight:600}
.mt-section-sub{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.mt-pond{display:flex;flex-direction:column;gap:12px;max-width:920px;min-width:0}
.mt-pond-list{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;min-width:0}
.mt-pond-chip{display:inline-flex;flex:0 0 auto;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);white-space:nowrap;font-size:12.5px}
.mt-pond-chip.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-2);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-1));font-weight:600}
.mt-pond-chip.is-locked{opacity:.55}
.mt-pond-cost{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.mt-scene{position:relative;width:100%;aspect-ratio:16/9;max-height:400px;border-radius:14px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1);user-select:none;touch-action:manipulation}
.mt-sky,.mt-water,.mt-bank,.mt-hills{position:absolute;left:0;right:0}
.mt-sky{top:0;bottom:38%}
.mt-hills{height:18%;bottom:50%;background:
  radial-gradient(62% 100% at 20% 100%,rgba(24,42,38,.22),transparent 72%),
  radial-gradient(52% 100% at 56% 100%,rgba(24,42,38,.28),transparent 72%),
  radial-gradient(70% 100% at 90% 100%,rgba(24,42,38,.18),transparent 74%)}
.mt-water{bottom:0;overflow:hidden}
.mt-water::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;
  background:rgba(255,255,255,.42);box-shadow:0 0 12px rgba(255,255,255,.35)}
.mt-water::after{content:'';position:absolute;left:0;right:0;top:3px;height:34px;
  background:linear-gradient(180deg,rgba(255,255,255,.22),transparent);pointer-events:none}
.mt-bank{bottom:0;height:11%;border-top:2px solid rgba(0,0,0,.16);opacity:.95}
.mt-scene::after{content:'';position:absolute;inset:0;border-radius:14px;pointer-events:none;
  box-shadow:inset 0 0 64px rgba(0,0,0,.22)}
.mt-sun{position:absolute;top:11%;right:11%;width:34px;height:34px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,248,214,.95),rgba(255,246,216,.35) 46%,rgba(255,246,216,0) 70%);
  filter:blur(.4px)}
.mt-ripple{position:absolute;left:0;right:0;height:70%;background:
  radial-gradient(92px 9px at 22% 26%,rgba(255,255,255,.34),transparent 72%),
  radial-gradient(138px 11px at 64% 54%,rgba(255,255,255,.26),transparent 72%),
  radial-gradient(74px 8px at 86% 22%,rgba(255,255,255,.22),transparent 72%);
  animation:mt-drift 11s ease-in-out infinite alternate}
.mt-ripple-b{opacity:.55;animation-duration:17s;animation-direction:alternate-reverse}
.mt-shadow{position:absolute;left:14%;height:13px;border-radius:60% 45% 55% 50%;
  background:radial-gradient(ellipse at 45% 50%,rgba(8,20,28,.42),rgba(8,20,28,0) 74%);
  animation:mt-swim linear infinite}
.mt-shadow-static{animation:none;left:38%}
.mt-float{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);}
.mt-line{position:absolute;left:50%;bottom:12px;width:1px;height:64px;background:rgba(255,255,255,.55);transform:translateX(-50%)}
.mt-float-body{width:3px;height:16px;background:#f4f1e8;margin:0 auto;border-radius:1px}
.mt-float-tip{width:9px;height:9px;border-radius:50%;background:#e2564d;margin:0 auto;
  box-shadow:0 0 0 2px rgba(244,241,232,.7)}
.mt-float{animation:mt-bob 2.4s ease-in-out infinite}
.mt-float-bite{animation:mt-dip .32s ease-in-out infinite}
.mt-float-nibble{animation:mt-nibble .22s ease-in-out 2}
.mt-bite-tag{position:absolute;top:10%;left:50%;transform:translateX(-50%);padding:3px 12px;border-radius:999px;
  background:#e2564d;color:#fff;font-size:12px;font-weight:600;animation:mt-pop .3s ease-out}
.mt-charge{position:absolute;left:12%;right:12%;bottom:9%;display:flex;flex-direction:column;gap:4px}
.mt-charge-track{height:8px;border-radius:999px;background:rgba(0,0,0,.35);overflow:hidden}
.mt-charge-fill{height:100%;background:linear-gradient(90deg,#ffd166,#f08a3c)}
.mt-charge-label{font-size:11px;color:#fff;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.mt-decor{position:absolute;bottom:2%;left:0;right:0;height:16%;pointer-events:none}
.mt-decor-item{position:absolute;bottom:0;opacity:.95}
.mt-decor-hut{left:5%}
.mt-decor-chair{left:26%}
.mt-decor-chime{right:8%}
.mt-decor-cat{right:24%}
.mt-scene-photo{background:#0d141b}
.mt-scene-art{position:absolute;inset:0;background-size:cover;background-position:center}
.mt-scene-vignette{position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(ellipse at 50% 42%,transparent 44%,rgba(6,12,18,.32) 100%),
  linear-gradient(180deg,rgba(0,0,0,.12),transparent 26%,transparent 72%,rgba(0,0,0,.26))}
.mt-scene-decor{position:absolute;left:0;right:0;bottom:1.5%;height:40px;pointer-events:none}
.mt-scene-decor-item{position:absolute;bottom:0;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5))}
.mt-fishing-line{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.mt-fishing-line path{fill:none;stroke:rgba(255,255,255,.72);stroke-width:1.2;vector-effect:non-scaling-stroke;
  stroke-linecap:round;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
.mt-float-sprite{position:absolute;width:20px;height:20px;transform:translate(-50%,-50%);pointer-events:none;
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));will-change:left,top}
.mt-target-ring{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
  border:2px dashed rgba(255,255,255,.9);pointer-events:none;animation:mt-target 1.5s ease-out infinite}
.mt-splash{position:absolute;width:0;height:0;pointer-events:none}
.mt-splash i{position:absolute;left:0;top:0;width:30px;height:12px;margin:-6px 0 0 -15px;border-radius:50%;
  border:2px solid rgba(255,255,255,.9);animation:mt-splash .8s ease-out forwards}
.mt-splash i:nth-child(2){animation-delay:.14s;border-color:rgba(200,240,255,.85)}
.mt-splash i:nth-child(3){animation-delay:.28s;border-color:rgba(255,255,255,.6)}
.mt-bite-bubble{position:absolute;transform:translate(-50%,-210%);padding:0 7px;border-radius:10px;
  background:#e2564d;color:#fff;font-size:13px;font-weight:700;line-height:20px;pointer-events:none;
  box-shadow:0 3px 10px rgba(0,0,0,.4);animation:mt-pop .16s ease-out}
.mt-scene-bite{animation:mt-shake .42s ease-in-out}
@keyframes mt-target{0%{transform:scale(.55);opacity:.95}70%{transform:scale(1.15);opacity:.35}100%{transform:scale(1.35);opacity:0}}
@keyframes mt-splash{0%{transform:scale(.25);opacity:.95}100%{transform:scale(1.9);opacity:0}}
@keyframes mt-shake{0%,100%{transform:translate(0,0)}18%{transform:translate(-3px,1px)}36%{transform:translate(3px,-1px)}
  54%{transform:translate(-2px,-2px)}72%{transform:translate(2px,2px)}}
.mt-bite-ring{position:absolute;left:50%;top:60%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;
  border:2px solid rgba(255,255,255,.85);box-shadow:0 0 0 4px rgba(255,255,255,.12);
  animation:mt-ring 1.6s ease-out infinite;pointer-events:none}
.mt-bite-ring.is-nibble{animation-duration:.5s}
.mt-bite-ring.is-bite{border-color:#ffd166;box-shadow:0 0 0 7px rgba(226,86,77,.35);animation-duration:.6s}
.mt-pond-thumb{width:54px;height:30px;border-radius:6px;object-fit:cover;
  border:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.mt-shiny{position:relative;display:inline-flex;align-items:center;justify-content:center;
  filter:drop-shadow(0 0 7px rgba(255,214,120,.85))}
.mt-shiny-star{position:absolute;top:0;right:0;font-size:12px;line-height:1;color:#ffd166;
  text-shadow:0 0 6px rgba(255,209,102,.9);pointer-events:none}
.mt-group-titlewrap{display:flex;align-items:center;gap:8px;min-width:0}
.mt-pond-status{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;
  color:var(--dsw-alias-label-secondary)}
.mt-pond-weather{display:inline-flex;align-items:center;gap:6px}
.mt-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.mt-dot-good{background:var(--dsw-alias-state-success-primary)}
.mt-dot-bad{background:var(--dsw-alias-state-error-primary)}
.mt-pond-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.mt-cast{flex:1 1 320px;min-height:46px;padding:10px 18px;border-radius:12px;cursor:pointer;
  border:1px solid var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-bg-layer-2);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, var(--dsw-alias-bg-layer-1));
  color:var(--dsw-alias-label-primary);font-size:13.5px;font-weight:700;letter-spacing:.02em;touch-action:manipulation;
  box-shadow:0 1px 0 rgba(0,0,0,.06);transition:transform .08s ease,filter .12s ease}
.mt-cast:hover:not(:disabled){filter:brightness(1.06)}
.mt-cast:active{transform:scale(.99);filter:brightness(.96)}
.mt-cast:disabled{cursor:not-allowed;opacity:.55}
.mt-cast.is-hot{background:#e2564d;border-color:#e2564d;color:#fff;box-shadow:0 0 0 3px rgba(226,86,77,.25);
  animation:mt-pulse .5s ease-in-out infinite}
.mt-cast.is-holding{filter:brightness(.94)}
.mt-auto{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mt-root input[type="checkbox"]{accent-color:var(--dsw-alias-brand-primary);width:14px;height:14px;cursor:pointer}
.mt-reel{display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.mt-reel-row{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums}
.mt-reel-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.mt-tension{position:relative;height:10px;border-radius:999px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.mt-tension-band{position:absolute;top:0;bottom:0;background:rgba(90,169,230,.35)}
.mt-tension-mark{position:absolute;top:-3px;width:3px;height:16px;border-radius:2px;background:var(--dsw-alias-label-primary);
  box-shadow:0 0 6px rgba(0,0,0,.45)}
.mt-reel-round{font-size:12px;color:var(--dsw-alias-state-warn-primary)}
.mt-reel-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.mt-message{font-size:12px;color:var(--dsw-alias-state-warn-primary)}
.mt-stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.mt-stat{display:flex;flex-direction:column;gap:2px;padding:8px 12px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px}
.mt-stat span{color:var(--dsw-alias-label-secondary);font-size:11.5px}
.mt-stat strong{font-size:14px;font-variant-numeric:tabular-nums}
.mt-unlock{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;
  border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.mt-unlock-title{font-weight:600;font-size:13px}
.mt-unlock-need{font-size:12px;color:var(--dsw-alias-label-secondary)}
.mt-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin:4px 0 0}
.mt-filters{display:flex;gap:6px;flex-wrap:wrap}
.mt-filter{padding:4px 10px;border-radius:999px;font-size:12px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.mt-root .mt-filter{color:var(--dsw-alias-label-secondary)}
.mt-filter.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-bg-layer-1));font-weight:600}
.mt-group{display:flex;flex-direction:column;gap:8px;min-width:0}
.mt-group-head{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--dsw-alias-label-secondary);min-width:0}
.mt-group-head strong{color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-group-title{margin:8px 0 0;font-size:13px;font-weight:600}
.mt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:10px;min-width:0}
.mt-fishcard{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 8px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);cursor:pointer;text-align:center;
  color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden}
.mt-fishcard:hover{background:var(--dsw-alias-bg-layer-2)}
.mt-fishcard.is-locked{opacity:.85}
.mt-fishcard.is-boss{border-style:dashed}
.mt-fishcard-art{height:78px;display:flex;align-items:center;justify-content:center}
.mt-fishcard-name{font-size:12.5px;font-weight:600}
.mt-fishcard-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums}
.mt-fishcard-hint{font-size:11px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;
  -webkit-box-orient:vertical;overflow:hidden}
.mt-rarity{display:inline-block;padding:0 5px;border:1px solid;border-radius:4px;font-size:10px;line-height:15px;
  font-weight:700;letter-spacing:.04em}
.mt-list{display:flex;flex-direction:column;border-radius:12px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.mt-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);
  min-width:0}
.mt-row:last-child{border-bottom:none}
.mt-row.is-done{opacity:.65}
.mt-row-art{flex:0 0 auto}
.mt-row-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}
.mt-row-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;flex-wrap:wrap}
.mt-row-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.mt-row-side{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}
.mt-price{font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.mt-btn{padding:4px 12px;border-radius:8px;cursor:pointer;font-size:12px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}
.mt-btn:hover:not(:disabled){filter:brightness(1.08)}
.mt-btn:disabled{opacity:.45;cursor:not-allowed}
.mt-btn-primary{background:var(--dsw-alias-bg-layer-2);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, var(--dsw-alias-bg-layer-1));
  border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:700}
.mt-inline-actions{display:flex;gap:8px;flex-wrap:wrap}
.mt-empty{padding:28px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px;
  border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}
.mt-best{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12.5px}
.mt-ach{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.mt-ach-item{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px}
.mt-ach-item span{color:var(--dsw-alias-label-secondary);font-size:11.5px}
.mt-ach-item.is-unlocked{border-color:var(--dsw-alias-state-success-primary)}
.mt-textarea{width:100%;min-height:110px;padding:10px;border-radius:10px;resize:vertical;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1)}
.mt-overlay{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
  padding:20px;background:rgba(10,16,22,.5);backdrop-filter:blur(2px)}
.mt-card{width:min(420px,100%);max-height:calc(100% - 12px);overflow:auto;padding:18px;border-radius:16px;
  background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);
  display:flex;flex-direction:column;gap:8px;text-align:center;animation:mt-pop .22s ease-out}
.mt-card-top{display:flex;align-items:center;justify-content:center;gap:8px}
.mt-card-title{font-size:15px;font-weight:600}
.mt-card-art{display:flex;justify-content:center;padding:6px 0}
.mt-card-meta{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.mt-card-desc{margin:0;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.mt-card-price{font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-state-warn-primary)}
.mt-card-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:4px}
.mt-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:40;
  padding:7px 16px;border-radius:999px;font-size:12.5px;background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.28);animation:mt-pop .2s ease-out}
@keyframes mt-drift{from{transform:translate3d(-3%,0,0) scaleY(1)}to{transform:translate3d(3%,0,0) scaleY(1.04)}}
@keyframes mt-swim{from{left:-18%}to{left:106%}}
@keyframes mt-bob{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-5px)}}
@keyframes mt-dip{0%,100%{transform:translate(-50%,8px)}50%{transform:translate(-50%,16px)}}
@keyframes mt-nibble{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,4px)}}
@keyframes mt-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mt-ring{0%{transform:scale(.72);opacity:.9}100%{transform:scale(1.55);opacity:0}}
@keyframes mt-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.14)}}
@media (max-width:640px){
  .mt-scroll{padding:12px 12px 28px}
  .mt-header{padding:10px 12px}
  .mt-tabs{padding:6px 10px}
}
@media (prefers-reduced-motion:reduce){
  .mt-ripple,.mt-shadow,.mt-float,.mt-bite-tag,.mt-card,.mt-toast,.mt-scene-bite,.mt-target-ring,.mt-splash i{animation:none}
}
`

    const ZH = {
      title: '摸鱼塘',
      subtitle: '边写代码边钓鱼',
      points: '鱼饵',
      pointsHint: '有效 Token ÷ 1000，按今日软上限折算',
      coins: '金币',
      today: '今日积分',
      capReached: '已超软上限，后续按 10%',
      streak: '连续摸鱼',
      tabPond: '鱼塘',
      tabCollection: '图鉴',
      tabShop: '商城',
      tabBasket: '鱼篓',
      tabQuest: '委托',
      tabSettings: '设置',
      releaseToCast: '松手抛竿',
      castingLabel: '抛竿中…',
      waitingBite: '等待咬钩…浮漂下沉时点这里',
      tapNow: '提竿！',
      reeling: '收线中…松手放线',
      holdToReel: '按住收线',
      settling: '结算中…',
      lockedPond: '尚未解锁',
      locked: '未解锁',
      holdToCast: '按住蓄力抛竿',
      tension: '张力',
      progress: '进度',
      round: '回合',
      reelHint: '鱼挣扎时松手放线，鱼累了按住收线；张力超过上限会断线。',
      storm: '雷雨',
      sunny: '晴天',
      deepDive: '深潜',
      autoMode: '挂机钓鱼',
      autoRunning: '挂机中',
      autoIdle: '挂机未开',
      autoCaught: '已钓',
      autoMissed: '空军',
      autoStart: '开始挂机',
      autoStop: '停止挂机',
      openPond: '打开鱼塘',
      autoHint: 'Agent 长时间工作时自动抛竿，成功率 60%。',
      ready: '条件已满足',
      unlockFor: '解锁花费',
      unlockedToast: '已解锁',
      todayCast: '今日抛竿',
      todayCatch: '今日收获',
      todayBest: '今日最佳',
      pondFavor: '鱼塘好感',
      privacyNote: '游戏数据只存在本机；插件只读取 Token 数量，不读取对话内容，也不发送任何网络请求。',
      newEntry: '新图鉴',
      newRecord: '新纪录',
      shinyTag: '闪光',
      fatTag: '肥美',
      normalTag: '普通',
      keep: '放入鱼篓',
      sell: '卖出',
      release: '放生',
      notSellable: '传说鱼，仅收藏',
      close: '关闭',
      collectionProgress: '已点亮',
      allPonds: '全部鱼塘',
      maxSizeRecord: '最大',
      caughtCount: '捕获',
      firstCaught: '首次捕获',
      lockedHint: '还没人见过它，试着在提示的条件下抛竿。',
      shopRod: '鱼竿',
      shopLine: '浮漂与线',
      shopBait: '鱼饵',
      shopDecor: '装饰',
      buy: '购买',
      equip: '装备',
      equipped: '已装备',
      free: '免费',
      owned: '已拥有',
      noCoins: '金币不够',
      bought: '已购买',
      hide: '收起',
      show: '摆放',
      basketEmpty: '鱼篓是空的，去鱼塘抛一竿。',
      totalValue: '总价值',
      sellAll: '全部卖出',
      releaseAll: '全部放生',
      releasedAll: '已全部放生',
      releasedOne: '放生成功，好感 +1',
      soldAll: '卖出成功',
      questsTitle: '每日委托',
      questClaim: '领取',
      questClaimed: '已领取',
      claimedToast: '委托奖励到账',
      achievementsTitle: '成就',
      dataSource: 'Token 数据源',
      dataOnline: 'Host 半正在统计 Token 用量',
      dataOffline: '未连上 Host 半，暂时拿不到新的鱼饵积分',
      hostPulse: 'Host 最近一次收到会话事件',
      hostReattach: '监听器自动重连',
      never: '从未',
      lastSync: '上次同步',
      online: '在线',
      offline: '离线',
      reduceMotion: '减弱动画',
      reduceMotionHint: '关闭水面与鱼群的持续动画。',
      manual: '体验模式结算',
      manualHint: '数据源离线时可手动 +5 鱼饵，仅用于试用。',
      saveTitle: '存档',
      exportSave: '复制存档',
      showSave: '显示存档',
      resetSave: '重置存档',
      resetToast: '存档已重置',
      importHint: '粘贴导出过的存档 JSON，然后点“导入存档”。',
      doImport: '导入存档',
      importedToast: '导入成功，正在刷新…',
      badSave: '存档格式不对',
      copyToast: '存档已复制到剪贴板',
      exportToast: '存档已显示在下方',
      privacyShort: '本地存档',
      offlineBanner: '暂时连不上 Host 半（/moyutang-api），新的 Token 还没有变成鱼饵积分。',
    }

    const EN = {
      title: 'Moyutang',
      subtitle: 'Fish while the agent works',
      points: 'bait',
      pointsHint: 'Effective tokens ÷ 1000, subject to today’s soft cap',
      coins: 'coins',
      today: 'Today',
      capReached: 'soft cap used up, 10% from here',
      streak: 'Streak',
      tabPond: 'Pond',
      tabCollection: 'Field guide',
      tabShop: 'Shop',
      tabBasket: 'Creel',
      tabQuest: 'Quests',
      tabSettings: 'Settings',
      releaseToCast: 'Release to cast',
      castingLabel: 'Casting…',
      waitingBite: 'Waiting for a bite… tap when the float goes down',
      tapNow: 'Strike!',
      reeling: 'Reeling in… release to give line',
      holdToReel: 'Hold to reel',
      settling: 'Settling…',
      lockedPond: 'Locked',
      locked: 'Locked',
      holdToCast: 'Hold to charge the cast',
      tension: 'Tension',
      progress: 'Progress',
      round: 'Round',
      reelHint: 'Give line while it fights, reel while it tires. Too much tension snaps the line.',
      storm: 'Thunderstorm',
      sunny: 'Clear',
      deepDive: 'Deep dive',
      autoMode: 'Auto fishing',
      autoRunning: 'Fishing',
      autoIdle: 'Auto off',
      autoCaught: 'caught',
      autoMissed: 'missed',
      autoStart: 'Start',
      autoStop: 'Stop',
      openPond: 'Open pond',
      autoHint: 'Casts on its own while the agent works, 60% success.',
      ready: 'Requirements met',
      unlockFor: 'Unlock for',
      unlockedToast: 'Unlocked',
      todayCast: 'Casts today',
      todayCatch: 'Caught today',
      todayBest: 'Best today',
      pondFavor: 'Pond favor',
      privacyNote: 'The save stays on this machine. The plugin reads token counts only, never conversation text, and makes no network request.',
      newEntry: 'New entry',
      newRecord: 'New record',
      shinyTag: 'Shiny',
      fatTag: 'Fat',
      normalTag: 'Normal',
      keep: 'Keep',
      sell: 'Sell',
      release: 'Release',
      notSellable: 'Legendary — collection only',
      close: 'Close',
      collectionProgress: 'Discovered',
      allPonds: 'All ponds',
      maxSizeRecord: 'Best',
      caughtCount: 'Caught',
      firstCaught: 'First caught',
      lockedHint: 'Nobody has seen it yet. Try the conditions in the hint.',
      shopRod: 'Rods',
      shopLine: 'Floats and line',
      shopBait: 'Bait',
      shopDecor: 'Decorations',
      buy: 'Buy',
      equip: 'Equip',
      equipped: 'Equipped',
      free: 'Free',
      owned: 'Owned',
      noCoins: 'Not enough coins',
      bought: 'Bought',
      hide: 'Hide',
      show: 'Place',
      basketEmpty: 'The creel is empty. Go cast a line.',
      totalValue: 'Value',
      sellAll: 'Sell all',
      releaseAll: 'Release all',
      releasedAll: 'All released',
      releasedOne: 'Released, favor +1',
      soldAll: 'Sold',
      questsTitle: 'Daily quests',
      questClaim: 'Claim',
      questClaimed: 'Claimed',
      claimedToast: 'Reward collected',
      achievementsTitle: 'Achievements',
      dataSource: 'Token source',
      dataOnline: 'The Host half is counting token usage',
      dataOffline: 'Host half unreachable, no new bait points for now',
      hostPulse: 'Last session event the Host counted',
      hostReattach: 'Listener auto re-attached',
      never: 'never',
      lastSync: 'Synced',
      online: 'Online',
      offline: 'Offline',
      reduceMotion: 'Reduce motion',
      reduceMotionHint: 'Stops the continuous water and fish animation.',
      manual: 'Manual credit',
      manualHint: 'Adds 5 bait while the data source is offline, for trying it out.',
      saveTitle: 'Save data',
      exportSave: 'Copy save',
      showSave: 'Show save',
      resetSave: 'Reset save',
      resetToast: 'Save reset',
      importHint: 'Paste an exported save JSON, then press Import.',
      doImport: 'Import save',
      importedToast: 'Imported, reloading…',
      badSave: 'That save does not parse',
      copyToast: 'Save copied to the clipboard',
      exportToast: 'Save shown below',
      privacyShort: 'local save',
      offlineBanner: 'Cannot reach the Host half (/moyutang-api) yet, so new tokens are not turning into bait.',
    }

    function WaterMark() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: 12, cy: 12, r: 11, fill: '#2f7d8c', opacity: 0.18 }),
        h('path', {
          d: 'M16 12c-1-2-3-3-5-3-3 0-5 1.6-5 3s2 3 5 3c2 0 4-1 5-3l3 2-.5-2 .5-2z',
          fill: '#f08a3c',
        }),
        h('circle', { cx: 8, cy: 11.4, r: 0.9, fill: '#0e1a22' }),
      )
    }

    function SidebarIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 20
      const active = Boolean(props && props.active)
      return h(
        'svg',
        {
          viewBox: '0 0 32 32',
          width: size,
          height: size,
          'aria-hidden': true,
          style: { display: 'block', opacity: active ? 1 : 0.82 },
        },
        h('circle', { cx: 16, cy: 16, r: 15, fill: active ? '#2f7d8c' : 'rgba(47,125,140,.22)' }),
        h('path', {
          d: 'M21 15.6c-1.2-2.4-3.5-3.8-6.1-3.8-3.7 0-6.4 2-6.4 4.2s2.7 4.2 6.4 4.2c2.6 0 4.9-1.4 6.1-3.8l3.4 2.4-.6-2.8.6-2.8z',
          fill: '#f0a34a',
        }),
        h('circle', { cx: 11.2, cy: 15.2, r: 1.2, fill: '#10202a' }),
        h('path', { d: 'M6 25.4c1.6 1.1 3.4 1.6 5.2 1.6', stroke: '#8fd4e8', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' }),
      )
    }

    function buildTranslator(localeService) {
      return function translate(key) {
        let active = 'zh-CN'
        try {
          const snapshot = localeService && localeService.getLocale ? localeService.getLocale() : null
          if (snapshot && snapshot.active) active = snapshot.active
        } catch {}
        const dict = String(active).toLowerCase().startsWith('zh') ? ZH : EN
        return dict[key] || ZH[key] || key
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        let localeService = null
        try {
          localeService = ctx.get ? ctx.get('locale') : ctx.locale
        } catch {}
        if (!localeService) {
          try {
            localeService = ctx.locale || null
          } catch {}
        }
        if (localeService && typeof localeService.register === 'function') {
          for (const [id, dict] of [
            ['zh-CN', ZH],
            ['en', EN],
          ]) {
            try {
              ctx.effect(() => localeService.register('moyutang', id, dict), `moyutang:locale:${id}`)
            } catch (error) {
              console.error('[moyutang] locale registration failed', error)
            }
          }
        }
        const t = buildTranslator(localeService)
        let layout = null
        try {
          layout = ctx.get ? ctx.get('layout') : null
        } catch {}
        const runtime = { t, locale: localeService, layout }

        const PanelSeat = () =>
          h(RuntimeContext.Provider, { value: runtime }, h(PanelBoundary, null, h(MoyutangPanel)))

        const DockSeat = () =>
          h(RuntimeContext.Provider, { value: runtime }, h(DockBoundary, null, h(AutoDock)))

        const registerIcon = () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'moyutang',
              order: 30,
              label: () => {
                try {
                  return t('title')
                } catch {
                  return '摸鱼塘'
                }
              },
            },
            SidebarIcon,
          )

        const registerPanel = () => ctx.slots.register({ name: 'main', key: 'moyutang' }, PanelSeat)

        const registerDock = () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'moyutang-auto', order: 2, label: () => t('autoMode') },
            DockSeat,
          )

        ctx.slots.inject('sidebar.panellist', registerIcon)
        ctx.slots.inject('main', registerPanel)
        ctx.slots.inject('conversation.composer.dock', registerDock)
      },
    }
  },
})
