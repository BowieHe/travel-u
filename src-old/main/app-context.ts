import { BrowserWindow, BrowserView } from "electron";

/**
 * 统一的应用上下文，用于管理全局状态，如窗口和视图。
 * 采用单例模式确保全局只有一个实例。
 */
export class AppContext {
	private static instance: AppContext;

	public mainWindow: BrowserWindow | null = null;
	public browserView: BrowserView | null = null;

	private constructor() {
		// 私有构造函数，防止外部实例化
	}

	/**
	 * 获取 AppContext 的单例实例。
	 * @returns {AppContext} AppContext 的唯一实例。
	 */
	public static getInstance(): AppContext {
		if (!AppContext.instance) {
			AppContext.instance = new AppContext();
		}
		return AppContext.instance;
	}
}
