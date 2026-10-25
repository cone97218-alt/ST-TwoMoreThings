import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhoneTime } from '../src/time.js';

const now = new Date('2026-10-18T09:37:00');
const floor = (namespace, time = '22:15', date = '大陆历1686年10月4日', weekday = '周二') => ({
  is_user: false,
  mes: `<!-- ${namespace}-start | date=${date} | weekday=${weekday} | time=21:00 -->正文<!-- ${namespace}-end | date=${date} | weekday=${weekday} | time=${time} -->`,
});

for (const namespace of ['QQJ', 'SDC', 'myknots']) test(`uses ${namespace} end time without converting the story calendar`, () => {
  assert.deepEqual(readPhoneTime([floor(namespace)], now), { source: 'story', date: '大陆历1686年10月4日', weekday: '周二', time: '22:15' });
});

test('reads the latest AI floor and ignores user/system timestamps', () => {
  const messages = [floor('QQJ', '18:10'), floor('SDC', '23:58'), { ...floor('QQJ', '01:00'), is_user: true }, { ...floor('QQJ', '02:00'), is_system: true }];
  assert.equal(readPhoneTime(messages, now).time, '23:58');
  messages.push({ is_user: false, mes: '本楼没有时间戳。' });
  assert.equal(readPhoneTime(messages, now).source, 'real', '不拿旧楼时间冒充新楼时间');
  assert.equal(readPhoneTime(messages, now).time, '09:37');
});

test('keeps a known clock when the date or weekday is not established', () => {
  assert.deepEqual(readPhoneTime([floor('QQJ', '07:25', '未知', '未知')], now), { source: 'story', date: '', weekday: '', time: '07:25' });
});

test('normalizes a full-width or twelve-hour clock and falls back for an unreadable clock', () => {
  assert.equal(readPhoneTime([floor('SDC', '下午８：０５')], now).time, '20:05');
  for (const time of ['25:10', '22:77', '深夜', '未知']) assert.equal(readPhoneTime([floor('QQJ', time)], now).source, 'real');
  assert.equal(readPhoneTime([], now).time, '09:37');
});

test('reads official BBS endpoints including attributes, case and internal whitespace', () => {
  const messages = [{ is_user: false, mes: '<BBS_START data-source="story">\n2031/4/8 09:10\n</BBS_START>正文<bbs_end> 2031/4/8 09:30 </bbs_end>' }];
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '2031/4/8', weekday: '', time: '09:30' });
  messages[0].mes = '<bbs_start>大陆历1686年10月4日  下午８：０５</bbs_start>正文';
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '大陆历1686年10月4日', weekday: '', time: '20:05' });
});

test('mixed timestamp sources use the last end in the latest AI floor, or its last start', () => {
  const messages = [{ is_user: false, mes: `${floor('QQJ').mes}<bbs_end>2031/4/8 09:30</bbs_end><!-- SDC-start | date=后来 | time=10:00 -->` }];
  assert.equal(readPhoneTime(messages, now).time, '09:30');
  messages[0].mes += '<!-- myknots-end | date=之后 | weekday=周三 | time=11:00 -->';
  assert.deepEqual(readPhoneTime(messages, now), { source: 'story', date: '之后', weekday: '周三', time: '11:00' });
  messages[0].mes = '<!-- QQJ-start | date=之前 | time=08:00 --><bbs_start>2031/4/8 09:10</bbs_start>';
  assert.equal(readPhoneTime(messages, now).time, '09:10');
  messages.push({ is_user: false, mes: '<bbs_end>2031/4/8 25:10</bbs_end>' });
  assert.equal(readPhoneTime(messages, now).source, 'real');
});

test('reads BaiBaiBook summary-only bbs_leaf and STBaiBaiBook state time when正文 has no inline tags', async () => {
  const { readTimeline } = await import('../src/timeline.js');
  const messages = [
    {
      is_user: false,
      mes: '第38楼正文，无内联时间标签。',
      extra: {
        bbs_leaf: {
          timeStart: '2026/5/21 21:15',
          timeEnd: '2026/5/22 09:42',
          delta: { time: '2026/5/22 09:42' },
        },
      },
    },
    {
      is_user: false,
      mes: '第39楼最新正文，尚未生成本楼leaf但属于同一柏宝书时间流。',
    },
  ];
  assert.deepEqual(readPhoneTime(messages, now), {
    source: 'story',
    date: '2026/5/22',
    weekday: '',
    time: '09:42',
  });
  const timeline = readTimeline(messages);
  assert.deepEqual(timeline.clock, {
    source: 'story',
    date: '2026/5/22',
    weekday: '',
    time: '09:42',
  });
  assert.equal(timeline.key, '[1,"2026/5/22","09:42"]');
});

test('reads <top_format> ✧时间|地点|天气✧ bars and picks the last one when multiple exist in one AI reply', () => {
  const multiBarFloor = {
    is_user: false,
    mes: [
      '✧2026年5月22日 09:42 星期五|三亚市 - 吉阳区 - 露天草坪|阳光热烈✧',
      '第一段剧情。',
      '✧2026年5月22日 10:05 星期五|三亚市 - 吉阳区 - 露天草坪|日头升高✧',
      '第二段剧情。',
      '✧2026年5月22日 10:45 星期五|三亚市 - 吉阳区 - 露天草坪 → 一楼楼梯拐角|日头毒辣✧',
      '第三段剧情。',
    ].join('\n'),
  };
  assert.deepEqual(readPhoneTime([multiBarFloor], now), {
    source: 'story',
    date: '2026年5月22日',
    weekday: '星期五',
    time: '10:45',
  });

  const fantasyBarFloor = {
    is_user: false,
    mes: '✧第1年 春 1日 06:00 星期一|橡果镇 - 牧场 - 农舍前|微风吹拂着晴朗的蓝天✧\n牧场清晨。',
  };
  assert.deepEqual(readPhoneTime([fantasyBarFloor], now), {
    source: 'story',
    date: '第1年 春 1日',
    weekday: '星期一',
    time: '06:00',
  });

  const ancientBarFloor = {
    is_user: false,
    mes: '✧永昭三年五月廿二日 小满 午时|皇宫 - 御花园 - 牡丹亭|微风和煦✧\n亭中饮茶。',
  };
  assert.deepEqual(readPhoneTime([ancientBarFloor], now), {
    source: 'story',
    date: '永昭三年五月廿二日 小满',
    weekday: '午时',
    time: '12:00',
  });
});
