// This file will be processed by Vite for the renderer process
document.addEventListener("DOMContentLoaded", function () {
	// Display versions
	const electronVersion = document.getElementById("electron-version");
	const chromeVersion = document.getElementById("chrome-version");
	const nodeVersion = document.getElementById("node-version");

	if (electronVersion) {
		electronVersion.textContent = process.versions.electron || "N/A";
	}
	if (chromeVersion) {
		chromeVersion.textContent = process.versions.chrome || "N/A";
	}
	if (nodeVersion) {
		nodeVersion.textContent = process.versions.node || "N/A";
	}

	console.log("Renderer process loaded successfully");
});
