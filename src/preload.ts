import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	// Add any APIs you want to expose to the renderer process
	getVersion: () => process.versions.electron,
	getPlatform: () => process.platform,
});

// Remove this line if you don't want to expose Node.js globals
window.addEventListener("DOMContentLoaded", () => {
	const replaceText = (selector: string, text: string) => {
		const element = document.getElementById(selector);
		if (element) element.innerText = text;
	};

	for (const dependency of ["chrome", "node", "electron"]) {
		replaceText(
			`${dependency}-version`,
			process.versions[dependency] || ""
		);
	}
});
