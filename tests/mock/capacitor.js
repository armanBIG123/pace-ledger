/* eslint-disable */
const noop = async () => ({});
const plugin = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : (...a) => (k === 'addListener' ? Promise.resolve({ remove() {} }) : Promise.resolve({}))) });
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', isPluginAvailable: () => false, convertFileSrc: s => s };
export const registerPlugin = () => plugin;
export const LocalNotifications = plugin;
export const Filesystem = plugin;
export const Directory = { Documents: 'DOCUMENTS', Cache: 'CACHE', Data: 'DATA' };
export const Encoding = { UTF8: 'utf8' };
export const App = plugin;
export const Browser = { open: async ({ url }) => { window.__PL && (window.__PL.opened = (window.__PL.opened || []).concat(url)); } };
export const Share = plugin;
export const SplashScreen = plugin;
export const StatusBar = plugin;
export const Style = { Dark: 'DARK', Light: 'LIGHT' };
export default {};
