// 剧情与装饰天气；接口暂缺时提供随季节变化的装饰天气，不联网、不反向写入剧情。
export function readLockWeather(api = globalThis.STSevenDaysCal, now = new Date()) {
  if (api?.apiVersion === 1 && typeof api.getPhoneSnapshot === 'function') {
    const snapshot = api.getPhoneSnapshot();
    if (snapshot?.weather?.text) return { text: String(snapshot.weather.text), temperature: String(snapshot.weather.temperature || ''), source: 'gouhua' };
  }
  const month = (now instanceof Date && !isNaN(now)) ? now.getMonth() + 1 : 10;
  const seasonal = month >= 3 && month <= 5 ? { text: '晴', temperature: '18°C' }
    : month >= 6 && month <= 8 ? { text: '晴朗', temperature: '28°C' }
    : month >= 9 && month <= 11 ? { text: '晴', temperature: '22°C' }
    : { text: '晴冷', temperature: '6°C' };
  return { ...seasonal, source: 'decoration' };
}
